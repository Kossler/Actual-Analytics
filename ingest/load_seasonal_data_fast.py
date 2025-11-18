"""
Ultra-fast seasonal data loader using PostgreSQL COPY protocol.
Loads season-level statistics for historical years (2016-2024).
~500 records load in under 1 second using bulk COPY.

Usage: python load_seasonal_data_fast.py [year] [--clear]
  python load_seasonal_data_fast.py 2023         # Load single year
  python load_seasonal_data_fast.py              # Load all years 2016-2024
  python load_seasonal_data_fast.py --clear      # Clear existing, load all years
  python load_seasonal_data_fast.py 2023 --clear # Clear 2023, reload it
"""

import os
import sys
from io import StringIO
import pandas as pd
import nfl_data_py as nfl
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)


def load_seasonal_year(year: int, clear: bool = False) -> int:
    """Load seasonal statistics for one year using fast COPY protocol"""
    
    # Clear existing data if requested
    if clear:
        with engine.connect() as conn:
            result = conn.execute(text("""
                DELETE FROM "GameStat" 
                WHERE season = :year AND week IS NULL
            """), {"year": year})
            conn.commit()
            deleted = result.rowcount
            if deleted > 0:
                print(f"[CLEAR] Deleted {deleted} existing GameStat season records for {year}")
            
            # Also clear PlayerStats and AdvancedMetrics
            result = conn.execute(text("""
                DELETE FROM "PlayerStats" WHERE season = :year
            """), {"year": year})
            conn.commit()
            deleted_ps = result.rowcount
            if deleted_ps > 0:
                print(f"[CLEAR] Deleted {deleted_ps} existing PlayerStats records for {year}")
            
            result = conn.execute(text("""
                DELETE FROM "AdvancedMetrics" WHERE season = :year
            """), {"year": year})
            conn.commit()
            deleted_am = result.rowcount
            if deleted_am > 0:
                print(f"[CLEAR] Deleted {deleted_am} existing AdvancedMetrics records for {year}")
    
    # Check if this year already has season-level data
    with engine.connect() as conn:
        existing = conn.execute(text("""
            SELECT COUNT(*) FROM "GameStat" 
            WHERE season = :year AND week IS NULL
        """), {"year": year}).scalar()
        
        if existing > 0:
            print(f"[SKIP] Year {year} already has {existing} season records")
            return 0
    
    print(f"Fetching seasonal data for {year}...")
    try:
        seasonal_data = nfl.import_seasonal_data([year], s_type='REG')
    except Exception as e:
        print(f"[ERROR] Failed to fetch data for {year}: {e}")
        return 0
    
    if seasonal_data.empty:
        print(f"[WARNING] No seasonal data for {year}")
        return 0
    
    # Fetch NGS data for CPOE
    print(f"Fetching NGS passing data for CPOE for {year}...")
    try:
        ngs_passing = nfl.import_ngs_data('passing', [year])
        # Create CPOE lookup by player_gsis_id (maps to pfr_id)
        cpoe_lookup = {}
        if not ngs_passing.empty and 'player_gsis_id' in ngs_passing.columns and 'completion_percentage_above_expectation' in ngs_passing.columns:
            for _, ngs_row in ngs_passing.iterrows():
                gsis_id = ngs_row.get('player_gsis_id')
                cpoe_val = ngs_row.get('completion_percentage_above_expectation')
                if pd.notna(gsis_id) and pd.notna(cpoe_val):
                    cpoe_lookup[gsis_id] = float(cpoe_val)
            print(f"[OK] Found CPOE data for {len(cpoe_lookup)} players")
        else:
            print(f"[WARNING] No CPOE data available for {year}")
    except Exception as e:
        print(f"[WARNING] Failed to fetch NGS data for {year}: {e}")
        cpoe_lookup = {}
    
    # Fetch play-by-play data for success rate calculations
    print(f"Fetching play-by-play data for success rates for {year}...")
    success_rate_lookup = {}
    try:
        # Fetch full PBP data (column filtering causes issues with some years)
        pbp = nfl.import_pbp_data([year])
    except (Exception, NameError) as e:
        # Handle both actual errors and the nfl-data-py bug where it tries to catch undefined 'Error'
        print(f"[ERROR] Error fetching PBP data for {year}: {e}")
        pbp = pd.DataFrame()
    
    try:
        
        if not pbp.empty and 'epa' in pbp.columns:
            # Calculate success rates for passers (EPA > 0)
            passing = pbp[pbp['passer_player_id'].notna()].copy()
            if not passing.empty:
                for player_id, group in passing.groupby('passer_player_id'):
                    success_count = (group['epa'] > 0).sum()
                    total_plays = len(group)
                    if player_id not in success_rate_lookup:
                        success_rate_lookup[player_id] = {
                            'passing_success': 0, 'passing_plays': 0,
                            'rushing_success': 0, 'rushing_plays': 0,
                            'receiving_success': 0, 'receiving_plays': 0
                        }
                    success_rate_lookup[player_id]['passing_success'] = success_count
                    success_rate_lookup[player_id]['passing_plays'] = total_plays
            
            # Calculate success rates for rushers (EPA > 0)
            rushing = pbp[pbp['rusher_player_id'].notna()].copy()
            if not rushing.empty:
                for player_id, group in rushing.groupby('rusher_player_id'):
                    success_count = (group['epa'] > 0).sum()
                    total_plays = len(group)
                    if player_id not in success_rate_lookup:
                        success_rate_lookup[player_id] = {
                            'passing_success': 0, 'passing_plays': 0,
                            'rushing_success': 0, 'rushing_plays': 0,
                            'receiving_success': 0, 'receiving_plays': 0
                        }
                    success_rate_lookup[player_id]['rushing_success'] = success_count
                    success_rate_lookup[player_id]['rushing_plays'] = total_plays
            
            # Calculate success rates for receivers (EPA > 0)
            receiving = pbp[pbp['receiver_player_id'].notna()].copy()
            if not receiving.empty:
                for player_id, group in receiving.groupby('receiver_player_id'):
                    success_count = (group['epa'] > 0).sum()
                    total_plays = len(group)
                    if player_id not in success_rate_lookup:
                        success_rate_lookup[player_id] = {
                            'passing_success': 0, 'passing_plays': 0,
                            'rushing_success': 0, 'rushing_plays': 0,
                            'receiving_success': 0, 'receiving_plays': 0
                        }
                    success_rate_lookup[player_id]['receiving_success'] = success_count
                    success_rate_lookup[player_id]['receiving_plays'] = total_plays
            
            print(f"[OK] Calculated success rates for {len(success_rate_lookup)} players")
        else:
            print(f"[WARNING] No play-by-play data available for {year}")
    except Exception as e:
        print(f"[WARNING] Failed to fetch play-by-play data for {year}: {e}")
    
    print(f"Processing {len(seasonal_data):,} player-season records...")
    
    # Fetch roster data for accurate positions and names
    print(f"Fetching {year} roster data for accurate positions and names...")
    position_lookup = {}
    team_lookup = {}
    name_lookup = {}
    pfr_id_lookup = {}  # Map GSIS ID to PFR ID
    
    try:
        roster_df = nfl.import_seasonal_rosters([year])
        print(f"[OK] Loaded roster data for {len(roster_df)} players")
        
        for _, row in roster_df.iterrows():
            gsis_id = row.get('player_id')  # GSIS ID used in seasonal_data
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
        print(f"[WARNING] Will use stats-based position inference")
    
    # First, ensure all players exist in Player table
    player_records = []
    missing_position_count = 0
    
    for _, row in seasonal_data.iterrows():
        player_id = row.get('player_id')  # GSIS ID from seasonal_data
        if pd.isna(player_id):
            continue
        
        # Get position from roster data first
        position = position_lookup.get(player_id)
        
        # If no roster position, infer from stats
        if not position:
            passing_att = int(row.get('attempts', 0) or 0)
            carries = int(row.get('carries', 0) or 0)
            targets_val = int(row.get('targets', 0) or 0)
            
            if passing_att > 0:
                position = 'QB'
            elif carries > targets_val:
                position = 'RB'
            else:
                position = 'WR'
            missing_position_count += 1
        
        # Get name from roster data or use player_id
        player_name = name_lookup.get(player_id, str(player_id))
        team = team_lookup.get(player_id)
        
        # ALWAYS use GSIS ID (player_id) as pfr_id
        # This is what the Play table uses, so GameStat joins will work correctly
        pfr_id = player_id
        
        player_record = {
            'pfr_id': pfr_id,
            'name': player_name,
            'position': position
        }
        
        if team:
            player_record['team'] = team
        
        player_records.append(player_record)
    
    if missing_position_count > 0:
        print(f"[INFO] {missing_position_count} players used stats-based position inference (no roster data)")
    
    # Deduplicate player records by pfr_id before inserting
    seen_pfr_ids = set()
    unique_player_records = []
    duplicate_count = 0
    
    for player in player_records:
        pfr_id = player['pfr_id']
        if pfr_id not in seen_pfr_ids:
            seen_pfr_ids.add(pfr_id)
            unique_player_records.append(player)
        else:
            duplicate_count += 1
    
    if duplicate_count > 0:
        print(f"[INFO] Removed {duplicate_count} duplicate pfr_id entries")
    
    # Bulk upsert players using SQL
    if unique_player_records:
        with engine.connect() as conn:
            for player in unique_player_records:
                if 'team' in player:
                    conn.execute(text("""
                        INSERT INTO "Player" (pfr_id, name, position, team)
                        VALUES (:pfr_id, :name, :position, :team)
                        ON CONFLICT (pfr_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            position = EXCLUDED.position,
                            team = EXCLUDED.team
                    """), player)
                else:
                    conn.execute(text("""
                        INSERT INTO "Player" (pfr_id, name, position)
                        VALUES (:pfr_id, :name, :position)
                        ON CONFLICT (pfr_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            position = EXCLUDED.position
                    """), player)
            conn.commit()
        print(f"[OK] Upserted {len(unique_player_records)} players with roster-accurate data")
    
    # Get player ID mappings
    with engine.connect() as conn:
        result = conn.execute(text('SELECT pfr_id, id FROM "Player"'))
        player_id_map = {row[0]: row[1] for row in result}
    
    # Prepare GameStat records
    gamestat_records = []
    for _, row in seasonal_data.iterrows():
        player_id = row.get('player_id')
        if pd.isna(player_id) or player_id not in player_id_map:
            continue
        
        player_pk = player_id_map[player_id]
        
        # Extract stats
        passing_yds = int(row.get('passing_yards', 0) or 0)
        passing_tds = int(row.get('passing_tds', 0) or 0)
        passing_int = int(row.get('interceptions', 0) or 0)
        passing_att = int(row.get('attempts', 0) or 0)
        passing_cmp = int(row.get('completions', 0) or 0)
        passing_sacks = int(row.get('sacks', 0) or 0)
        
        rushing_yds = int(row.get('rushing_yards', 0) or 0)
        rushing_att = int(row.get('carries', 0) or 0)
        rushing_tds = int(row.get('rushing_tds', 0) or 0)
        
        receiving_yds = int(row.get('receiving_yards', 0) or 0)
        receiving_tds = int(row.get('receiving_tds', 0) or 0)
        targets = int(row.get('targets', 0) or 0)
        receptions = int(row.get('receptions', 0) or 0)
        games = int(row.get('games', 0) or 0)
        
        # Get CPOE from NGS data if available
        cpoe = cpoe_lookup.get(player_id)
        
        # Only include if player has some stats
        if (passing_yds > 0 or rushing_yds > 0 or receiving_yds > 0):
            gamestat_records.append({
                'playerId': player_pk,
                'season': year,
                'week': None,
                'games': games,
                'passingYds': passing_yds,
                'passing_tds': passing_tds,
                'passing_interceptions': passing_int,
                'passing_attempts': passing_att,
                'passing_completions': passing_cmp,
                'passing_sacks': passing_sacks,
                'rushingYds': rushing_yds,
                'rushing_attempts': rushing_att,
                'rushing_tds': rushing_tds,
                'receivingYds': receiving_yds,
                'receiving_tds': receiving_tds,
                'targets': targets,
                'receptions': receptions,
                'cpoe': cpoe
            })
    
    if not gamestat_records:
        print(f"[WARNING] No valid stats to insert for {year}")
        return 0
    
    # Convert to DataFrame for COPY
    df = pd.DataFrame(gamestat_records)
    
    # Column order for COPY (must match table structure, excluding 'id' and other auto fields)
    cols = [
        'playerId', 'season', 'week', 'games',
        'passingYds', 'passing_tds', 'passing_interceptions',
        'passing_attempts', 'passing_completions', 'passing_sacks',
        'rushingYds', 'rushing_attempts', 'rushing_tds',
        'receivingYds', 'receiving_tds', 'targets', 'receptions',
        'cpoe'
    ]
    
    # Reindex to match column order
    df = df[cols]
    
    # Use COPY for ultra-fast bulk insert
    try:
        buffer = StringIO()
        df.to_csv(buffer, sep="\t", header=False, index=False, na_rep="\\N")
        buffer.seek(0)
        
        raw_conn = engine.raw_connection()
        try:
            cursor = raw_conn.cursor()
            cursor.copy_from(
                buffer,
                'GameStat',
                sep="\t",
                null="\\N",
                columns=cols
            )
            raw_conn.commit()
            cursor.close()
        finally:
            raw_conn.close()
        
        print(f"[OK] Inserted {len(df):,} season stat records for {year}")
        
        # Now populate PlayerStats (per-attempt metrics)
        print(f"Calculating PlayerStats (per-attempt metrics) for {year}...")
        playerstats_records = []
        for _, row in seasonal_data.iterrows():
            player_id = row.get('player_id')
            if pd.isna(player_id) or player_id not in player_id_map:
                continue
            
            player_pk = player_id_map[player_id]
            
            # Calculate per-attempt averages
            passing_att = float(row.get('attempts', 0) or 0)
            passing_yds = float(row.get('passing_yards', 0) or 0)
            carries = float(row.get('carries', 0) or 0)
            rushing_yds = float(row.get('rushing_yards', 0) or 0)
            receptions = float(row.get('receptions', 0) or 0)
            receiving_yds = float(row.get('receiving_yards', 0) or 0)
            
            avg_yds_per_pass = (passing_yds / passing_att) if passing_att > 0 else None
            avg_yds_per_rush = (rushing_yds / carries) if carries > 0 else None
            avg_yds_per_rec = (receiving_yds / receptions) if receptions > 0 else None
            
            # Only add if player has meaningful stats
            if avg_yds_per_pass or avg_yds_per_rush or avg_yds_per_rec:
                playerstats_records.append({
                    'playerId': player_pk,
                    'season': year,
                    'median_yards_per_pass_attempt': avg_yds_per_pass,  # Using avg as proxy for median
                    'average_yards_per_pass_attempt': avg_yds_per_pass,
                    'median_yards_per_rushing_attempt': avg_yds_per_rush,
                    'average_yards_per_rushing_attempt': avg_yds_per_rush,
                    'median_yards_per_reception': avg_yds_per_rec,
                    'average_yards_per_reception': avg_yds_per_rec
                })
        
        if playerstats_records:
            with engine.connect() as conn:
                for ps in playerstats_records:
                    conn.execute(text("""
                        INSERT INTO "PlayerStats" 
                        ("playerId", "season", 
                         "median_yards_per_pass_attempt", "average_yards_per_pass_attempt",
                         "median_yards_per_rushing_attempt", "average_yards_per_rushing_attempt",
                         "median_yards_per_reception", "average_yards_per_reception")
                        VALUES (:playerId, :season, 
                                :median_yards_per_pass_attempt, :average_yards_per_pass_attempt,
                                :median_yards_per_rushing_attempt, :average_yards_per_rushing_attempt,
                                :median_yards_per_reception, :average_yards_per_reception)
                        ON CONFLICT ("playerId", "season") DO UPDATE SET
                            median_yards_per_pass_attempt = EXCLUDED.median_yards_per_pass_attempt,
                            average_yards_per_pass_attempt = EXCLUDED.average_yards_per_pass_attempt,
                            median_yards_per_rushing_attempt = EXCLUDED.median_yards_per_rushing_attempt,
                            average_yards_per_rushing_attempt = EXCLUDED.average_yards_per_rushing_attempt,
                            median_yards_per_reception = EXCLUDED.median_yards_per_reception,
                            average_yards_per_reception = EXCLUDED.average_yards_per_reception
                    """), ps)
                conn.commit()
            print(f"[OK] Inserted {len(playerstats_records)} PlayerStats records for {year}")
        
        # Now populate AdvancedMetrics (EPA data from seasonal_data)
        print(f"Calculating AdvancedMetrics (EPA, success rates) for {year}...")
        advancedmetrics_records = []
        for _, row in seasonal_data.iterrows():
            player_id = row.get('player_id')
            if pd.isna(player_id) or player_id not in player_id_map:
                continue
            
            player_pk = player_id_map[player_id]
            
            # EPA metrics from seasonal_data
            passing_epa = row.get('passing_epa')
            rushing_epa = row.get('rushing_epa')
            receiving_epa = row.get('receiving_epa')
            
            passing_att = float(row.get('attempts', 0) or 0)
            carries = float(row.get('carries', 0) or 0)
            targets = float(row.get('targets', 0) or 0)
            
            # Calculate total EPA and per-play metrics
            total_epa = 0
            total_plays = 0
            
            if pd.notna(passing_epa):
                total_epa += passing_epa
                total_plays += passing_att
            if pd.notna(rushing_epa):
                total_epa += rushing_epa
                total_plays += carries
            if pd.notna(receiving_epa):
                total_epa += receiving_epa
                total_plays += targets
            
            if total_plays == 0:
                continue
            
            epa_per_play = total_epa / total_plays
            passing_epa_per_play = (passing_epa / passing_att) if passing_att > 0 and pd.notna(passing_epa) else None
            rushing_epa_per_play = (rushing_epa / carries) if carries > 0 and pd.notna(rushing_epa) else None
            receiving_epa_per_play = (receiving_epa / targets) if targets > 0 and pd.notna(receiving_epa) else None
            
            # Get CPOE from lookup
            cpoe = cpoe_lookup.get(player_id)
            
            # Get success rates from lookup
            success_data = success_rate_lookup.get(player_id, {})
            passing_success_rate = None
            rushing_success_rate = None
            receiving_success_rate = None
            overall_success_rate = None
            
            if success_data:
                if success_data.get('passing_plays', 0) > 0:
                    passing_success_rate = (success_data['passing_success'] / success_data['passing_plays']) * 100
                if success_data.get('rushing_plays', 0) > 0:
                    rushing_success_rate = (success_data['rushing_success'] / success_data['rushing_plays']) * 100
                if success_data.get('receiving_plays', 0) > 0:
                    receiving_success_rate = (success_data['receiving_success'] / success_data['receiving_plays']) * 100
                
                # Calculate overall success rate
                total_success = success_data.get('passing_success', 0) + success_data.get('rushing_success', 0) + success_data.get('receiving_success', 0)
                total_success_plays = success_data.get('passing_plays', 0) + success_data.get('rushing_plays', 0) + success_data.get('receiving_plays', 0)
                if total_success_plays > 0:
                    overall_success_rate = (total_success / total_success_plays) * 100
            
            advancedmetrics_records.append({
                'playerId': player_pk,
                'season': year,
                'epa': total_epa if total_epa != 0 else None,
                'epa_per_play': epa_per_play if total_plays > 0 else None,
                'passing_epa': passing_epa if pd.notna(passing_epa) else None,
                'passing_epa_per_play': passing_epa_per_play,
                'rushing_epa': rushing_epa if pd.notna(rushing_epa) else None,
                'rushing_epa_per_play': rushing_epa_per_play,
                'receiving_epa': receiving_epa if pd.notna(receiving_epa) else None,
                'receiving_epa_per_play': receiving_epa_per_play,
                'cpoe': cpoe,
                'passing_success_rate': passing_success_rate,
                'rushing_success_rate': rushing_success_rate,
                'receiving_success_rate': receiving_success_rate,
                'success_rate': overall_success_rate
            })
        
        if advancedmetrics_records:
            with engine.connect() as conn:
                for am in advancedmetrics_records:
                    conn.execute(text("""
                        INSERT INTO "AdvancedMetrics" 
                        ("playerId", "season", "epa", "epa_per_play",
                         "passing_epa", "passing_epa_per_play",
                         "rushing_epa", "rushing_epa_per_play",
                         "receiving_epa", "receiving_epa_per_play",
                         "cpoe", "passing_success_rate", "rushing_success_rate",
                         "receiving_success_rate", "success_rate")
                        VALUES (:playerId, :season, :epa, :epa_per_play,
                                :passing_epa, :passing_epa_per_play,
                                :rushing_epa, :rushing_epa_per_play,
                                :receiving_epa, :receiving_epa_per_play,
                                :cpoe, :passing_success_rate, :rushing_success_rate,
                                :receiving_success_rate, :success_rate)
                        ON CONFLICT ("playerId", "season") DO UPDATE SET
                            epa = EXCLUDED.epa,
                            epa_per_play = EXCLUDED.epa_per_play,
                            passing_epa = EXCLUDED.passing_epa,
                            passing_epa_per_play = EXCLUDED.passing_epa_per_play,
                            rushing_epa = EXCLUDED.rushing_epa,
                            rushing_epa_per_play = EXCLUDED.rushing_epa_per_play,
                            receiving_epa = EXCLUDED.receiving_epa,
                            receiving_epa_per_play = EXCLUDED.receiving_epa_per_play,
                            cpoe = EXCLUDED.cpoe,
                            passing_success_rate = EXCLUDED.passing_success_rate,
                            rushing_success_rate = EXCLUDED.rushing_success_rate,
                            receiving_success_rate = EXCLUDED.receiving_success_rate,
                            success_rate = EXCLUDED.success_rate
                    """), am)
                conn.commit()
            print(f"[OK] Inserted {len(advancedmetrics_records)} AdvancedMetrics records for {year}")
        
        return len(df)
        
    except Exception as e:
        print(f"[ERROR] COPY failed for {year}: {e}")
        return 0


if __name__ == "__main__":
    total_inserted = 0
    clear = '--clear' in sys.argv
    
    # Filter out --clear flag to get year argument
    args = [arg for arg in sys.argv[1:] if arg != '--clear']
    
    if len(args) > 0:
        year = int(args[0])
        total_inserted = load_seasonal_year(year, clear=clear)
    else:
        # Load all historical years
        for year in range(2016, 2025):  # 2016-2024
            total_inserted += load_seasonal_year(year, clear=clear)
    
    print(f"\nTotal season records loaded: {total_inserted:,}")
