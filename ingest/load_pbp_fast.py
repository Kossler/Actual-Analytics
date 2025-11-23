"""
Ultra-fast NFL play-by-play loader using PostgreSQL COPY protocol.
~25k rows load in under a second; full-season loads in a few seconds.
Requires: pip install psycopg2-binary nflreadpy python-dotenv sqlalchemy pandas polars
"""

import os
import sys
from io import StringIO
import polars as pl
import nflreadpy as nfl
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
        pbp = nfl.load_pbp(season)
        # Already a polars DataFrame
    except Exception as e:
        print(f"[ERROR] Error fetching PBP data for {season}: {e}")
        return 0

    # Keep only regular season
    pbp = pbp.filter(pl.col("season_type") == "REG")
    if pbp.height == 0:
        print(f"No regular season data for {season}")
        return 0

    print(f"Processing {pbp.height:,} plays for {season}...")

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
    pbp_before = pbp.height
    pbp = pbp.with_columns([
        pl.col('game_id').cast(pl.Utf8),
        pl.col('play_id').cast(pl.Utf8)
    ])
    pbp = pbp.filter(~pl.struct(['game_id', 'play_id']).is_in([{'game_id': gid, 'play_id': pid} for gid, pid in existing_plays]))
    duplicates_skipped = pbp_before - pbp.height
    if duplicates_skipped > 0:
        print(f"[INFO] Skipped {duplicates_skipped:,} duplicate plays, will insert {pbp.height:,} new plays")
    if pbp.height == 0:
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

    pbp = pbp.select(cols)

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
    for col in bool_cols:
        pbp = pbp.with_columns(pl.col(col).fill_null(False).cast(pl.Boolean))
    for col in int_cols:
        pbp = pbp.with_columns(pl.col(col).cast(pl.Int64))
    pbp = pbp.with_columns(pl.col("game_date").str.strptime(pl.Date, strict=False))
    pbp = pbp.drop_nulls(["game_id", "play_id"])
    if pbp.height == 0:
        print(f"[WARNING] No valid rows left after cleaning for {season}")
        return 0

    # ----------------------------------------------------------------------
    # Perform COPY INTO for ultra-fast ingestion
    # ----------------------------------------------------------------------
    try:
        # Convert DataFrame to a tab-delimited buffer
        buffer = StringIO()
        buffer.write(pbp.write_csv(separator="\t", include_header=False))
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

        print(f"[OK] Inserted {pbp.height:,} plays for {season}")
        return pbp.height

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
