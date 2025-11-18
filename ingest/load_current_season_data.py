"""
Current season data loader and updater for historical and current season statistics.

Supports running for any year from 2016-2025, or loading all years at once.

Usage:
  python load_current_season_data.py              # Loads ALL years (2016 to current year)
  python load_current_season_data.py 2024         # Updates specific year only
  python load_current_season_data.py 2016         # Loads historical data for 2016
  python load_current_season_data.py --clear      # Clear and reload ALL years
  python load_current_season_data.py 2024 --clear # Clear and reload 2024 only

For restoring ALL historical data (2016-2024), use:
  python restore_historical_data.py

This script performs 8 steps for each year:
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
        
        # Step 5: Calculate EPA for AdvancedMetrics (2025 only uses populate_2025_all_positions.py)
        # Historical years will be processed in batch at the end
        if year == 2025:
            print(f"\nStep 5: Calculating {year} EPA for AdvancedMetrics (ID-based, all positions)...")
            result = subprocess.run(
                [sys.executable, os.path.join(ingest_dir, "populate_2025_all_positions.py")],
                capture_output=True,
                text=True,
                cwd=ingest_dir
            )
            if result.returncode != 0:
                print(f"[ERROR] EPA calculation failed: {result.stderr}")
                return False
            print(f"[OK] {result.stdout.strip()}")
            steps_completed += 1
        else:
            print(f"\nStep 5: Skipping individual EPA calculation (will be processed in batch after all years loaded)")
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
    
    # If no year specified, load all years from 2016 to current year
    if year is None:
        current_year = datetime.now().year
        years_to_load = list(range(2016, current_year + 1))
        
        print(f">>> Manual Stats Update Runner for ALL YEARS (2016-{current_year})")
        if clear:
            print(">>> WARNING: This will DELETE all existing data for these seasons first!")
        print(f"This will load {len(years_to_load)} years of data: {years_to_load}")
        print("Estimated time: ~30-45 minutes\n")
        
        # Ask for confirmation
        confirm = input("Continue? (yes/no): ").strip().lower()
        if confirm not in ['yes', 'y']:
            print("[CANCELLED]")
            sys.exit(1)
        
        print()
        successful_years = []
        failed_years = []
        
        for year in years_to_load:
            print(f"\n{'='*70}")
            print(f"[{datetime.now().isoformat()}] Loading data for {year}...")
            print(f"{'='*70}\n")
            
            success = run_update(year, clear=clear)
            
            if success:
                successful_years.append(year)
            else:
                failed_years.append(year)
        
        # After all years loaded, run batch AdvancedMetrics calculation for historical years
        historical_years = [y for y in successful_years if y < 2025]
        if historical_years:
            print(f"\n{'='*70}")
            print(f"[{datetime.now().isoformat()}] BATCH PROCESSING: AdvancedMetrics for historical years")
            print(f"{'='*70}\n")
            print(f"Processing AdvancedMetrics for {len(historical_years)} historical years: {historical_years}")
            
            ingest_dir = os.path.dirname(os.path.abspath(__file__))
            min_year = min(historical_years)
            max_year = max(historical_years)
            
            result = subprocess.run(
                [sys.executable, os.path.join(ingest_dir, "populate_historical_advanced_metrics.py"), 
                 str(min_year), str(max_year)],
                capture_output=True,
                text=True,
                cwd=ingest_dir
            )
            
            if result.returncode == 0:
                print(f"[OK] Successfully calculated AdvancedMetrics for historical years")
                print(result.stdout)
            else:
                print(f"[WARNING] AdvancedMetrics calculation had errors: {result.stderr}")
                print(result.stdout)
        
        # Summary
        print(f"\n{'='*70}")
        print(f"[{datetime.now().isoformat()}] ALL YEARS LOAD COMPLETE")
        print(f"{'='*70}\n")
        print(f"Successful: {len(successful_years)}/{len(years_to_load)} years")
        if successful_years:
            print(f"  Loaded: {successful_years}")
        if failed_years:
            print(f"  Failed: {failed_years}")
        print()
        
        if len(failed_years) == 0:
            print("[SUCCESS] All years loaded successfully!")
            sys.exit(0)
        else:
            print("[WARNING] Some years failed to load - check output above")
            sys.exit(1)
    else:
        # Single year mode
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
        
        # If it's a historical year (not 2025), run populate_historical_advanced_metrics for this specific year
        if success and year < 2025:
            print(f"\n{'='*70}")
            print(f"[{datetime.now().isoformat()}] Processing AdvancedMetrics for {year}")
            print(f"{'='*70}\n")
            
            ingest_dir = os.path.dirname(os.path.abspath(__file__))
            result = subprocess.run(
                [sys.executable, os.path.join(ingest_dir, "populate_historical_advanced_metrics.py"), str(year)],
                capture_output=True,
                text=True,
                cwd=ingest_dir
            )
            
            if result.returncode == 0:
                print(f"[OK] Successfully calculated AdvancedMetrics for {year}")
                print(result.stdout)
            else:
                print(f"[WARNING] AdvancedMetrics calculation had errors: {result.stderr}")
                print(result.stdout)
        
        if success:
            print(f"\n[SUCCESS] {year} updates completed successfully!")
            sys.exit(0)
        else:
            print(f"\n[WARNING] {year} updates had errors - check output above")
            sys.exit(1)
