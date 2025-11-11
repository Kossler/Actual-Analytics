"""
Current season data loader and updater for historical and current season statistics.

Supports running for any year from 2016-2025.

Usage:
  python load_current_season_data.py              # Updates current year (2025)
  python load_current_season_data.py 2024         # Updates specific year
  python load_current_season_data.py 2016         # Loads historical data
  python load_current_season_data.py --clear      # Clear current year data first
  python load_current_season_data.py 2024 --clear # Clear 2024 data first

For restoring ALL historical data (2016-2024), use:
  python restore_historical_data.py

This script performs 8 steps:
  1. Load play-by-play data
  2. Calculate player statistics (medians/averages)
  3. Populate Player table from play-by-play
  4. Aggregate weekly GameStat records
  5. Populate sacks and interceptions
  6. Calculate season-level EPA for AdvancedMetrics
  7. Calculate weekly EPA for GameStat records
  8. Update weekly CPOE from NGS data
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv
import subprocess
from sqlalchemy import create_engine, text

load_dotenv()

def clear_season_data(year):
    """Clear all data for a specific season"""
    print(f"\n{'='*60}")
    print(f"[CLEAR] Removing all data for {year} season...")
    print(f"{'='*60}\n")
    
    DATABASE_URL = os.getenv("DATABASE_URL")
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.connect() as conn:
            # Clear Play table
            result = conn.execute(text('DELETE FROM "Play" WHERE season = :year'), {"year": year})
            conn.commit()
            deleted_plays = result.rowcount
            if deleted_plays > 0:
                print(f"[CLEAR] Deleted {deleted_plays:,} Play records for {year}")
            
            # Clear GameStat table
            result = conn.execute(text('DELETE FROM "GameStat" WHERE season = :year'), {"year": year})
            conn.commit()
            deleted_gamestats = result.rowcount
            if deleted_gamestats > 0:
                print(f"[CLEAR] Deleted {deleted_gamestats:,} GameStat records for {year}")
            
            # Clear PlayerStats table
            result = conn.execute(text('DELETE FROM "PlayerStats" WHERE season = :year'), {"year": year})
            conn.commit()
            deleted_playerstats = result.rowcount
            if deleted_playerstats > 0:
                print(f"[CLEAR] Deleted {deleted_playerstats:,} PlayerStats records for {year}")
            
            # Clear AdvancedMetrics table
            result = conn.execute(text('DELETE FROM "AdvancedMetrics" WHERE season = :year'), {"year": year})
            conn.commit()
            deleted_metrics = result.rowcount
            if deleted_metrics > 0:
                print(f"[CLEAR] Deleted {deleted_metrics:,} AdvancedMetrics records for {year}")
            
            print(f"[CLEAR] Season {year} data cleared successfully\n")
            return True
    except Exception as e:
        print(f"[ERROR] Failed to clear {year} data: {e}")
        return False

def run_update(year=None, clear=False):
    """Run the complete update pipeline for a specific year or current year"""
    if year is None:
        year = datetime.now().year
    
    # Clear existing data if requested
    if clear:
        if not clear_season_data(year):
            return False
    
    print(f"\n{'='*60}")
    print(f"[{datetime.now().isoformat()}] Starting {year} season stats update...")
    print(f"{'='*60}\n")
    
    try:
        steps_completed = 0
        ingest_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Step 1: Load new PBP data
        print(f"Step 1: Loading {year} PBP data...")
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, "load_pbp_fast.py"), str(year)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[ERROR] PBP loading failed: {result.stderr}")
            return False
        print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        # Step 2: Calculate player stats (medians/averages) - FAST version
        print(f"\nStep 2: Calculating {year} player stats (fast SQL aggregation)...")
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, "calculate_medians_fast.py"), str(year)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[ERROR] Stats calculation failed: {result.stderr}")
            return False
        print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        # Step 2.5: Populate Player table from play-by-play data
        print(f"\nStep 2.5: Populating Player table from {year} play-by-play data...")
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, "populate_players_from_pbp.py"), str(year)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[ERROR] Player population failed: {result.stderr}")
            return False
        print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        # Step 3: Aggregate weekly game stats (ALL POSITIONS) - FAST version
        print(f"\nStep 3: Aggregating {year} weekly game stats for all positions (fast SQL bulk insert)...")
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, "fix_2025_gamestat_weeks_fast.py"), str(year)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[ERROR] Game stat aggregation failed: {result.stderr}")
            return False
        print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        # Step 4: Populate sacks and interceptions - FAST version
        print(f"\nStep 4: Populating {year} sacks and interceptions (fast batch update)...")
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, "populate_2025_int_sacks_fast.py"), str(year)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[ERROR] Sacks/interceptions population failed: {result.stderr}")
            return False
        print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        # Step 5: Calculate EPA for AdvancedMetrics (all players) - ID-based matching
        print(f"\nStep 5: Calculating {year} EPA for AdvancedMetrics (ID-based, all positions)...")
        if year == 2025:
            script = "populate_2025_all_positions.py"
        else:
            # For historical years, use the historical script but pass the year
            script = "populate_historical_advanced_metrics.py"
        
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, script)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[ERROR] EPA calculation failed: {result.stderr}")
            return False
        print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        # Step 6: Calculate weekly EPA from play-by-play data
        print(f"\nStep 6: Calculating {year} weekly EPA from play-by-play data...")
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, "calculate_weekly_epa.py"), str(year)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[ERROR] Weekly EPA calculation failed: {result.stderr}")
            return False
        print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        # Step 7: Update weekly CPOE from NGS data (current season only)
        print(f"\nStep 7: Updating {year} weekly CPOE from NGS data...")
        result = subprocess.run(
            [sys.executable, os.path.join(ingest_dir, "update_weekly_cpoe.py"), str(year)],
            capture_output=True,
            text=True,
            cwd=ingest_dir
        )
        if result.returncode != 0:
            print(f"[WARNING] Weekly CPOE update failed: {result.stderr}")
            # Don't fail the whole pipeline if CPOE update fails
        else:
            print(f"[OK] {result.stdout.strip()}")
        steps_completed += 1
        
        print(f"\n{'='*60}")
        print(f"[{datetime.now().isoformat()}] [SUCCESS] {year} update completed successfully!")
        print(f"Completed {steps_completed}/8 steps")
        print(f"{'='*60}\n")
        return True
        
    except subprocess.TimeoutExpired as e:
        print(f"[ERROR] Step timed out (exceeded timeout limit)")
        print(f"Completed {steps_completed}/8 steps before timeout")
        return False
    except Exception as e:
        print(f"[ERROR] Update failed with error: {str(e)}")
        print(f"Completed {steps_completed}/8 steps before error")
        return False

if __name__ == "__main__":
    # Parse arguments
    year = None
    clear = False
    
    for arg in sys.argv[1:]:
        if arg == '--clear':
            clear = True
        else:
            try:
                year = int(arg)
                if year < 2016 or year > 2025:
                    print(f"[ERROR] Year must be between 2016 and 2025")
                    sys.exit(1)
            except ValueError:
                print(f"[ERROR] Invalid argument: {arg}")
                print("Usage: python load_current_season_data.py [year] [--clear]")
                sys.exit(1)
    
    if year is None:
        year = datetime.now().year
    
    print(f">>> Manual Stats Update Runner for {year}")
    if clear:
        print(">>> WARNING: This will DELETE all existing data for this season first!")
    print("This will run all 8 update steps immediately\n")
    
    # Ask for confirmation
    confirm = input("Continue? (yes/no): ").strip().lower()
    if confirm not in ['yes', 'y']:
        print("[CANCELLED]")
        sys.exit(1)
    
    print()
    success = run_update(year, clear=clear)
    
    if success:
        print(f"\n[SUCCESS] {year} updates completed successfully!")
        sys.exit(0)
    else:
        print(f"\n[WARNING] {year} updates had errors - check output above")
        sys.exit(1)
