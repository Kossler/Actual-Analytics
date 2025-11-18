"""
Calculate weekly EPA metrics from play-by-play data and update GameStat records.
This ensures weekly EPA values sum to season EPA.
"""
import os
import sys
from dotenv import load_dotenv
import psycopg2
import nfl_data_py as nfl
import pandas as pd

load_dotenv()

def calculate_weekly_epa(year=2025):
    """Calculate weekly EPA for all players from play-by-play data"""
    
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()
    
    print(f"\n[INFO] Calculating weekly EPA for {year}...")
    
    # Get all players with pfr_id
    cur.execute('SELECT "id", "name", "position", "pfr_id" FROM "Player" WHERE "pfr_id" IS NOT NULL')
    player_rows = cur.fetchall()
    
    players_by_pfr_id = {row[3]: {'id': row[0], 'name': row[1], 'position': row[2]} 
                         for row in player_rows if row[3]}
    
    print(f"Found {len(players_by_pfr_id)} players with pfr_id")
    
    # Download play-by-play data
    print(f"\nFetching play-by-play data for {year}...")
    try:
        pbp = nfl.import_pbp_data([year])
    except (Exception, NameError) as e:
        # Handle both actual errors and the nfl-data-py bug where it tries to catch undefined 'Error'
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
    
    # Calculate weekly EPA for each player
    weekly_updates = []
    
    # Get all player-week combinations from GameStat
    cur.execute(f"""
        SELECT DISTINCT gs."playerId", p.pfr_id, gs.week
        FROM "GameStat" gs
        JOIN "Player" p ON gs."playerId" = p.id
        WHERE gs.season = {year} AND gs.week IS NOT NULL AND p.pfr_id IS NOT NULL
        ORDER BY gs."playerId", gs.week
    """)
    
    player_weeks = cur.fetchall()
    print(f"\nProcessing {len(player_weeks)} player-week combinations...")
    
    for player_id, pfr_id, week in player_weeks:
        # Filter plays for this player and week
        player_plays = pbp[pbp['week'] == week].copy()
        
        # Calculate passing EPA
        passing_plays = player_plays[(player_plays['passer_player_id'] == pfr_id) & (player_plays['pass_attempt'] == True)]
        passing_epa = passing_plays['epa'].sum() if len(passing_plays) > 0 else None
        passing_count = len(passing_plays)
        passing_epa_per_play = passing_epa / passing_count if passing_count > 0 and passing_epa is not None else None
        passing_success = passing_plays[passing_plays['success'] == True].shape[0] if len(passing_plays) > 0 else 0
        passing_success_rate = (passing_success / passing_count * 100) if passing_count > 0 else None
        
        # Calculate rushing EPA
        rushing_plays = player_plays[(player_plays['rusher_player_id'] == pfr_id) & (player_plays['rush_attempt'] == True)]
        rushing_epa = rushing_plays['epa'].sum() if len(rushing_plays) > 0 else None
        rushing_count = len(rushing_plays)
        rushing_epa_per_play = rushing_epa / rushing_count if rushing_count > 0 and rushing_epa is not None else None
        rushing_success = rushing_plays[rushing_plays['success'] == True].shape[0] if len(rushing_plays) > 0 else 0
        rushing_success_rate = (rushing_success / rushing_count * 100) if rushing_count > 0 else None
        
        # Calculate receiving EPA
        receiving_plays = player_plays[(player_plays['receiver_player_id'] == pfr_id) & (player_plays['pass_attempt'] == True)]
        receiving_epa = receiving_plays['epa'].sum() if len(receiving_plays) > 0 else None
        # Count targets: any pass attempt where this player was the receiver
        receiving_count = len(receiving_plays)
        receiving_epa_per_play = receiving_epa / receiving_count if receiving_count > 0 and receiving_epa is not None else None
        receiving_success = receiving_plays[receiving_plays['success'] == True].shape[0] if len(receiving_plays) > 0 else 0
        receiving_success_rate = (receiving_success / receiving_count * 100) if receiving_count > 0 else None
        
        # Calculate total EPA and success rate
        total_plays = len(passing_plays) + len(rushing_plays) + len(receiving_plays)
        if total_plays > 0:
            total_epa = 0
            if passing_epa is not None:
                total_epa += passing_epa
            if rushing_epa is not None:
                total_epa += rushing_epa
            if receiving_epa is not None:
                total_epa += receiving_epa
            
            total_success = passing_success + rushing_success + receiving_success
            total_success_rate = (total_success / total_plays * 100) if total_plays > 0 else None
        else:
            total_epa = None
            total_success_rate = None
        
        weekly_updates.append({
            'player_id': player_id,
            'week': week,
            'year': year,
            'passing_epa': float(passing_epa) if passing_epa is not None and pd.notna(passing_epa) else None,
            'passing_epa_per_play': float(passing_epa_per_play) if passing_epa_per_play is not None and pd.notna(passing_epa_per_play) else None,
            'passing_success_rate': float(passing_success_rate) if passing_success_rate is not None and pd.notna(passing_success_rate) else None,
            'rushing_epa': float(rushing_epa) if rushing_epa is not None and pd.notna(rushing_epa) else None,
            'rushing_epa_per_play': float(rushing_epa_per_play) if rushing_epa_per_play is not None and pd.notna(rushing_epa_per_play) else None,
            'rushing_success_rate': float(rushing_success_rate) if rushing_success_rate is not None and pd.notna(rushing_success_rate) else None,
            'receiving_epa': float(receiving_epa) if receiving_epa is not None and pd.notna(receiving_epa) else None,
            'receiving_epa_per_play': float(receiving_epa_per_play) if receiving_epa_per_play is not None and pd.notna(receiving_epa_per_play) else None,
            'receiving_success_rate': float(receiving_success_rate) if receiving_success_rate is not None and pd.notna(receiving_success_rate) else None,
            'epa': float(total_epa) if total_epa is not None and pd.notna(total_epa) else None,
            'success_rate': float(total_success_rate) if total_success_rate is not None and pd.notna(total_success_rate) else None
        })
    
    # Update GameStat records
    print(f"\nUpdating {len(weekly_updates)} weekly GameStat records with EPA...")
    
    update_count = 0
    for update in weekly_updates:
        cur.execute("""
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
        """, update)
        update_count += cur.rowcount
    
    conn.commit()
    
    print(f"[OK] Updated {update_count} GameStat records with weekly EPA")
    
    # Verify: Check that weekly EPA sums to season EPA
    print("\n[INFO] Verifying weekly EPA sums match season EPA...")
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
        WHERE gs.season = {year} AND gs.week IS NOT NULL
        GROUP BY p.name, p.pfr_id, am.rushing_epa, am.receiving_epa
        HAVING ABS(COALESCE(am.rushing_epa, 0) - COALESCE(SUM(gs.rushing_epa), 0)) > 0.1
           OR ABS(COALESCE(am.receiving_epa, 0) - COALESCE(SUM(gs.receiving_epa), 0)) > 0.1
        LIMIT 5
    """)
    
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
    
    conn.close()

if __name__ == "__main__":
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
    calculate_weekly_epa(year)
