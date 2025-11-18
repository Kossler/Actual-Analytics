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
import nfl_data_py as nfl
import pandas as pd
import numpy as np

load_dotenv()

def safe_float(x):
    return float(x) if x is not None and not (pd.isna(x)) else None

def calculate_weekly_epa(year):
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()

    print(f"\n[INFO] Calculating weekly EPA for {year} (vectorized)...")

    # --- Load players (pfr -> player id) and existing player-week GameStat rows ---
    cur.execute('SELECT "id", "name", "position", "pfr_id" FROM "Player" WHERE "pfr_id" IS NOT NULL')
    player_rows = cur.fetchall()
    players_by_pfr = {row[3]: {'id': row[0], 'name': row[1], 'position': row[2]} for row in player_rows if row[3]}
    print(f"Found {len(players_by_pfr)} players with pfr_id")

    # Fetch current GameStat player-week combinations for the season
    cur.execute(f"""
        SELECT DISTINCT gs."playerId", p.pfr_id, gs.week
        FROM "GameStat" gs
        JOIN "Player" p ON gs."playerId" = p.id
        WHERE gs.season = %s AND gs.week IS NOT NULL AND p.pfr_id IS NOT NULL
        ORDER BY gs."playerId", gs.week
    """, (year,))
    player_weeks = cur.fetchall()
    player_week_set = set((pw[0], pw[2]) for pw in player_weeks)  # (playerId, week)
    print(f"Processing {len(player_weeks)} player-week combinations (existing GameStat rows)")

    # --- Import play-by-play data ---
    print(f"\nFetching play-by-play data for {year}...")
    try:
        pbp = nfl.import_pbp_data([year])
    except Exception as e:
        print(f"[ERROR] Error fetching PBP data for {year}: {e}")
        cur.close()
        conn.close()
        return

    if pbp is None or pbp.empty:
        print(f"No play-by-play data for {year}")
        cur.close()
        conn.close()
        return

    print(f"Got {len(pbp)} plays")

    # Ensure relevant columns exist and normalize types
    for col in ['week', 'epa', 'success', 'pass_attempt', 'rush_attempt',
                'passer_player_id', 'rusher_player_id', 'receiver_player_id']:
        if col not in pbp.columns:
            pbp[col] = np.nan

    # Convert boolean-like columns cleanly
    # Some datasets use True/False, some 1/0, some NaN. Use .astype('boolean') then to numeric where needed.
    # For grouping sums, convert 'success' to numeric (0/1)
    pbp['success'] = pd.to_numeric(pbp['success'], errors='coerce').fillna(0).astype(int)
    pbp['pass_attempt'] = pbp['pass_attempt'].astype(bool, errors='ignore')
    pbp['rush_attempt'] = pbp['rush_attempt'].astype(bool, errors='ignore')

    # --- GROUPED AGGREGATIONS (vectorized) ---
    # Passing (group by passer_player_id, week)
    passing_mask = pbp['pass_attempt'] == True
    passing_df = (
        pbp.loc[passing_mask, ['passer_player_id', 'week', 'epa', 'success']]
           .groupby(['passer_player_id', 'week'], dropna=False)
           .agg(
               passing_epa=('epa', 'sum'),
               passing_count=('epa', 'size'),
               passing_success=('success', 'sum')
           )
           .reset_index()
           .rename(columns={'passer_player_id': 'pfr_id'})
    )

    # Rushing (group by rusher_player_id, week)
    rushing_mask = pbp['rush_attempt'] == True
    rushing_df = (
        pbp.loc[rushing_mask, ['rusher_player_id', 'week', 'epa', 'success']]
           .groupby(['rusher_player_id', 'week'], dropna=False)
           .agg(
               rushing_epa=('epa', 'sum'),
               rushing_count=('epa', 'size'),
               rushing_success=('success', 'sum')
           )
           .reset_index()
           .rename(columns={'rusher_player_id': 'pfr_id'})
    )

    # Receiving (passes where receiver_player_id matches)
    receiving_mask = pbp['pass_attempt'] == True
    receiving_df = (
        pbp.loc[receiving_mask, ['receiver_player_id', 'week', 'epa', 'success']]
           .groupby(['receiver_player_id', 'week'], dropna=False)
           .agg(
               receiving_epa=('epa', 'sum'),
               receiving_count=('epa', 'size'),
               receiving_success=('success', 'sum')
           )
           .reset_index()
           .rename(columns={'receiver_player_id': 'pfr_id'})
    )

    # Merge the three dataframes on (pfr_id, week) using outer join so we capture any role combinations
    merged = passing_df.merge(rushing_df, on=['pfr_id', 'week'], how='outer') \
                       .merge(receiving_df, on=['pfr_id', 'week'], how='outer')

    # Clean up index, replace NaNs where counts/success should be zeros (counts/success -> 0, epa -> NaN)
    count_cols = ['passing_count', 'passing_success', 'rushing_count', 'rushing_success', 'receiving_count', 'receiving_success']
    for c in count_cols:
        if c in merged.columns:
            merged[c] = merged[c].fillna(0).astype(int)

    # Ensure epa columns exist
    for c in ['passing_epa', 'rushing_epa', 'receiving_epa']:
        if c not in merged.columns:
            merged[c] = np.nan

    # Compute per-play and success rate metrics vectorized
    # per-play: epa / count if count>0 else NaN
    merged['passing_epa_per_play'] = np.where(merged['passing_count'] > 0,
                                              merged['passing_epa'] / merged['passing_count'],
                                              np.nan)
    merged['rushing_epa_per_play'] = np.where(merged['rushing_count'] > 0,
                                              merged['rushing_epa'] / merged['rushing_count'],
                                              np.nan)
    merged['receiving_epa_per_play'] = np.where(merged['receiving_count'] > 0,
                                               merged['receiving_epa'] / merged['receiving_count'],
                                               np.nan)

    merged['passing_success_rate'] = np.where(merged['passing_count'] > 0,
                                              merged['passing_success'] / merged['passing_count'] * 100,
                                              np.nan)
    merged['rushing_success_rate'] = np.where(merged['rushing_count'] > 0,
                                              merged['rushing_success'] / merged['rushing_count'] * 100,
                                              np.nan)
    merged['receiving_success_rate'] = np.where(merged['receiving_count'] > 0,
                                                merged['receiving_success'] / merged['receiving_count'] * 100,
                                                np.nan)

    # Total plays/epa/success aggregated
    merged['total_plays'] = merged['passing_count'] + merged['rushing_count'] + merged['receiving_count']

    # sum EPAs treating NaN as 0 for summation purposes
    merged['total_epa'] = (
        merged['passing_epa'].fillna(0) +
        merged['rushing_epa'].fillna(0) +
        merged['receiving_epa'].fillna(0)
    )
    # If total_plays == 0 set total_epa to NaN (consistent with previous behavior)
    merged.loc[merged['total_plays'] == 0, 'total_epa'] = np.nan

    merged['total_success'] = merged['passing_success'] + merged['rushing_success'] + merged['receiving_success']
    merged['success_rate'] = np.where(merged['total_plays'] > 0,
                                      merged['total_success'] / merged['total_plays'] * 100,
                                      np.nan)

    # Map pfr_id -> internal playerId (from Player table) so we update GameStat rows
    # players_by_pfr is mapping pfr -> {id, name, ...}
    pfr_to_playerid = {pfr: data['id'] for pfr, data in players_by_pfr.items()}
    merged['player_id'] = merged['pfr_id'].map(pfr_to_playerid)

    # Filter down to only the player/week combinations that actually have GameStat rows for the season
    # First, drop rows where player_id is null (no matching player in DB)
    merged = merged[merged['player_id'].notna()].copy()
    merged['player_id'] = merged['player_id'].astype(int)

    # Keep only rows where (player_id, week) exists in GameStat for this season
    merged['player_week_tuple'] = list(zip(merged['player_id'], merged['week']))
    merged = merged[merged['player_week_tuple'].isin(player_week_set)]
    merged.drop(columns=['player_week_tuple'], inplace=True)

    print(f"\nWill update {len(merged)} player-week EPA rows (after filtering to GameStat rows).")

    # Build update records list
    def to_update_row(r):
        return {
            'player_id': int(r.player_id),
            'week': int(r.week),
            'year': int(year),
            'passing_epa': safe_float(r.passing_epa),
            'passing_epa_per_play': safe_float(r.passing_epa_per_play),
            'passing_success_rate': safe_float(r.passing_success_rate),
            'rushing_epa': safe_float(r.rushing_epa),
            'rushing_epa_per_play': safe_float(r.rushing_epa_per_play),
            'rushing_success_rate': safe_float(r.rushing_success_rate),
            'receiving_epa': safe_float(r.receiving_epa),
            'receiving_epa_per_play': safe_float(r.receiving_epa_per_play),
            'receiving_success_rate': safe_float(r.receiving_success_rate),
            'epa': safe_float(r.total_epa),
            'success_rate': safe_float(r.success_rate),
        }

    # Use itertuples for speed when building list of dicts
    updates = [to_update_row(r) for r in merged.itertuples(index=False)]

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
