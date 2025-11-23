"""
Populate Player table from Play-by-play data and NFL rosters.
Extracts unique players from Play table and enriches with accurate position data from rosters.
This should be run BEFORE fix_2025_gamestat_weeks_fast.py in the update pipeline.
"""

import os
os.environ["POLARS_MAX_THREADS"] = str(os.cpu_count())
import sys
import polars as pl
import nflreadpy as nfl
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

# Get year from command line or default to 2025
year = int(sys.argv[1]) if len(sys.argv) > 1 else 2025

print(f"Populating Player table from {year} play-by-play data and rosters...")


# Step 1: Load full player data and roster for enrichment
print(f"Fetching {year} roster data for accurate positions...")
try:
    roster_df = nfl.load_rosters(year)
    if not isinstance(roster_df, pl.DataFrame):
        roster_df = pl.DataFrame(roster_df)
    print(f"[OK] Loaded roster data for {roster_df.height} players")
except Exception as e:
    print(f"[WARNING] Could not fetch roster data: {e}")
    roster_df = pl.DataFrame([])

try:
    players_full = nfl.load_players()
    if not isinstance(players_full, pl.DataFrame):
        players_full = pl.DataFrame(players_full)
    print(f"[OK] Loaded {players_full.height} players from nflreadpy.load_players()")
except Exception as e:
    print(f"[WARNING] Could not fetch full player data: {e}")
    players_full = pl.DataFrame([])

# Step 2: Extract players from Play table
with engine.connect() as conn:
    # Get all unique player IDs from plays
    players_query = text(f"""
        SELECT player_id, player_name, team
        FROM (
            -- Passers
            SELECT DISTINCT
                passer_player_id as player_id,
                passer_player_name as player_name,
                posteam as team
            FROM "Play"
            WHERE season = {year}
            AND passer_player_id IS NOT NULL
            AND passer_player_name IS NOT NULL
            
            UNION
            
            -- Rushers
            SELECT DISTINCT
                rusher_player_id as player_id,
                rusher_player_name as player_name,
                posteam as team
            FROM "Play"
            WHERE season = {year}
            AND rusher_player_id IS NOT NULL
            AND rusher_player_name IS NOT NULL
            
            UNION
            
            -- Receivers
            SELECT DISTINCT
                receiver_player_id as player_id,
                receiver_player_name as player_name,
                posteam as team
            FROM "Play"
            WHERE season = {year}
            AND receiver_player_id IS NOT NULL
            AND receiver_player_name IS NOT NULL
        ) combined
        ORDER BY player_id
    """)
    
    result = conn.execute(players_query)
    players_from_pbp = pl.DataFrame([dict(row) for row in result])
    print(f"[OK] Found {players_from_pbp.height} unique players in play-by-play data")
    
    # Step 3: Enrich with full player/roster data

    # Use polars join for enrichment
    # Prepare lookup DataFrames
    roster_df = roster_df.unique(subset=['gsis_id']) if roster_df.height > 0 else roster_df
    players_full = players_full.unique(subset=['gsis_id']) if players_full.height > 0 else players_full

    # Join play-by-play extracted players with roster and full player info
    enriched = players_from_pbp.join(players_full, left_on='player_id', right_on='gsis_id', how='left', suffix='_full')
    enriched = enriched.join(roster_df, left_on='player_id', right_on='gsis_id', how='left', suffix='_roster')

    # Compose final DataFrame with vectorized logic
    def coalesce(*cols):
        return pl.coalesce([pl.col(c) for c in cols])

    players_df = enriched.select([
        pl.col('player_id').alias('gsis_id'),
        coalesce('pfr_id_full', 'pfr_id_roster', 'player_id').alias('pfr_id'),
        coalesce('display_name_full', 'name_full', 'display_name_roster', 'name_roster', 'player_name').alias('name'),
        coalesce('position_full', 'position_roster').alias('position'),
        coalesce('latest_team_full', 'team_full', 'latest_team_roster', 'team_roster', 'team').alias('team'),
        coalesce('status_full', 'status_roster'),
        coalesce('birth_date_full', 'birth_date_roster'),
        coalesce('height_full', 'height_roster'),
        coalesce('weight_full', 'weight_roster'),
        coalesce('college_name_full', 'college_full', 'college_name_roster', 'college_roster'),
        coalesce('draft_year_full', 'draft_year_roster'),
        coalesce('draft_round_full', 'draft_round_roster'),
        coalesce('draft_pick_full', 'draft_pick_roster'),
        coalesce('draft_team_full', 'draft_team_roster'),
    ])
    # Filter out missing position
    players_df = players_df.filter(pl.col('position').is_not_null())
    original_count = players_df.height
    # Deduplicate by both pfr_id and gsis_id (keep first occurrence)
    players_df = players_df.unique(subset=['pfr_id', 'gsis_id'])
    deduped_count = players_df.height
    print(f"[INFO] Inserting {deduped_count} unique players...")
    # Write to temp table using SQLAlchemy bulk insert
    conn.execute(text('DROP TABLE IF EXISTS _temp_players'))
    conn.execute(text('''
        CREATE TABLE _temp_players (
            gsis_id TEXT, pfr_id TEXT, name TEXT, position TEXT, team TEXT, status TEXT, birth_date TEXT, height TEXT, weight TEXT, college TEXT, draft_year INT, draft_round INT, draft_pick INT, draft_team TEXT
        )'''))
    insert_sql = text('''
        INSERT INTO _temp_players (gsis_id, pfr_id, name, position, team, status, birth_date, height, weight, college, draft_year, draft_round, draft_pick, draft_team)
        VALUES (:gsis_id, :pfr_id, :name, :position, :team, :status, :birth_date, :height, :weight, :college, :draft_year, :draft_round, :draft_pick, :draft_team)
    ''')
    conn.execute(insert_sql, players_df.to_dicts())
    merge_sql = text('''
        INSERT INTO "Player" (
            gsis_id, pfr_id, name, position, team, status, birth_date, height, weight, college, draft_year, draft_round, draft_pick, draft_team
        )
        SELECT gsis_id, pfr_id, name, position, team, status, birth_date, height, weight, college, draft_year, draft_round, draft_pick, draft_team FROM _temp_players
        ON CONFLICT (pfr_id) DO UPDATE SET
            gsis_id = EXCLUDED.gsis_id,
            name = EXCLUDED.name,
            position = EXCLUDED.position,
            team = EXCLUDED.team,
            status = EXCLUDED.status,
            birth_date = EXCLUDED.birth_date,
            height = EXCLUDED.height,
            weight = EXCLUDED.weight,
            college = EXCLUDED.college,
            draft_year = EXCLUDED.draft_year,
            draft_round = EXCLUDED.draft_round,
            draft_pick = EXCLUDED.draft_pick,
            draft_team = EXCLUDED.draft_team
    ''')
    conn.execute(merge_sql)
    conn.execute(text('DROP TABLE _temp_players'))
    conn.commit()
    count = conn.execute(text('SELECT COUNT(*) FROM "Player"')).scalar()
print(f"[OK] Player table populated: {count:,} total players with accurate positions and full details")
