import nflreadpy
import polars as pl
import psycopg2
import os
import re
import inspect
from multiprocessing import Pool, cpu_count

# Database connection helpers
def get_database_url():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    return line.strip().split('=', 1)[1]
    return os.getenv('DATABASE_URL')

def parse_database_url(url):
    regex = r'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)'
    match = re.match(regex, url)
    if not match:
        raise ValueError('Invalid DATABASE_URL format')
    user, password, host, port, dbname = match.groups()
    return {
        'user': user,
        'password': password,
        'host': host,
        'port': port,
        'dbname': dbname
    }

# Functions to load and their corresponding tables

funcs = [
    'load_combine', 'load_contracts', 'load_depth_charts', 'load_draft_picks', 'load_ff_opportunity',
    'load_ff_playerids', 'load_ff_rankings', 'load_ftn_charting', 'load_injuries', 'load_nextgen_stats',
    'load_officials', 'load_participation', 'load_pbp', 'load_player_stats', 'load_players', 'load_rosters',
    'load_rosters_weekly', 'load_schedules', 'load_snap_counts', 'load_team_stats', 'load_teams', 'load_trades'
]

# Table unique keys mapping
TABLE_UNIQUE_KEYS = {
    "combine": ["pfr_id"],
    "contracts": ["otc_id", "gsis_id"],
    "depth_charts": ["gsis_id", "season", "week", "elias_id"],
    "draft_picks": ["season", "round", "pick", "pfr_player_id"],
    "ff_opportunity": ["game_id", "player_id"],
    "ff_playerids": ["mfl_id", "sportradar_id", "fantasypros_id", "gsis_id", "pff_id", "sleeper_id", "nfl_id", "pfr_id"],
    "ff_rankings": ["id", "sportsdata_id", "yahoo_id", "cbs_id"],
    "ftn_charting": ["nflverse_game_id", "nflverse_play_id"],
    "nextgen_stats": ["season", "week", "player_gsis_id"],
    "officials": ["game_id", "official_id"],
    "participation": ["nflverse_game_id", "play_id"],
    "pbp": ["game_id", "play_id"],
    "player_stats": ["player_id", "season", "week"],
    "players": ["gsis_id", "esb_id", "nfl_id", "pfr_id", "pff_id", "otc_id", "espn_id", "smart_id"],
    "rosters": ["season", "team", "gsis_id", "espn_id", "sportradar_id", "yahoo_id", "rotowire_id", "pff_id", "pfr_id", "fantasy_data_id", "sleeper_id"],
    "rosters_weekly": ["season", "team", "gsis_id", "espn_id", "sportradar_id", "yahoo_id", "rotowire_id", "pff_id", "pfr_id", "fantasy_data_id", "sleeper_id", "week"],
    "schedules": ["game_id", "season", "week"],
    "snap_counts": ["game_id", "pfr_game_id", "pfr_player_id", "season", "week"],
    "team_stats": ["season", "week"],
    "teams": ["team_id"],
    "trades": ["trade_id", "pfr_id"],
}

def get_default_args(func):
    sig = inspect.signature(func)
    args = {}
    for name, param in sig.parameters.items():
        if param.default != inspect.Parameter.empty:
            args[name] = param.default
    return args

def process_table(fname, creds):
    import numpy as np
    import json
    from psycopg2.extras import execute_values
    conn = psycopg2.connect(
        dbname=creds['dbname'],
        user=creds['user'],
        password=creds['password'],
        host=creds['host'],
        port=creds['port']
    )
    cur = conn.cursor()
    func = getattr(nflreadpy, fname)
    args = get_default_args(func)
    sig = inspect.signature(func)
    if 'seasons' in sig.parameters:
        print(f"Loading {fname} with seasons=True...")
        try:
            df = func(seasons=True, **{k: v for k, v in args.items() if k != 'seasons'})
            if df is not None and len(df) > 0:
                print(f"Loaded {fname} data: {len(df)} rows.")
            else:
                print(f"No data available for {fname}.")
                cur.close()
                conn.close()
                return
        except Exception as e:
            print(f"Error loading {fname} data: {e}")
            cur.close()
            conn.close()
            return
    else:
        print(f"Loading {fname} with default arguments...")
        try:
            df = func(**args) if args else func()
        except Exception as e:
            print(f"Skipping {fname}: {e}")
            cur.close()
            conn.close()
            return
    table_name = fname.replace('load_', '')
    columns = df.columns
    col_names = ', '.join([f'"{col}"' for col in columns])
    unique_cols = TABLE_UNIQUE_KEYS.get(table_name, [])
    print(f"Table: {table_name}")
    print(f"  DataFrame columns: {list(columns)}")
    print(f"  ON CONFLICT columns: {unique_cols}")
    if unique_cols and not all(col in columns for col in unique_cols):
        print(f"  WARNING: Not all ON CONFLICT columns are present in DataFrame for {table_name}. Skipping table.")
        cur.close()
        conn.close()
        return
    if unique_cols:
        conflict_cols = ', '.join([f'"{col}"' for col in unique_cols])
        insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES %s ON CONFLICT ({conflict_cols}) DO NOTHING'
    else:
        insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES %s ON CONFLICT DO NOTHING'
    print(f"Populating table {table_name} with {len(df)} rows...")
    BIGINT_MIN = -9223372036854775808
    BIGINT_MAX = 9223372036854775807
    def serialize_cell(cell):
        if isinstance(cell, (list, np.ndarray)):
            return json.dumps([serialize_cell(x) for x in cell], default=str)
        if isinstance(cell, dict):
            return json.dumps({k: serialize_cell(v) for k, v in cell.items()}, default=str)
        if isinstance(cell, (int, np.integer)):
            if cell < BIGINT_MIN or cell > BIGINT_MAX:
                return str(cell)
        return cell
    try:
        cur.execute(f'TRUNCATE TABLE "{table_name}"')
        chunk_size = 50000
        total_rows = len(df)
        # Use .to_dicts() for fast row extraction
        dict_rows = df.to_dicts()
        for start in range(0, total_rows, chunk_size):
            end = min(start + chunk_size, total_rows)
            chunk_rows = []
            for row in dict_rows[start:end]:
                chunk_rows.append(tuple(serialize_cell(row[col]) for col in columns))
            execute_values(cur, insert_sql, chunk_rows, page_size=chunk_size)
            print(f"Inserted rows {start} to {end} for {table_name}")
        conn.commit()
        print(f"Table {table_name} populated.")
    except Exception as e:
        print(f"Error populating table {table_name}: {e}")
    cur.close()
    conn.close()


# Move worker to top-level for multiprocessing compatibility
def worker(fname):
    # Each process must create its own DB connection
    db_url = get_database_url()
    creds = parse_database_url(db_url)
    process_table(fname, creds)

def main():
    with Pool(processes=min(cpu_count(), len(funcs))) as pool:
        pool.map(worker, funcs)

if __name__ == "__main__":
    main()
