"""
Update weekly CPOE values from NGS data.
NGS provides accurate weekly CPOE for QBs instead of averaging play-by-play CPOE.

Usage:
  python update_weekly_cpoe.py 2025     # Update 2025 weekly CPOE
  python update_weekly_cpoe.py          # Update current year
"""

import os
import sys
from datetime import datetime
import nfl_data_py as nfl
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def update_weekly_cpoe(year):
    """Update weekly CPOE from NGS data for a given year"""
    
    print(f"Fetching NGS passing data for {year}...")
    try:
        ngs_passing = nfl.import_ngs_data('passing', [year])
    except Exception as e:
        print(f"[ERROR] Failed to fetch NGS data: {e}")
        return 0
    
    if ngs_passing.empty:
        print(f"[WARNING] No NGS data available for {year}")
        return 0
    
    print(f"Processing {len(ngs_passing):,} NGS records...")
    
    # Filter to only records with week data (weekly stats, not season totals)
    weekly_ngs = ngs_passing[ngs_passing['week'].notna()].copy()
    
    if weekly_ngs.empty:
        print(f"[WARNING] No weekly NGS data available for {year}")
        return 0
    
    print(f"Found {len(weekly_ngs):,} weekly records")
    
    # Get player ID mapping from database
    with engine.connect() as conn:
        result = conn.execute(text('SELECT pfr_id, id FROM "Player" WHERE pfr_id IS NOT NULL'))
        player_id_map = {row[0]: row[1] for row in result}
    
    updates = 0
    skipped = 0
    
    # Update CPOE for each weekly record
    for _, row in weekly_ngs.iterrows():
        player_gsis_id = row.get('player_gsis_id')
        week = row.get('week')
        cpoe = row.get('completion_percentage_above_expectation')
        
        if pd.isna(player_gsis_id) or pd.isna(week) or pd.isna(cpoe):
            skipped += 1
            continue
        
        # Map GSIS ID to database player ID
        if player_gsis_id not in player_id_map:
            skipped += 1
            continue
        
        player_db_id = player_id_map[player_gsis_id]
        week_num = int(week)
        cpoe_val = float(cpoe)
        
        # Update GameStat record for this player-week
        with engine.connect() as conn:
            result = conn.execute(text("""
                UPDATE "GameStat"
                SET cpoe = :cpoe
                WHERE "playerId" = :player_id
                  AND season = :season
                  AND week = :week
            """), {
                'cpoe': cpoe_val,
                'player_id': player_db_id,
                'season': year,
                'week': week_num
            })
            conn.commit()
            
            if result.rowcount > 0:
                updates += 1
    
    print(f"[OK] Updated {updates} weekly CPOE values")
    if skipped > 0:
        print(f"[INFO] Skipped {skipped} records (missing data or player not found)")
    
    return updates

if __name__ == "__main__":
    year = datetime.now().year
    
    if len(sys.argv) > 1:
        try:
            year = int(sys.argv[1])
        except ValueError:
            print(f"[ERROR] Invalid year: {sys.argv[1]}")
            sys.exit(1)
    
    print(f"Updating weekly CPOE for {year}...")
    updates = update_weekly_cpoe(year)
    
    if updates > 0:
        print(f"\n[SUCCESS] Updated {updates} weekly CPOE values for {year}")
        sys.exit(0)
    else:
        print(f"\n[WARNING] No CPOE values were updated")
        sys.exit(1)
