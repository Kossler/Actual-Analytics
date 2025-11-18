"""
Populate AdvancedMetrics table for historical seasons (2016-2024) using GameStat table data.

This script reads weekly EPA data from the GameStat table (populated by calculate_weekly_epa.py)
and aggregates it into season-level EPA metrics for all positions.

Usage:
  python populate_historical_advanced_metrics.py           # Process all years 2016-2024
  python populate_historical_advanced_metrics.py 2024      # Process only 2024
  python populate_historical_advanced_metrics.py 2016 2024 # Process years 2016-2024

Note: Requires GameStat table to be populated with EPA data first.
Use load_current_season_data.py to populate GameStat EPA data.
"""

import psycopg2
from psycopg2.extras import execute_values
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Parse command line arguments for specific years
if len(sys.argv) > 1:
    if len(sys.argv) == 2:
        # Single year specified
        year_arg = int(sys.argv[1])
        seasons_to_populate = [year_arg]
    elif len(sys.argv) == 3:
        # Year range specified
        start_year = int(sys.argv[1])
        end_year = int(sys.argv[2])
        seasons_to_populate = list(range(start_year, end_year + 1))
    else:
        print("Usage: python populate_historical_advanced_metrics.py [year] or [start_year end_year]")
        sys.exit(1)
else:
    # Default: process all historical years
    seasons_to_populate = list(range(2016, 2025))  # 2016-2024

print(f"Processing seasons: {seasons_to_populate}")

# Database connection
conn = psycopg2.connect(os.getenv("DATABASE_URL"))
cur = conn.cursor()

# Clear existing AdvancedMetrics for seasons being processed to avoid duplicates
if seasons_to_populate:
    print(f"\nClearing existing AdvancedMetrics for seasons: {seasons_to_populate}")
    for season in seasons_to_populate:
        cur.execute('DELETE FROM "AdvancedMetrics" WHERE season = %s', (season,))
    conn.commit()
    print(f"[OK] Cleared AdvancedMetrics for {len(seasons_to_populate)} seasons\n")

# Aggregate EPA data from GameStat table for each season
all_metrics = []

