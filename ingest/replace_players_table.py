
"""
Replace Player table with fresh data from nflreadpy (polars-native).
This script is now fully polars-native: all data processing uses polars DataFrames (no pandas dependency remains).
"""

import os
os.environ["POLARS_MAX_THREADS"] = str(os.cpu_count())
from dotenv import load_dotenv
import nflreadpy as nfl
import polars as pl
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

print("[INFO] Loading all NFL players from nflreadpy.load_players()...")
players = nfl.load_players()
print(f"[OK] Loaded {players.height} players from nflreadpy")

# Select columns to keep (add more as needed)
columns = [
    'gsis_id', 'pfr_id', 'display_name', 'position', 'latest_team', 'status',
    'birth_date', 'height', 'weight', 'college_name', 'draft_year', 'draft_round', 'draft_pick', 'draft_team'
]
players = players.select(columns)
players = players.rename({
    'latest_team': 'team',
    'display_name': 'name',
    'college_name': 'college',
})

with engine.connect() as conn:
    print("[INFO] Dropping and recreating Player table (this will remove all related stats!)...")
    conn.execute(text('DROP TABLE IF EXISTS "Player" CASCADE;'))
    conn.execute(text('''
        CREATE TABLE "Player" (
            id SERIAL PRIMARY KEY,
            gsis_id TEXT,
            pfr_id TEXT UNIQUE,
            name TEXT,
            position TEXT,
            team TEXT,
            status TEXT,
            birth_date TEXT,
            height TEXT,
            weight TEXT,
            college TEXT,
            draft_year INT,
            draft_round INT,
            draft_pick INT,
            draft_team TEXT
        );
    '''))
    print("[INFO] Inserting refreshed player data...")
    # Write to CSV buffer for fast COPY
    import io
    csv_buf = io.StringIO()
    players.write_csv(csv_buf, include_header=False)
    csv_buf.seek(0)
    raw_conn = conn.connection
    cursor = raw_conn.cursor()
    cursor.copy_from(
        csv_buf,
        'Player',
        sep=',',
        columns=('gsis_id', 'pfr_id', 'name', 'position', 'team', 'status', 'birth_date', 'height', 'weight', 'college', 'draft_year', 'draft_round', 'draft_pick', 'draft_team')
    )
    cursor.close()
    count = conn.execute(text('SELECT COUNT(*) FROM "Player"')).scalar()
print(f"[OK] Player table fully replaced: {count:,} total players.")
