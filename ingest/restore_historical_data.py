"""
Restore all historical NFL data (2016-2024).
This loads play-by-play data and calculates all statistics for years 2016-2024.
Run after a database reset to restore historical data.
"""

import os
import sys
from datetime import datetime
from dotenv import load_dotenv
import subprocess

load_dotenv()

def restore_historical_data():
    """Load all historical data from 2016-2024"""
    years_to_load = list(range(2016, 2025))  # 2016 through 2024
    
    print(f"\n{'='*70}")
    print(f"[{datetime.now().isoformat()}] RESTORING HISTORICAL DATA (2016-2024)")
    print(f"{'='*70}\n")
    print(f"This will load {len(years_to_load)} years of data: {years_to_load}")
    print("Estimated time: ~30-45 minutes\n")
    
    # Ask for confirmation
    confirm = input("Continue? (yes/no): ").strip().lower()
    if confirm not in ['yes', 'y']:
        print("[CANCELLED]")
        return False
    
    print()
    ingest_dir = os.path.dirname(os.path.abspath(__file__))
    
    successful_years = []
    failed_years = []
    
    for year in years_to_load:
        print(f"\n{'='*70}")
        print(f"[{datetime.now().isoformat()}] Loading data for {year}...")
        print(f"{'='*70}\n")
        
        try:
            # Run load_current_season_data.py for this year
            result = subprocess.run(
                [sys.executable, os.path.join(ingest_dir, "load_current_season_data.py"), str(year)],
                input="yes\n",  # Auto-confirm
                capture_output=True,
                text=True,
                cwd=ingest_dir
            )
            
            if result.returncode == 0:
                print(f"[SUCCESS] {year} data loaded successfully!")
                successful_years.append(year)
            else:
                print(f"[ERROR] {year} data load failed!")
                print(f"Error output:\n{result.stderr}")
                failed_years.append(year)
                
        except Exception as e:
            print(f"[ERROR] Failed to load {year}: {e}")
            failed_years.append(year)
    
    # Summary
    print(f"\n{'='*70}")
    print(f"[{datetime.now().isoformat()}] HISTORICAL DATA RESTORE COMPLETE")
    print(f"{'='*70}\n")
    print(f"Successful: {len(successful_years)}/{len(years_to_load)} years")
    if successful_years:
        print(f"  Loaded: {successful_years}")
    if failed_years:
        print(f"  Failed: {failed_years}")
    print()
    
    return len(failed_years) == 0

if __name__ == "__main__":
    success = restore_historical_data()
    
    if success:
        print("[SUCCESS] All historical data restored!")
        sys.exit(0)
    else:
        print("[WARNING] Some years failed to load - check output above")
        sys.exit(1)
