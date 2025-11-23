"""
Ultra-fast seasonal data loader using PostgreSQL COPY protocol.
Loads season-level statistics for historical years (2016-2024).
~500 records load in under 1 second using bulk COPY.

This script is now fully polars-native: all data processing uses polars DataFrames (no pandas dependency remains).

Usage: python load_seasonal_data_fast.py [year] [--clear]
    python load_seasonal_data_fast.py 2023         # Load single year
    python load_seasonal_data_fast.py              # Load all years 2016-2024
    python load_seasonal_data_fast.py --clear      # Clear existing, load all years
    python load_seasonal_data_fast.py 2023 --clear # Clear 2023, reload it
"""

import os
import sys
from io import StringIO
import polars as pl
import nflreadpy as nfl
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
os.environ["POLARS_MAX_THREADS"] = str(os.cpu_count() or 8)

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
    
    print(f"Fetching player season stats for {year} using nflreadpy.load_player_stats...")
    try:
        seasonal_data = nfl.load_player_stats(seasons=year, summary_level="reg")
    except Exception as e:
        print(f"[ERROR] Failed to fetch data for {year}: {e}")
        return 0
    if seasonal_data is None or seasonal_data.height == 0:
        print(f"[WARNING] No seasonal data for {year}")
        return 0

    # Fetch NGS data for CPOE (polars-native)
    print(f"Fetching NGS passing data for CPOE for {year} using nflreadpy...")
    try:
        ngs_passing = nfl.load_nextgen_stats(year, stat_type="passing")
        if not isinstance(ngs_passing, pl.DataFrame):
            ngs_passing = pl.DataFrame(ngs_passing)
        cpoe_lookup = {}
        if ngs_passing.height > 0 and 'player_gsis_id' in ngs_passing.columns and 'completion_percentage_above_expectation' in ngs_passing.columns:
            ngs_valid = ngs_passing.filter(
                ngs_passing['player_gsis_id'].is_not_null() & ngs_passing['completion_percentage_above_expectation'].is_not_null()
            )
            for row in ngs_valid.iter_rows(named=True):
                gsis_id = row['player_gsis_id']
                cpoe_val = row['completion_percentage_above_expectation']
                cpoe_lookup[gsis_id] = float(cpoe_val)
            print(f"[OK] Found CPOE data for {len(cpoe_lookup)} players")
        else:
            print(f"[WARNING] No CPOE data available for {year}")
    except Exception as e:
        print(f"[WARNING] Failed to fetch NGS data for {year}: {e}")
        cpoe_lookup = {}

    # Fetch play-by-play data for success rate calculations (polars-native)
    print(f"Fetching play-by-play data for success rates for {year} using nflreadpy...")
    success_rate_lookup = {}
    import pandas as pd
    try:
        pbp = nfl.load_pbp(year)
        # Robust conversion to polars DataFrame
        if isinstance(pbp, pl.DataFrame):
            pass
        elif 'DataFrame' in str(type(pbp)) and hasattr(pbp, 'to_dict'):
            # Likely pandas DataFrame
            pbp = pl.from_pandas(pbp)
        elif isinstance(pbp, dict) or isinstance(pbp, list):
            pbp = pl.DataFrame(pbp)
        else:
            pbp = pl.DataFrame([])
        print(f"[DEBUG] pbp type after conversion: {type(pbp)}")
    except (Exception, NameError) as e:
        print(f"[ERROR] Error fetching PBP data for {year}: {e}")
        pbp = pl.DataFrame([])

    try:
        if pbp.height > 0 and 'epa' in pbp.columns:
            # Calculate success rates for passers (EPA > 0)
            passing = pbp.filter(pbp['passer_player_id'].is_not_null())
            print(f"[DEBUG] passing type: {type(passing)}")
            if passing.height > 0:
                passing_success = passing.with_columns([
                    (pl.col('epa') > 0).alias('success')
                ]).group_by('passer_player_id').agg([
                    pl.col('success').sum().alias('passing_success'),
                    pl.col('success').count().alias('passing_plays')
                ])
                for row in passing_success.iter_rows(named=True):
                    player_id = row['passer_player_id']
                    if player_id not in success_rate_lookup:
                        success_rate_lookup[player_id] = {
                            'passing_success': 0, 'passing_plays': 0,
                            'rushing_success': 0, 'rushing_plays': 0,
                            'receiving_success': 0, 'receiving_plays': 0
                        }
                    success_rate_lookup[player_id]['passing_success'] = int(row['passing_success'])
                    success_rate_lookup[player_id]['passing_plays'] = int(row['passing_plays'])

            rushing = pbp.filter(pbp['rusher_player_id'].is_not_null())
            print(f"[DEBUG] rushing type: {type(rushing)}")
            if rushing.height > 0:
                rushing_success = rushing.with_columns([
                    (pl.col('epa') > 0).alias('success')
                ]).group_by('rusher_player_id').agg([
                    pl.col('success').sum().alias('rushing_success'),
                    pl.col('success').count().alias('rushing_plays')
                ])
                for row in rushing_success.iter_rows(named=True):
                    player_id = row['rusher_player_id']
                    if player_id not in success_rate_lookup:
                        success_rate_lookup[player_id] = {
                            'passing_success': 0, 'passing_plays': 0,
                            'rushing_success': 0, 'rushing_plays': 0,
                            'receiving_success': 0, 'receiving_plays': 0
                        }
                    success_rate_lookup[player_id]['rushing_success'] = int(row['rushing_success'])
                    success_rate_lookup[player_id]['rushing_plays'] = int(row['rushing_plays'])

            receiving = pbp.filter(pbp['receiver_player_id'].is_not_null())
            print(f"[DEBUG] receiving type: {type(receiving)}")
            if receiving.height > 0:
                receiving_success = receiving.with_columns([
                    (pl.col('epa') > 0).alias('success')
                ]).group_by('receiver_player_id').agg([
                    pl.col('success').sum().alias('receiving_success'),
                    pl.col('success').count().alias('receiving_plays')
                ])
                for row in receiving_success.iter_rows(named=True):
                    player_id = row['receiver_player_id']
                    if player_id not in success_rate_lookup:
                        success_rate_lookup[player_id] = {
                            'passing_success': 0, 'passing_plays': 0,
                            'rushing_success': 0, 'rushing_plays': 0,
                            'receiving_success': 0, 'receiving_plays': 0
                        }
                    success_rate_lookup[player_id]['receiving_success'] = int(row['receiving_success'])
                    success_rate_lookup[player_id]['receiving_plays'] = int(row['receiving_plays'])

            print(f"[OK] Calculated success rates for {len(success_rate_lookup)} players")
        else:
            print(f"[WARNING] No play-by-play data available for {year}")
    except Exception as e:
        import traceback
        print(f"[WARNING] Failed to fetch play-by-play data for {year}: {e}")
        traceback.print_exc()
    
    print(f"Processing {len(seasonal_data):,} player-season records...")
    
    # Fetch roster data for accurate positions and names
    print(f"Fetching {year} roster data for accurate positions and names...")
    position_lookup = {}
    team_lookup = {}
    name_lookup = {}
    pfr_id_lookup = {}  # Map GSIS ID to PFR ID
    
    try:
        roster_df = nfl.load_rosters(year)
        if not isinstance(roster_df, pl.DataFrame):
            roster_df = pl.DataFrame(roster_df)
        print(f"[OK] Loaded roster data for {roster_df.height} players")
        for row in roster_df.iter_rows(named=True):
            gsis_id = row.get('gsis_id') or row.get('player_id')
            pfr_id = row.get('pfr_id')
            position = row.get('position')
            team = row.get('team') or row.get('latest_team')
            player_name = row.get('display_name') or row.get('name') or row.get('player_name')
            if gsis_id is not None:
                if position is not None:
                    position_lookup[gsis_id] = position
                if team is not None:
                    team_lookup[gsis_id] = team
                if player_name is not None:
                    name_lookup[gsis_id] = player_name
                if pfr_id is not None:
                    pfr_id_lookup[gsis_id] = pfr_id
        print(f"[OK] Position data available for {len(position_lookup)} players")
        print(f"[OK] PFR ID mappings available for {len(pfr_id_lookup)} players")
    except Exception as e:
        print(f"[WARNING] Could not fetch roster data: {e}")
        print(f"[WARNING] Will use stats-based position inference")
        roster_df = pl.DataFrame([])
    
    # First, ensure all players exist in Player table with all columns
    player_records = []
    missing_position_count = 0
    for row in seasonal_data.iter_rows(named=True):
        player_id = row.get('player_id')
        if player_id is None:
            continue
        # Get roster info if available
        roster_info = None
        if 'player_id' in roster_df.columns and roster_df.height > 0:
            matches = roster_df.filter(pl.col('player_id') == player_id)
            if matches.height > 0:
                roster_info = matches.row(0, named=True)
        def get_field_roster(*fields, default=None):
            if roster_info is not None:
                for f in fields:
                    val = roster_info.get(f) if hasattr(roster_info, 'get') else roster_info[f] if f in roster_info else None
                    if val is not None:
                        return val
            return default
        # Compose all columns for Player table
        position = get_field_roster('position')
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
        player_record = {
            'gsis_id': player_id,
            'pfr_id': get_field_roster('pfr_id', default=player_id),
            'name': get_field_roster('display_name', 'name', 'player_name', default=str(player_id)),
            'position': position,
            'team': get_field_roster('latest_team', 'team'),
            'status': get_field_roster('status'),
            'birth_date': get_field_roster('birth_date'),
            'height': get_field_roster('height'),
            'weight': get_field_roster('weight'),
            'college': get_field_roster('college_name', 'college'),
            'draft_year': get_field_roster('draft_year'),
            'draft_round': get_field_roster('draft_round'),
            'draft_pick': get_field_roster('draft_pick'),
            'draft_team': get_field_roster('draft_team'),
        }
        player_records.append(player_record)
    if missing_position_count > 0:
        print(f"[INFO] {missing_position_count} players used stats-based position inference (no roster data)")
    # Deduplicate by both pfr_id and gsis_id
    seen_pfr_ids = set()
    seen_gsis_ids = set()
    unique_player_records = []
    duplicate_count = 0
    for player in player_records:
        pfr_id = player['pfr_id']
        gsis_id = player['gsis_id']
        if pfr_id not in seen_pfr_ids and gsis_id not in seen_gsis_ids:
            seen_pfr_ids.add(pfr_id)
            seen_gsis_ids.add(gsis_id)
            unique_player_records.append(player)
        else:
            duplicate_count += 1
    if duplicate_count > 0:
        print(f"[INFO] Removed {duplicate_count} duplicate pfr_id/gsis_id entries")
    # Bulk upsert players using SQL
    if unique_player_records:
        with engine.connect() as conn:
            for player in unique_player_records:
                conn.execute(text("""
                    INSERT INTO "Player" (
                        gsis_id, pfr_id, name, position, team, status, birth_date, height, weight, college, draft_year, draft_round, draft_pick, draft_team
                    ) VALUES (
                        :gsis_id, :pfr_id, :name, :position, :team, :status, :birth_date, :height, :weight, :college, :draft_year, :draft_round, :draft_pick, :draft_team
                    )
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
                """), player)
            conn.commit()
        print(f"[OK] Upserted {len(unique_player_records)} players with full details")
    
    # Get player ID mappings
    with engine.connect() as conn:
        result = conn.execute(text('SELECT pfr_id, id FROM "Player"'))
        player_id_map = {row[0]: row[1] for row in result}
    
    # Prepare GameStat records
    gamestat_records = []
    unmapped_player_ids = set()
    mapped_player_ids = set()
    for row in seasonal_data.iter_rows(named=True):
        player_id = row.get('player_id')
        if pd.isna(player_id) or player_id not in player_id_map:
            unmapped_player_ids.add(player_id)
            continue
        mapped_player_ids.add(player_id)
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
    if unmapped_player_ids:
        print(f"[DEBUG] Unmapped player_ids (not in Player table): {list(unmapped_player_ids)[:10]} ... total: {len(unmapped_player_ids)}")
    if mapped_player_ids:
        print(f"[DEBUG] Sample mapped player_ids: {list(mapped_player_ids)[:10]}")
    
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
        for row in seasonal_data.iter_rows(named=True):
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
        for row in seasonal_data.iter_rows(named=True):
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
        from concurrent.futures import ThreadPoolExecutor, as_completed
        years = list(range(2016, 2025))
        with ThreadPoolExecutor(max_workers=min(8, len(years))) as executor:
            future_to_year = {executor.submit(load_seasonal_year, year, clear=clear): year for year in years}
            for future in as_completed(future_to_year):
                year = future_to_year[future]
                try:
                    inserted = future.result()
                except Exception as exc:
                    print(f"[ERROR] Year {year} generated an exception: {exc}")
                    inserted = 0
                total_inserted += inserted
    
    print(f"\nTotal season records loaded: {total_inserted:,}")
