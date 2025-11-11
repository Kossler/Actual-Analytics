"""
Populate Player table from Play-by-play data and NFL rosters.
Extracts unique players from Play table and enriches with accurate position data from rosters.
This should be run BEFORE fix_2025_gamestat_weeks_fast.py in the update pipeline.
"""
import os
import sys
import pandas as pd
import nfl_data_py as nfl
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

# Get year from command line or default to 2025
year = int(sys.argv[1]) if len(sys.argv) > 1 else 2025

print(f"Populating Player table from {year} play-by-play data and rosters...")

# Step 1: Get roster data for accurate positions
print(f"Fetching {year} roster data for accurate positions...")
try:
    roster_df = nfl.import_seasonal_rosters([year])
    print(f"[OK] Loaded roster data for {len(roster_df)} players")
    
    # Create position lookup dictionary (gsis_id -> position/team/name)
    # In play-by-play, player IDs are GSIS IDs (player_id column in roster)
    position_lookup = {}
    team_lookup = {}
    name_lookup = {}
    pfr_id_lookup = {}  # Map GSIS ID to PFR ID
    
    for _, row in roster_df.iterrows():
        gsis_id = row.get('player_id')  # GSIS ID used in play-by-play
        pfr_id = row.get('pfr_id')      # PFR ID for our database
        position = row.get('position')
        team = row.get('team')
        player_name = row.get('player_name')
        
        if pd.notna(gsis_id):
            if pd.notna(position):
                position_lookup[gsis_id] = position
            if pd.notna(team):
                team_lookup[gsis_id] = team
            if pd.notna(player_name):
                name_lookup[gsis_id] = player_name
            if pd.notna(pfr_id):
                pfr_id_lookup[gsis_id] = pfr_id
    
    print(f"[OK] Position data available for {len(position_lookup)} players")
    print(f"[OK] PFR ID mappings available for {len(pfr_id_lookup)} players")
except Exception as e:
    print(f"[WARNING] Could not fetch roster data: {e}")
    print(f"[WARNING] Will use play-type inference for positions")
    position_lookup = {}
    team_lookup = {}
    name_lookup = {}
    pfr_id_lookup = {}

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
    
    players_from_pbp = pd.read_sql(players_query, conn)
    print(f"[OK] Found {len(players_from_pbp)} unique players in play-by-play data")
    
    # Step 3: Enrich with roster data
    players_to_insert = []
    missing_position_count = 0
    
    for _, row in players_from_pbp.iterrows():
        player_id = row['player_id']  # This is GSIS ID from play-by-play
        player_name = row['player_name']
        team = row['team']
        
        # Try to get position from roster data
        position = position_lookup.get(player_id)
        
        # Use roster team if available, otherwise use play team
        if player_id in team_lookup:
            team = team_lookup[player_id]
        
        # Use player name from roster if available
        if player_id in name_lookup:
            player_name = name_lookup[player_id]
        
        # ALWAYS use GSIS ID (player_id) as pfr_id
        # This is what the Play table uses, so GameStat joins will work correctly
        pfr_id = player_id
        
        if position is None:
            missing_position_count += 1
            # Skip players without position data - they won't have stats anyway
            continue
        
        players_to_insert.append({
            'pfr_id': pfr_id,
            'name': player_name,
            'team': team,
            'position': position
        })
    
    print(f"[INFO] {missing_position_count} players skipped (no roster position data)")
    print(f"[INFO] Processing {len(players_to_insert)} players with verified positions...")
    
    # Step 4: Deduplicate and bulk insert/update players
    if players_to_insert:
        players_df = pd.DataFrame(players_to_insert)
        
        # Deduplicate by pfr_id (keep first occurrence)
        original_count = len(players_df)
        players_df = players_df.drop_duplicates(subset=['pfr_id'], keep='first')
        deduped_count = len(players_df)
        
        if original_count != deduped_count:
            print(f"[INFO] Removed {original_count - deduped_count} duplicate pfr_id entries")
        
        print(f"[INFO] Inserting {deduped_count} unique players...")
        
        # Use pandas to_sql with conflict resolution
        # First, create temp table
        players_df.to_sql('_temp_players', conn, if_exists='replace', index=False)
        
        # Then merge into Player table
        merge_sql = text("""
            INSERT INTO "Player" (pfr_id, name, team, position)
            SELECT pfr_id, name, team, position FROM _temp_players
            ON CONFLICT (pfr_id) DO UPDATE SET
                name = EXCLUDED.name,
                team = EXCLUDED.team,
                position = EXCLUDED.position
        """)
        conn.execute(merge_sql)
        
        # Drop temp table
        conn.execute(text('DROP TABLE _temp_players'))
        conn.commit()
    
    # Count total players
    count = conn.execute(text('SELECT COUNT(*) FROM "Player"')).scalar()
    
print(f"[OK] Player table populated: {count:,} total players with accurate positions from rosters")