for season in seasons_to_populate:
    print(f"\nAggregating EPA data for season {season} from GameStat table...")
    try:
        # Aggregate weekly EPA data from GameStat table to get season totals
        cur.execute('''
            SELECT 
                "playerId",
                SUM("passing_epa") as passing_epa,
                SUM("rushing_epa") as rushing_epa,
                SUM("receiving_epa") as receiving_epa,
                SUM("epa") as total_epa,
                AVG("passing_epa_per_play") as passing_epa_per_play,
                AVG("rushing_epa_per_play") as rushing_epa_per_play,
                AVG("receiving_epa_per_play") as receiving_epa_per_play,
                AVG("success_rate") as success_rate,
                AVG("passing_success_rate") as passing_success_rate,
                AVG("rushing_success_rate") as rushing_success_rate,
                AVG("receiving_success_rate") as receiving_success_rate,
                AVG("cpoe") as cpoe
            FROM "GameStat"
            WHERE "season" = %s
              AND "week" IS NOT NULL
            GROUP BY "playerId"
        ''', (season,))
        
        gamestat_rows = cur.fetchall()
        
        if not gamestat_rows:
            print(f"  No GameStat data available for {season}")
            continue
        
        print(f"  Got {len(gamestat_rows)} players with EPA data for {season}")
        
        # Get player positions
        cur.execute('SELECT "id", "position" FROM "Player"')
        player_positions = {row[0]: row[1] for row in cur.fetchall()}
        
        # Process each player's season stats
        for row in gamestat_rows:
            player_id = row[0]
            position = player_positions.get(player_id, 'Unknown')
            
            # Calculate EPA per play (weighted average based on total plays)
            total_epa = row[4]
            passing_epa = row[1]
            rushing_epa = row[2]
            receiving_epa = row[3]
            
            # Count non-null EPA values to determine total plays
            passing_plays = 1 if passing_epa is not None and passing_epa != 0 else 0
            rushing_plays = 1 if rushing_epa is not None and rushing_epa != 0 else 0
            receiving_plays = 1 if receiving_epa is not None and receiving_epa != 0 else 0
            total_plays = passing_plays + rushing_plays + receiving_plays
            
            if total_plays == 0:
                continue
            
            epa_per_play = total_epa / total_plays if total_epa is not None and total_plays > 0 else None
            
            all_metrics.append({
                'playerId': player_id,
                'season': season,
                'epa': total_epa,
                'epa_per_play': epa_per_play,
                'passing_epa': passing_epa if passing_epa != 0 else None,
                'rushing_epa': rushing_epa if rushing_epa != 0 else None,
                'receiving_epa': receiving_epa if receiving_epa != 0 else None,
                'passing_epa_per_play': row[5],
                'rushing_epa_per_play': row[6],
                'receiving_epa_per_play': row[7],
                'success_rate': row[8],
                'passing_success_rate': row[9],
                'rushing_success_rate': row[10],
                'receiving_success_rate': row[11],
                'cpoe': row[12],
                'position': position
            })
        
        # Print sample stats
        print(f"  [OK] Processed {len([m for m in all_metrics if m['season'] == season])} players")
        qb_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'QB')
        rb_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'RB')
        wr_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'WR')
        te_count = sum(1 for m in all_metrics if m['season'] == season and m['position'] == 'TE')
        print(f"      QB: {qb_count}, RB: {rb_count}, WR: {wr_count}, TE: {te_count}")
        
    except Exception as e:
        print(f"  [ERROR] Error processing data for {season}: {e}")
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
         float(m.get('passing_success_rate')) if m.get('passing_success_rate') is not None else None,
         float(m['rushing_epa']) if m['rushing_epa'] is not None else None,
         float(m['rushing_epa_per_play']) if m['rushing_epa_per_play'] is not None else None,
         float(m.get('rushing_success_rate')) if m.get('rushing_success_rate') is not None else None,
         float(m.get('receiving_epa')) if m.get('receiving_epa') is not None else None,
         float(m.get('receiving_epa_per_play')) if m.get('receiving_epa_per_play') is not None else None,
         float(m.get('receiving_success_rate')) if m.get('receiving_success_rate') is not None else None,
         float(m.get('success_rate')) if m.get('success_rate') is not None else None,
         float(m.get('cpoe')) if m.get('cpoe') is not None else None)
        for m in all_metrics
    ]
    
    # Use upsert (ON CONFLICT UPDATE) to handle duplicates
    query = """
        INSERT INTO "AdvancedMetrics" 
        ("playerId", "season", "epa", "epa_per_play", 
         "passing_epa", "passing_epa_per_play", "passing_success_rate",
         "rushing_epa", "rushing_epa_per_play", "rushing_success_rate",
         "receiving_epa", "receiving_epa_per_play", "receiving_success_rate",
         "success_rate", "cpoe")
        VALUES %s
        ON CONFLICT ("playerId", "season") DO UPDATE SET
            epa = EXCLUDED.epa,
            epa_per_play = EXCLUDED.epa_per_play,
            passing_epa = EXCLUDED.passing_epa,
            passing_epa_per_play = EXCLUDED.passing_epa_per_play,
            passing_success_rate = EXCLUDED.passing_success_rate,
            rushing_epa = EXCLUDED.rushing_epa,
            rushing_epa_per_play = EXCLUDED.rushing_epa_per_play,
            rushing_success_rate = EXCLUDED.rushing_success_rate,
            receiving_epa = EXCLUDED.receiving_epa,
            receiving_epa_per_play = EXCLUDED.receiving_epa_per_play,
            receiving_success_rate = EXCLUDED.receiving_success_rate,
            success_rate = EXCLUDED.success_rate,
            cpoe = EXCLUDED.cpoe
    """
    
    execute_values(cur, query, values)
    conn.commit()
    print(f"[OK] Successfully inserted/updated {len(all_metrics)} metrics records")
else:
    print("No metrics to insert")

cur.close()
conn.close()
