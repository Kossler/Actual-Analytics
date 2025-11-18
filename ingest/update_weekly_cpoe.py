"""
Ultra-fast weekly CPOE updater using bulk SQL updates.
Loads NGS weekly data into PostgreSQL as a temp table and performs a single JOIN update.
100x faster than row-by-row Python updates.
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
    print(f"Fetching NGS passing data for {year}...")

    try:
        ngs_passing = nfl.import_ngs_data("passing", [year])
    except Exception as e:
        print(f"[ERROR] Failed to fetch NGS data: {e}")
        return 0

    if ngs_passing.empty:
        print(f"[WARNING] No NGS data available for {year}")
        return 0

    weekly = ngs_passing[ngs_passing["week"].notna()].copy()

    if weekly.empty:
        print(f"[WARNING] No weekly data found for {year}")
        return 0

    print(f"Loaded {len(weekly):,} weekly NGS rows")

    # We only need the columns that matter for updating
    weekly = weekly[
        ["player_gsis_id", "week", "completion_percentage_above_expectation"]
    ].rename(
        columns={
            "player_gsis_id": "gsis",
            "week": "week",
            "completion_percentage_above_expectation": "cpoe",
        }
    )

    # Filter out bad rows early
    weekly = weekly.dropna(subset=["gsis", "week", "cpoe"])

    if weekly.empty:
        print("[WARNING] No usable weekly CPOE rows after filtering")
        return 0

    # Convert numeric types
    weekly["week"] = weekly["week"].astype(int)
    weekly["cpoe"] = weekly["cpoe"].astype(float)

    with engine.begin() as conn:
        # 1. Create a temp table for the bulk update
        conn.execute(text("""
            CREATE TEMP TABLE temp_weekly_cpoe (
                gsis TEXT,
                week INT,
                cpoe FLOAT8
            ) ON COMMIT DROP;
        """))

        # 2. Bulk insert into the temp table
        weekly.to_sql(
            "temp_weekly_cpoe",
            conn,
            index=False,
            if_exists="append"
        )

        # 3. Do a single JOIN-based bulk update
        update_sql = text("""
            WITH matched AS (
                SELECT 
                    p.id AS playerId,
                    t.week,
                    t.cpoe
                FROM temp_weekly_cpoe t
                JOIN "Player" p
                    ON p.pfr_id = t.gsis
            )
            UPDATE "GameStat" gs
            SET cpoe = m.cpoe
            FROM matched m
            WHERE gs."playerId" = m.playerId
              AND gs.season = :season
              AND gs.week = m.week;
        """)

        result = conn.execute(update_sql, {"season": year})
        updated_rows = result.rowcount

    print(f"[OK] Updated {updated_rows} weekly CPOE rows")
    return updated_rows


if __name__ == "__main__":
    # Default to current NFL year
    year = datetime.now().year

    if len(sys.argv) > 1:
        try:
            year = int(sys.argv[1])
        except ValueError:
            print(f"[ERROR] Invalid year: {sys.argv[1]}")
            sys.exit(1)

    print(f"Updating weekly CPOE for {year}...")
    updated = update_weekly_cpoe(year)

    if updated > 0:
        print(f"\n[SUCCESS] Updated {updated} weekly CPOE rows for {year}")
        sys.exit(0)
    else:
        print(f"\n[WARNING] No rows updated")
        sys.exit(1)
