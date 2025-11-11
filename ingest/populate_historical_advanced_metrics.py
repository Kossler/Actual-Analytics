import nfl_data_py as nfl
import psycopg2
from psycopg2.extras import execute_values
import pandas as pd
from collections import defaultdict
import os
from dotenv import load_dotenv

load_dotenv()

# Database connection
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

# Get ALL players from Player table (not just QBs)
cur.execute('SELECT "id", "name", "position", "pfr_id" FROM "Player" ORDER BY "name"')
player_rows = cur.fetchall()

# Create lookup by pfr_id (unique identifier) AND by name (ONLY for players without pfr_id to avoid duplicates)
players_by_pfr_id = {row[3]: {'id': row[0], 'name': row[1], 'position': row[2]} for row in player_rows if row[3]}
players_by_name = {row[1]: {'id': row[0], 'position': row[2]} for row in player_rows if not row[3]}  # Only players WITHOUT pfr_id

print(f"Found {len(players_by_pfr_id)} players with pfr_id, {len(players_by_name)} players without pfr_id")

# Fetch play-by-play data for each season
seasons_to_populate = list(range(2016, 2025))  # 2016-2024 (2025 already done)
all_metrics = []

for season in seasons_to_populate:
    print(f"\nFetching data for season {season}...")
    try:
        # Download all play-by-play data
        pbp = nfl.import_pbp_data([season])
        
        if pbp is None or pbp.empty:
            print(f"  No data available for {season}")
            continue
        
        print(f"  Got {len(pbp)} plays for {season}")
        
        # Calculate EPA for all player types using pfr_id for unique matching
        player_epa = {}  # Key: pfr_id, Value: EPA stats
        
        # 1. PASSING EPA (QB) - use passer_player_id, filter for pass attempts only
        passing = pbp[(pbp['passer_player_id'].notna()) & (pbp['pass_attempt'] == True)].copy()
        for passer_id, group in passing.groupby('passer_player_id'):
            # Only match by pfr_id
            if passer_id and passer_id in players_by_pfr_id:
                key = passer_id
            else:
                continue
                
            if key not in player_epa:
                player_epa[key] = {'passing_epa': 0, 'rushing_epa': 0, 'receiving_epa': 0,
                                  'passing_count': 0, 'rushing_count': 0, 'receiving_count': 0}
            player_epa[key]['passing_epa'] += group['epa'].sum()
            player_epa[key]['passing_count'] += len(group)
        
        # 2. RUSHING EPA (RB, QB, FB) - use rusher_player_id, filter for rush attempts only
        rushing = pbp[(pbp['rusher_player_id'].notna()) & (pbp['rush_attempt'] == True)].copy()
        for rusher_id, group in rushing.groupby('rusher_player_id'):
            # Only match by pfr_id
            if rusher_id and rusher_id in players_by_pfr_id:
                key = rusher_id
            else:
                continue
                
            if key not in player_epa:
                player_epa[key] = {'passing_epa': 0, 'rushing_epa': 0, 'receiving_epa': 0,
                                  'passing_count': 0, 'rushing_count': 0, 'receiving_count': 0}
            player_epa[key]['rushing_epa'] += group['epa'].sum()
            player_epa[key]['rushing_count'] += len(group)
        
        # 3. RECEIVING EPA (WR, TE, RB) - use receiver_player_id, filter for pass attempts only
        receiving = pbp[(pbp['receiver_player_id'].notna()) & (pbp['pass_attempt'] == True)].copy()
        for receiver_id, group in receiving.groupby('receiver_player_id'):
            # Only match by pfr_id
            if receiver_id and receiver_id in players_by_pfr_id:
                key = receiver_id
            else:
                continue
                
            if key not in player_epa:
                player_epa[key] = {'passing_epa': 0, 'rushing_epa': 0, 'receiving_epa': 0,
                                  'passing_count': 0, 'rushing_count': 0, 'receiving_count': 0}
            player_epa[key]['receiving_epa'] += group['epa'].sum()
            player_epa[key]['receiving_count'] += len(group)
        
        # Calculate total EPA and per-play metrics for each player
        for key, epa_data in player_epa.items():
            # Get player info from database - key is now always pfr_id
            pfr_id = key
            if pfr_id not in players_by_pfr_id:
                continue
            player_id = players_by_pfr_id[pfr_id]['id']
            position = players_by_pfr_id[pfr_id]['position']
            
            # Calculate total EPA (sum of all play types)
            total_epa = epa_data['passing_epa'] + epa_data['rushing_epa'] + epa_data['receiving_epa']
            total_plays = epa_data['passing_count'] + epa_data['rushing_count'] + epa_data['receiving_count']
            
            if total_plays == 0:
                continue
            
            # Calculate per-play metrics
            epa_per_play = total_epa / total_plays if total_plays > 0 else 0
            passing_epa_per_play = epa_data['passing_epa'] / epa_data['passing_count'] if epa_data['passing_count'] > 0 else None
            rushing_epa_per_play = epa_data['rushing_epa'] / epa_data['rushing_count'] if epa_data['rushing_count'] > 0 else None
            receiving_epa_per_play = epa_data['receiving_epa'] / epa_data['receiving_count'] if epa_data['receiving_count'] > 0 else None
            
            all_metrics.append({
                'playerId': player_id,
                'season': season,
                'epa': total_epa,
                'epa_per_play': epa_per_play,
                'passing_epa': epa_data['passing_epa'] if epa_data['passing_count'] > 0 else None,
                'rushing_epa': epa_data['rushing_epa'] if epa_data['rushing_count'] > 0 else None,
                'receiving_epa': epa_data['receiving_epa'] if epa_data['receiving_count'] > 0 else None,
                'passing_epa_per_play': passing_epa_per_play,
                'rushing_epa_per_play': rushing_epa_per_play,
                'receiving_epa_per_play': receiving_epa_per_play,
                'position': position
            })
        
        # Print sample stats
        print(f"  [OK] Calculated EPA for {len(player_epa)} players")
        qb_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'QB')
        rb_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'RB')
        wr_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'WR')
        te_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'TE')
        print(f"      QB: {qb_count}, RB: {rb_count}, WR: {wr_count}, TE: {te_count}")
        
    except Exception as e:
        print(f"  [ERROR] Error fetching data for {season}: {e}")
        import traceback
        traceback.print_exc()
        continue

