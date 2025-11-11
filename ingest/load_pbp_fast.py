"""
Ultra-fast NFL play-by-play loader using PostgreSQL COPY protocol.
~25k rows load in under a second; full-season loads in a few seconds.
Requires: pip install psycopg2-binary nfl_data_py python-dotenv sqlalchemy pandas
"""

import os
import sys
from io import StringIO
import pandas as pd
import nfl_data_py as nfl
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# --------------------------------------------------------------------------
# Setup database connection
# --------------------------------------------------------------------------
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)


def load_pbp_season(season: int) -> int:
    """Fetch and bulk load one season of play-by-play data into PostgreSQL."""
    print(f"Fetching PBP data for {season}...")

    try:
        pbp = nfl.import_pbp_data([season])
    except Exception as e:
        print(f"[ERROR] Error fetching PBP data for {season}: {e}")
        return 0

    # Keep only regular season
    pbp = pbp[pbp["season_type"] == "REG"]
    if pbp.empty:
        print(f"No regular season data for {season}")
        return 0

    print(f"Processing {len(pbp):,} plays for {season}...")

    # Get existing play IDs from database to filter duplicates
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("SELECT DISTINCT game_id, play_id FROM \"Play\" WHERE season = :season"),
                {"season": season}
            )
            existing_plays = set((str(row[0]), str(row[1])) for row in result)
        if existing_plays:
            print(f"[INFO] Found {len(existing_plays):,} existing plays in database for {season}")
    except Exception as e:
        print(f"[WARNING] Could not fetch existing plays: {e}")
        existing_plays = set()

    # Filter out duplicates - convert to strings for comparison
    pbp_before = len(pbp)
    pbp['game_id'] = pbp['game_id'].astype(str)
    pbp['play_id'] = pbp['play_id'].astype(str)
    
    pbp = pbp[~pbp.apply(lambda row: (row['game_id'], row['play_id']) in existing_plays, axis=1)]
    duplicates_skipped = pbp_before - len(pbp)
    
    if duplicates_skipped > 0:
        print(f"[INFO] Skipped {duplicates_skipped:,} duplicate plays, will insert {len(pbp):,} new plays")
    
    if pbp.empty:
        if duplicates_skipped > 0:
            print(f"[INFO] All plays for {season} already in database")
        return 0

    # Columns in target "Play" table
    cols = [
        "game_id", "play_id", "season", "week", "game_date", "play_type",
        "passer_player_id", "passer_player_name", "passing_yards",
        "pass_attempt", "complete_pass", "sack", "interception", "cpoe",
        "rusher_player_id", "rusher_player_name", "rushing_yards", "rush_attempt",
        "receiver_player_id", "receiver_player_name", "receiving_yards",
        "yards_after_catch", "air_yards", "reception", "target",
        "pass_touchdown", "rush_touchdown", "receiving_touchdown",
        "posteam", "defteam", "down", "ydstogo", "yardline_100", "qtr"
    ]

    pbp = pbp.reindex(columns=cols)

    # ----------------------------------------------------------------------
    # Vectorized cleaning and type conversion
    # ----------------------------------------------------------------------
    bool_cols = [
        "pass_attempt", "complete_pass", "sack", "interception",
        "rush_attempt", "reception", "target",
        "pass_touchdown", "rush_touchdown", "receiving_touchdown"
    ]
    int_cols = [
        "down", "ydstogo", "yardline_100", "qtr",
        "passing_yards", "rushing_yards", "receiving_yards",
        "yards_after_catch", "air_yards"
    ]

    pbp[bool_cols] = pbp[bool_cols].fillna(False).astype(bool)
    pbp[int_cols] = pbp[int_cols].apply(pd.to_numeric, errors="coerce").astype("Int64")
    pbp["game_date"] = pd.to_datetime(pbp["game_date"], errors="coerce")
    pbp = pbp.dropna(subset=["game_id", "play_id"])

    if pbp.empty:
        print(f"[WARNING] No valid rows left after cleaning for {season}")
        return 0

    # ----------------------------------------------------------------------
    # Perform COPY INTO for ultra-fast ingestion
    # ----------------------------------------------------------------------
    try:
        # Convert DataFrame to a tab-delimited buffer
        buffer = StringIO()
        pbp.to_csv(buffer, sep="\t", header=False, index=False, na_rep="\\N")
        buffer.seek(0)

        # Use raw psycopg2 connection under SQLAlchemy engine
        raw_conn = engine.raw_connection()
        try:
            cursor = raw_conn.cursor()
            # Specify exact column list to skip the auto-increment id column
            cursor.copy_from(
                buffer, 
                'Play', 
                sep="\t", 
                null="\\N",
                columns=cols  # Use the specific column list we defined
            )
            raw_conn.commit()
            cursor.close()
        finally:
            raw_conn.close()

        print(f"[OK] Inserted {len(pbp):,} plays for {season}")
        return len(pbp)

    except Exception as e:
        print(f"[ERROR] COPY failed for {season}: {e}")
        return 0


if __name__ == "__main__":
    total_inserted = 0
    if len(sys.argv) > 1:
        season = int(sys.argv[1])
        total_inserted = load_pbp_season(season)
    else:
        for year in range(2016, 2025):
            total_inserted += load_pbp_season(year)

    print(f"\nTotal plays loaded: {total_inserted:,}")
