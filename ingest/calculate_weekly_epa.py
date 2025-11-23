"""
Vectorized weekly EPA calculation and batched update to GameStat.

Usage:
    python calculate_weekly_epa_vectorized.py 2025
"""
import os
import sys
from dotenv import load_dotenv
import psycopg2
from psycopg2 import sql
from psycopg2.extras import execute_batch
import nflreadpy as nfl
import polars as pl
import polars as pl

load_dotenv()

def safe_float(x):
    return float(x) if x is not None and x == x else None

def calculate_weekly_epa(year):
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    try:
        pbp = nfl.load_pbp(year)
    except Exception as e:
        print(f"[ERROR] Error fetching PBP data for {year}: {e}")
        cur.close()
        conn.close()
        return
    if pbp is None or pbp.height == 0:
        print(f"No play-by-play data for {year}")
        cur.close()
        conn.close()
        return
    # Fetch all players and build pfr_id -> player dict
    cur.execute("SELECT id, pfr_id, name FROM \"Player\" WHERE pfr_id IS NOT NULL")
    players = cur.fetchall()
    players_by_pfr = {pfr_id: {"id": pid, "name": name} for pid, pfr_id, name in players if pfr_id}

    # Fetch current GameStat player-week combinations for the season
    cur.execute("""
        SELECT DISTINCT gs."playerId", p.pfr_id, gs.week
        FROM "GameStat" gs
        JOIN "Player" p ON gs."playerId" = p.id
        WHERE gs.season = %s AND gs.week IS NOT NULL AND p.pfr_id IS NOT NULL
        ORDER BY gs."playerId", gs.week
    """, (year,))
    player_weeks = cur.fetchall()
    player_week_set = set((pw[0], pw[2]) for pw in player_weeks)  # (playerId, week)
    print(f"Processing {len(player_weeks)} player-week combinations (existing GameStat rows)")

    print(f"Got {len(pbp)} plays")

    # Ensure relevant columns exist and normalize types
    for col in ['week', 'epa', 'success', 'pass_attempt', 'rush_attempt',
                'passer_player_id', 'rusher_player_id', 'receiver_player_id']:
        if col not in pbp.columns:
            pbp = pbp.with_columns(pl.lit(None).alias(col))
    pbp = pbp.with_columns([
        pl.col('success').cast(pl.Float64).fill_null(0).cast(pl.Int64),
        pl.col('pass_attempt').cast(pl.Boolean),
        pl.col('rush_attempt').cast(pl.Boolean)
    ])

    # --- GROUPED AGGREGATIONS (vectorized) ---
    # Passing (group by passer_player_id, week)
    passing_df = (
        pbp.filter(pl.col('pass_attempt') == True)
           .groupby(['passer_player_id', 'week'])
           .agg([
               pl.col('epa').sum().alias('passing_epa'),
               pl.col('epa').count().alias('passing_count'),
               pl.col('success').sum().alias('passing_success')
           ])
           .rename({'passer_player_id': 'pfr_id'})
    )

    # Rushing (group by rusher_player_id, week)
    rushing_df = (
        pbp.filter(pl.col('rush_attempt') == True)
           .groupby(['rusher_player_id', 'week'])
           .agg([
               pl.col('epa').sum().alias('rushing_epa'),
               pl.col('epa').count().alias('rushing_count'),
               pl.col('success').sum().alias('rushing_success')
           ])
           .rename({'rusher_player_id': 'pfr_id'})
    )

    # Receiving (passes where receiver_player_id matches)
    receiving_df = (
        pbp.filter(pl.col('pass_attempt') == True)
           .groupby(['receiver_player_id', 'week'])
           .agg([
               pl.col('epa').sum().alias('receiving_epa'),
               pl.col('epa').count().alias('receiving_count'),
               pl.col('success').sum().alias('receiving_success')
           ])
           .rename({'receiver_player_id': 'pfr_id'})
    )

    # Merge the three dataframes on (pfr_id, week) using outer join so we capture any role combinations
    merged = passing_df.join(rushing_df, on=['pfr_id', 'week'], how='outer').join(receiving_df, on=['pfr_id', 'week'], how='outer')
    # Fill missing count/success columns with 0
    for c in ['passing_count', 'passing_success', 'rushing_count', 'rushing_success', 'receiving_count', 'receiving_success']:
        if c in merged.columns:
            merged = merged.with_columns(pl.col(c).fill_null(0).cast(pl.Int64))
    # Ensure epa columns exist
    for c in ['passing_epa', 'rushing_epa', 'receiving_epa']:
        if c not in merged.columns:
            merged = merged.with_columns(pl.lit(None).alias(c))
    # Compute per-play and success rate metrics
    merged = merged.with_columns([
        (pl.col('passing_epa') / pl.col('passing_count')).alias('passing_epa_per_play'),
        (pl.col('rushing_epa') / pl.col('rushing_count')).alias('rushing_epa_per_play'),
        (pl.col('receiving_epa') / pl.col('receiving_count')).alias('receiving_epa_per_play'),
        (pl.col('passing_success') / pl.col('passing_count') * 100).alias('passing_success_rate'),
        (pl.col('rushing_success') / pl.col('rushing_count') * 100).alias('rushing_success_rate'),
        (pl.col('receiving_success') / pl.col('receiving_count') * 100).alias('receiving_success_rate'),
        (pl.col('passing_count') + pl.col('rushing_count') + pl.col('receiving_count')).alias('total_plays'),
        (pl.col('passing_epa').fill_null(0) + pl.col('rushing_epa').fill_null(0) + pl.col('receiving_epa').fill_null(0)).alias('total_epa'),
        (pl.col('passing_success') + pl.col('rushing_success') + pl.col('receiving_success')).alias('total_success'),
        ((pl.col('passing_success') + pl.col('rushing_success') + pl.col('receiving_success')) / (pl.col('passing_count') + pl.col('rushing_count') + pl.col('receiving_count')) * 100).alias('success_rate')
    ])
    # Set total_epa to null where total_plays == 0
    merged = merged.with_columns([
        pl.when(pl.col('total_plays') == 0).then(None).otherwise(pl.col('total_epa')).alias('total_epa')
    ])

    # Map pfr_id -> internal playerId (from Player table) so we update GameStat rows
    # players_by_pfr is mapping pfr -> {id, name, ...}
    pfr_to_playerid = {pfr: data['id'] for pfr, data in players_by_pfr.items()}
    merged = merged.with_columns([
        pl.col('pfr_id').apply(lambda x: pfr_to_playerid.get(x, None)).alias('player_id')
    ])
    merged = merged.filter(pl.col('player_id').is_not_null())
    merged = merged.with_columns([
        pl.col('player_id').cast(pl.Int64)
    ])
    merged = merged.with_columns([
        pl.struct(['player_id', 'week']).apply(lambda t: (t['player_id'], t['week'])).alias('player_week_tuple')
    ])
    merged = merged.filter(pl.col('player_week_tuple').is_in(player_week_set))
    merged = merged.drop('player_week_tuple')
    print(f"\nWill update {merged.height} player-week EPA rows (after filtering to GameStat rows).")
    # Build update records list
    def to_update_row(r):
        return {
            'player_id': int(r['player_id']),
            'week': int(r['week']),
            'year': int(year),
            'passing_epa': safe_float(r['passing_epa']),
            'passing_epa_per_play': safe_float(r['passing_epa_per_play']),
            'passing_success_rate': safe_float(r['passing_success_rate']),
            'rushing_epa': safe_float(r['rushing_epa']),
            'rushing_epa_per_play': safe_float(r['rushing_epa_per_play']),
            'rushing_success_rate': safe_float(r['rushing_success_rate']),
            'receiving_epa': safe_float(r['receiving_epa']),
            'receiving_epa_per_play': safe_float(r['receiving_epa_per_play']),
            'receiving_success_rate': safe_float(r['receiving_success_rate']),
            'epa': safe_float(r['total_epa']),
            'success_rate': safe_float(r['success_rate']),
        }
    updates = [to_update_row(r) for r in merged.to_dicts()]

    # --- Batch update GameStat rows ---
    print(f"\nUpdating {len(updates)} weekly GameStat records with EPA (batched)...")
    if updates:
        update_sql = """
            UPDATE "GameStat"
            SET 
                passing_epa = %(passing_epa)s,
                passing_epa_per_play = %(passing_epa_per_play)s,
                passing_success_rate = %(passing_success_rate)s,
                rushing_epa = %(rushing_epa)s,
                rushing_epa_per_play = %(rushing_epa_per_play)s,
                rushing_success_rate = %(rushing_success_rate)s,
                receiving_epa = %(receiving_epa)s,
                receiving_epa_per_play = %(receiving_epa_per_play)s,
                receiving_success_rate = %(receiving_success_rate)s,
                epa = %(epa)s,
                success_rate = %(success_rate)s
            WHERE "playerId" = %(player_id)s 
              AND season = %(year)s 
              AND week = %(week)s
        """
        # execute_batch reduces round trips substantially
        execute_batch(cur, update_sql, updates, page_size=500)
        conn.commit()
        print("[OK] Batch update complete.")
    else:
        print("[OK] No updates to write.")

    # --- Verification (same as before) ---
    print("\n[INFO] Verifying weekly EPA sums match season EPA (sample up to 5 mismatches)...")
    cur.execute(f"""
        SELECT 
            p.name, p.pfr_id,
            am.rushing_epa as season_rushing_epa,
            SUM(gs.rushing_epa) as weekly_rushing_epa_sum,
            am.receiving_epa as season_receiving_epa,
            SUM(gs.receiving_epa) as weekly_receiving_epa_sum
        FROM "GameStat" gs
        JOIN "Player" p ON gs."playerId" = p.id
        JOIN "AdvancedMetrics" am ON am."playerId" = p.id AND am.season = gs.season
        WHERE gs.season = %s AND gs.week IS NOT NULL
        GROUP BY p.name, p.pfr_id, am.rushing_epa, am.receiving_epa
        HAVING ABS(COALESCE(am.rushing_epa, 0) - COALESCE(SUM(gs.rushing_epa), 0)) > 0.1
           OR ABS(COALESCE(am.receiving_epa, 0) - COALESCE(SUM(gs.receiving_epa), 0)) > 0.1
        LIMIT 5
    """, (year,))
    mismatches = cur.fetchall()
    if mismatches:
        print(f"[WARNING] Found {len(mismatches)} players with EPA mismatches:")
        for row in mismatches:
            name, pfr_id, season_rush, weekly_rush, season_rec, weekly_rec = row
            season_rush = season_rush or 0
            weekly_rush = weekly_rush or 0
            season_rec = season_rec or 0
            weekly_rec = weekly_rec or 0
            print(f"  {name}: Season Rush EPA={season_rush:.2f} vs Weekly Sum={weekly_rush:.2f}, Season Rec EPA={season_rec:.2f} vs Weekly Sum={weekly_rec:.2f}")
    else:
        print("[OK] All weekly EPA values sum correctly to season EPA!")

    cur.close()
    conn.close()


if __name__ == "__main__":
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    calculate_weekly_epa(year)