# Insert into database
if all_metrics:
    print(f"\nInserting {len(all_metrics)} records into AdvancedMetrics...")
    
    values = [
        (m['playerId'], m['season'], 
         float(m['epa']) if m['epa'] is not None else None,
         float(m['epa_per_play']) if m['epa_per_play'] is not None else None, 
         float(m['passing_epa']) if m['passing_epa'] is not None else None,
         float(m['passing_epa_per_play']) if m['passing_epa_per_play'] is not None else None,
         float(m['rushing_epa']) if m['rushing_epa'] is not None else None,
         float(m['rushing_epa_per_play']) if m['rushing_epa_per_play'] is not None else None,
         float(m.get('receiving_epa')) if m.get('receiving_epa') is not None else None,
         float(m.get('receiving_epa_per_play')) if m.get('receiving_epa_per_play') is not None else None)
        for m in all_metrics
    ]
    
    # Use upsert (ON CONFLICT UPDATE) to handle duplicates
    query = """
        INSERT INTO "AdvancedMetrics" 
        ("playerId", "season", "epa", "epa_per_play", 
         "passing_epa", "passing_epa_per_play",
         "rushing_epa", "rushing_epa_per_play",
         "receiving_epa", "receiving_epa_per_play")
        VALUES %s
        ON CONFLICT ("playerId", "season") DO UPDATE SET
            epa = EXCLUDED.epa,
            epa_per_play = EXCLUDED.epa_per_play,
            passing_epa = EXCLUDED.passing_epa,
            passing_epa_per_play = EXCLUDED.passing_epa_per_play,
            rushing_epa = EXCLUDED.rushing_epa,
            rushing_epa_per_play = EXCLUDED.rushing_epa_per_play,
            receiving_epa = EXCLUDED.receiving_epa,
            receiving_epa_per_play = EXCLUDED.receiving_epa_per_play
    """
    
    execute_values(cur, query, values)
    conn.commit()
    print(f"[OK] Successfully inserted/updated {len(all_metrics)} metrics records")
else:
    print("No metrics to insert")

cur.close()
conn.close()
