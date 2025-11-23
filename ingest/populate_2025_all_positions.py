"""
Populate AdvancedMetrics for 2025 only with ALL positions (polars-native).
This script is now fully polars-native: all data processing uses polars DataFrames (no pandas dependency remains).
"""
import nflreadpy as nfl
import polars as pl
import psycopg2
from psycopg2.extras import execute_values
import os
from dotenv import load_dotenv

load_dotenv()

# Database connection
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

# Get ALL players from Player table (not just QBs)
cur.execute('SELECT "id", "name", "position", "pfr_id" FROM "Player" ORDER BY "name"')
player_rows = cur.fetchall()

# Create lookup by pfr_id (unique identifier)
players_by_pfr_id = {row[3]: {'id': row[0], 'name': row[1], 'position': row[2]} for row in player_rows if row[3]}

print(f"Found {len(players_by_pfr_id)} players with pfr_id")

# Populate 2025
season = 2025
all_metrics = []

print(f"\nFetching data for season {season}...")
try:
    pbp = nfl.load_pbp(season)
    if pbp is None or pbp.height == 0:
        print(f"  No data available for {season}")
        pbp = None
except Exception as e:
    print(f"  [ERROR] Error fetching data for {season}: {e}")
    pbp = None

if pbp is not None and pbp.height > 0:
    print(f"  Got {pbp.height} plays for {season}")
    # Calculate EPA for all player types using pfr_id for unique matching
    player_epa = {}
    # 1. PASSING EPA (QB) - use passer_player_id, filter for pass attempts only
    passing = pbp.filter((pl.col('passer_player_id').is_not_null()) & (pl.col('pass_attempt') == True))
    passing_agg = passing.groupby('passer_player_id').agg([
        pl.col('epa').sum().alias('passing_epa'),
        pl.col('epa').count().alias('passing_count'),
        pl.col('success').sum().alias('passing_success'),
        pl.col('cpoe').drop_nulls().sum().alias('cpoe_sum'),
        pl.col('cpoe').drop_nulls().count().alias('cpoe_count')
    ])
    # 2. RUSHING EPA (RB, QB, FB) - use rusher_player_id, filter for rush attempts only
    rushing = pbp.filter((pl.col('rusher_player_id').is_not_null()) & (pl.col('rush_attempt') == True))
    rushing_agg = rushing.groupby('rusher_player_id').agg([
        pl.col('epa').sum().alias('rushing_epa'),
        pl.col('epa').count().alias('rushing_count'),
        pl.col('success').sum().alias('rushing_success')
    ])
    # 3. RECEIVING EPA (WR, TE, RB) - use receiver_player_id, filter for pass attempts only
    receiving = pbp.filter((pl.col('receiver_player_id').is_not_null()) & (pl.col('pass_attempt') == True))
    receiving_agg = receiving.groupby('receiver_player_id').agg([
        pl.col('epa').sum().alias('receiving_epa'),
        pl.col('epa').count().alias('receiving_count'),
        pl.col('success').sum().alias('receiving_success')
    ])
    # Merge all player metrics into a single DataFrame
    passing_agg = passing_agg.rename({'passer_player_id': 'pfr_id'})
    rushing_agg = rushing_agg.rename({'rusher_player_id': 'pfr_id'})
    receiving_agg = receiving_agg.rename({'receiver_player_id': 'pfr_id'})
    metrics_df = passing_agg.join(rushing_agg, on='pfr_id', how='outer').join(receiving_agg, on='pfr_id', how='outer')
    metrics_df = metrics_df.with_columns([
        (pl.col('passing_epa').fill_null(0) + pl.col('rushing_epa').fill_null(0) + pl.col('receiving_epa').fill_null(0)).alias('epa'),
        (pl.col('passing_count').fill_null(0) + pl.col('rushing_count').fill_null(0) + pl.col('receiving_count').fill_null(0)).alias('total_plays'),
        (pl.col('passing_success').fill_null(0) + pl.col('rushing_success').fill_null(0) + pl.col('receiving_success').fill_null(0)).alias('total_success'),
        (pl.col('epa') / pl.col('total_plays')).alias('epa_per_play'),
        (pl.col('passing_epa') / pl.col('passing_count')).alias('passing_epa_per_play'),
        (pl.col('rushing_epa') / pl.col('rushing_count')).alias('rushing_epa_per_play'),
        (pl.col('receiving_epa') / pl.col('receiving_count')).alias('receiving_epa_per_play'),
        (pl.col('passing_success') / pl.col('passing_count') * 100).alias('passing_success_rate'),
        (pl.col('rushing_success') / pl.col('rushing_count') * 100).alias('rushing_success_rate'),
        (pl.col('receiving_success') / pl.col('receiving_count') * 100).alias('receiving_success_rate'),
        (pl.col('total_success') / pl.col('total_plays') * 100).alias('success_rate'),
        (pl.col('cpoe_sum') / pl.col('cpoe_count')).alias('cpoe')
    ])
    # Join with player info
    player_info_df = pl.DataFrame([
        {'pfr_id': k, 'playerId': v['id'], 'position': v['position']} for k, v in players_by_pfr_id.items()
    ])
    metrics_df = metrics_df.join(player_info_df, on='pfr_id', how='inner')
    metrics_df = metrics_df.with_columns([
        pl.lit(season).alias('season')
    ])
    # Convert to dicts for bulk upsert
    all_metrics = metrics_df.to_dicts()
    # Bulk insert into AdvancedMetrics
    if all_metrics:
        columns = [
            'playerId', 'season', 'epa', 'epa_per_play', 'cpoe', 'success_rate',
            'passing_epa', 'passing_epa_per_play', 'passing_success_rate',
            'rushing_epa', 'rushing_epa_per_play', 'rushing_success_rate',
            'receiving_epa', 'receiving_epa_per_play', 'receiving_success_rate'
        ]
        values = [[m.get(col) for col in columns] for m in all_metrics]
        execute_values(cur, f'''
            INSERT INTO "AdvancedMetrics" ({', '.join(columns)})
            VALUES %s
            ON CONFLICT ("playerId", season) DO UPDATE SET
                epa = EXCLUDED.epa,
                epa_per_play = EXCLUDED.epa_per_play,
                cpoe = EXCLUDED.cpoe,
                success_rate = EXCLUDED.success_rate,
                passing_epa = EXCLUDED.passing_epa,
                passing_epa_per_play = EXCLUDED.passing_epa_per_play,
                passing_success_rate = EXCLUDED.passing_success_rate,
                rushing_epa = EXCLUDED.rushing_epa,
                rushing_epa_per_play = EXCLUDED.rushing_epa_per_play,
                rushing_success_rate = EXCLUDED.rushing_success_rate,
                receiving_epa = EXCLUDED.receiving_epa,
                receiving_epa_per_play = EXCLUDED.receiving_epa_per_play,
                receiving_success_rate = EXCLUDED.receiving_success_rate
        ''', values)
        conn.commit()
        print(f"[OK] Inserted/updated {len(all_metrics)} AdvancedMetrics records for {season}")
    else:
        print(f"[WARNING] No AdvancedMetrics records to insert for {season}")
            player_epa[key] = {
                'passing_epa': 0, 'rushing_epa': 0, 'receiving_epa': 0,
                'passing_count': 0, 'rushing_count': 0, 'receiving_count': 0,
                'passing_success': 0, 'rushing_success': 0, 'receiving_success': 0,
                'cpoe_sum': 0, 'cpoe_count': 0
            }
        player_epa[key]['passing_epa'] += group['epa'].sum()
        player_epa[key]['passing_count'] += len(group)
        player_epa[key]['passing_success'] += group['success'].sum()
        # CPOE calculation for QBs only
        cpoe_values = group['cpoe'].dropna()
        if len(cpoe_values) > 0:
            player_epa[key]['cpoe_sum'] += cpoe_values.sum()
            player_epa[key]['cpoe_count'] += len(cpoe_values)
    
    # 2. RUSHING EPA (RB, QB, FB) - use rusher_player_id, filter for rush attempts only
    rushing = pbp[(pbp['rusher_player_id'].notna()) & (pbp['rush_attempt'] == True)].copy()
    for rusher_id, group in rushing.groupby('rusher_player_id'):
        # Try pfr_id match first, fall back to name match
        if rusher_id and rusher_id in players_by_pfr_id:
            key = rusher_id
        else:
            continue
            
        if key not in player_epa:
            player_epa[key] = {
                'passing_epa': 0, 'rushing_epa': 0, 'receiving_epa': 0,
                'passing_count': 0, 'rushing_count': 0, 'receiving_count': 0,
                'passing_success': 0, 'rushing_success': 0, 'receiving_success': 0,
                'cpoe_sum': 0, 'cpoe_count': 0
            }
        player_epa[key]['rushing_epa'] += group['epa'].sum()
        player_epa[key]['rushing_count'] += len(group)
        player_epa[key]['rushing_success'] += group['success'].sum()
    
    # 3. RECEIVING EPA (WR, TE, RB) - use receiver_player_id, filter for pass attempts only
    receiving = pbp[(pbp['receiver_player_id'].notna()) & (pbp['pass_attempt'] == True)].copy()
    for receiver_id, group in receiving.groupby('receiver_player_id'):
        # Try pfr_id match first
        if receiver_id and receiver_id in players_by_pfr_id:
            key = receiver_id
        else:
            continue
            
        if key not in player_epa:
            player_epa[key] = {
                'passing_epa': 0, 'rushing_epa': 0, 'receiving_epa': 0,
                'passing_count': 0, 'rushing_count': 0, 'receiving_count': 0,
                'passing_success': 0, 'rushing_success': 0, 'receiving_success': 0,
                'cpoe_sum': 0, 'cpoe_count': 0
            }
        player_epa[key]['receiving_epa'] += group['epa'].sum()
        player_epa[key]['receiving_count'] += len(group)
        player_epa[key]['receiving_success'] += group['success'].sum()
    
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
            
            # Calculate success rates (percentage of successful plays)
            passing_success_rate = (epa_data['passing_success'] / epa_data['passing_count'] * 100) if epa_data['passing_count'] > 0 else None
            rushing_success_rate = (epa_data['rushing_success'] / epa_data['rushing_count'] * 100) if epa_data['rushing_count'] > 0 else None
            receiving_success_rate = (epa_data['receiving_success'] / epa_data['receiving_count'] * 100) if epa_data['receiving_count'] > 0 else None
            
            # Calculate overall success rate
            total_success = epa_data['passing_success'] + epa_data['rushing_success'] + epa_data['receiving_success']
            success_rate = (total_success / total_plays * 100) if total_plays > 0 else None
            
            # Calculate average CPOE
            cpoe = (epa_data['cpoe_sum'] / epa_data['cpoe_count']) if epa_data['cpoe_count'] > 0 else None
            
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
                'passing_success_rate': passing_success_rate,
                'rushing_success_rate': rushing_success_rate,
                'receiving_success_rate': receiving_success_rate,
                'success_rate': success_rate,
                'cpoe': cpoe,
                'position': position
            })
        
    # Print sample stats
    print(f"  [OK] Calculated EPA for {len(player_epa)} players")
    qb_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'QB')
    rb_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'RB')
    wr_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'WR')
    te_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'TE')
    print(f"      QB: {qb_count}, RB: {rb_count}, WR: {wr_count}, TE: {te_count}")

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
         float(m.get('receiving_epa_per_play')) if m.get('receiving_epa_per_play') is not None else None,
         float(m.get('passing_success_rate')) if m.get('passing_success_rate') is not None else None,
         float(m.get('rushing_success_rate')) if m.get('rushing_success_rate') is not None else None,
         float(m.get('receiving_success_rate')) if m.get('receiving_success_rate') is not None else None,
         float(m.get('success_rate')) if m.get('success_rate') is not None else None,
         float(m.get('cpoe')) if m.get('cpoe') is not None else None)
        for m in all_metrics
    ]
    
    # Use upsert (ON CONFLICT UPDATE) to handle duplicates
    query = """
        INSERT INTO "AdvancedMetrics" 
        ("playerId", "season", "epa", "epa_per_play", 
         "passing_epa", "passing_epa_per_play",
         "rushing_epa", "rushing_epa_per_play",
         "receiving_epa", "receiving_epa_per_play",
         "passing_success_rate", "rushing_success_rate", "receiving_success_rate",
         "success_rate", "cpoe")
        VALUES %s
        ON CONFLICT ("playerId", "season") DO UPDATE SET
            epa = EXCLUDED.epa,
            epa_per_play = EXCLUDED.epa_per_play,
            passing_epa = EXCLUDED.passing_epa,
            passing_epa_per_play = EXCLUDED.passing_epa_per_play,
            rushing_epa = EXCLUDED.rushing_epa,
            rushing_epa_per_play = EXCLUDED.rushing_epa_per_play,
            receiving_epa = EXCLUDED.receiving_epa,
            receiving_epa_per_play = EXCLUDED.receiving_epa_per_play,
            passing_success_rate = EXCLUDED.passing_success_rate,
            rushing_success_rate = EXCLUDED.rushing_success_rate,
            receiving_success_rate = EXCLUDED.receiving_success_rate,
            success_rate = EXCLUDED.success_rate,
            cpoe = EXCLUDED.cpoe
    """
    
    execute_values(cur, query, values)
    conn.commit()
    print(f"[OK] Successfully inserted/updated {len(all_metrics)} metrics records for 2025")
else:
    print("No metrics to insert")

cur.close()
conn.close()

print(f"\n[OK] 2025 EPA population complete - now copy to GameStat using calculate_epa_gamestat_fast.py")
