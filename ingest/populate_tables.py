import nflreadpy
import polars as pl
import psycopg2
import os
import re
import inspect
from datetime import datetime
from multiprocessing import Pool, cpu_count

_LATEST_SEASON_CACHE = None


def get_latest_season_cached():
    global _LATEST_SEASON_CACHE
    if _LATEST_SEASON_CACHE is not None:
        return _LATEST_SEASON_CACHE

    # Best-effort detection using schedules (usually small and always has season).
    try:
        df = nflreadpy.load_schedules(seasons=True)
        if df is not None and len(df) > 0 and 'season' in df.columns:
            if isinstance(df, pl.DataFrame):
                latest = int(df.select(pl.col('season').max()).item())
            else:
                latest = int(max(df['season']))
            _LATEST_SEASON_CACHE = latest
            return latest
    except Exception as e:
        print(f"WARNING: Could not auto-detect latest season via schedules: {e}")

    _LATEST_SEASON_CACHE = datetime.now().year
    return _LATEST_SEASON_CACHE

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


def get_selected_funcs():
    """Select which nflreadpy loaders to run.

    Env:
      TABLES: comma-separated list of table names (e.g. "pbp,player_stats")
      LOADERS: comma-separated list of loader function names (e.g. "load_pbp,load_player_stats")

    If neither is provided, runs the full `funcs` list.
    """

    loaders_raw = os.getenv('LOADERS', '').strip()
    tables_raw = os.getenv('TABLES', '').strip()

    if loaders_raw:
        wanted = {x.strip() for x in loaders_raw.split(',') if x.strip()}
        selected = [f for f in funcs if f in wanted]
        return selected

    if tables_raw:
        wanted_tables = {x.strip() for x in tables_raw.split(',') if x.strip()}
        wanted_loaders = {f'load_{t}' for t in wanted_tables}
        selected = [f for f in funcs if f in wanted_loaders]
        return selected

    return funcs

# Table unique keys mapping
TABLE_UNIQUE_KEYS = {
    "combine": ["pfr_id"],
    "contracts": ["otc_id", "gsis_id", "year_signed", "team"],
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

    # Performance/behavior knobs
    # - CLEAR_BEFORE_LOAD=1 will TRUNCATE a table before loading (destructive)
    # - UPSERT=1 will update existing rows on conflict (slower than DO NOTHING)
    # - SEASONS="2025" or "2024,2025" limits loads to specific seasons when supported by nflreadpy
    # - LATEST_SEASON=1 auto-detects the newest season and loads only that
    # - CHUNK_SIZE controls bulk insert batch size
    clear_before_load = os.getenv('CLEAR_BEFORE_LOAD', '').strip().lower() in {'1', 'true', 'yes', 'y'}
    upsert_all = os.getenv('UPSERT', '').strip().lower() in {'1', 'true', 'yes', 'y'}
    upsert_tables_raw = os.getenv('UPSERT_TABLES', '').strip()
    upsert_tables = None
    if upsert_tables_raw:
        upsert_tables = {t.strip() for t in upsert_tables_raw.split(',') if t.strip()}
    chunk_size = int(os.getenv('CHUNK_SIZE', '50000'))
    seasons_raw = os.getenv('SEASONS', '').strip()
    latest_season_mode = os.getenv('LATEST_SEASON', '').strip().lower() in {'1', 'true', 'yes', 'y'}
    seasons_filter = None
    if seasons_raw:
        seasons_filter = [int(s.strip()) for s in seasons_raw.split(',') if s.strip().isdigit()]
        if not seasons_filter:
            seasons_filter = None
    if 'seasons' in sig.parameters:
        if seasons_filter is not None:
            seasons_value = seasons_filter
        elif latest_season_mode:
            seasons_value = [get_latest_season_cached()]
        else:
            seasons_value = True
        print(f"Loading {fname} with seasons={seasons_value}...")
        try:
            df = func(seasons=seasons_value, **{k: v for k, v in args.items() if k != 'seasons'})
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
    upsert = upsert_all if upsert_tables is None else (table_name in upsert_tables)
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
        if upsert:
            updatable_cols = [c for c in columns if c not in unique_cols]
            if updatable_cols:
                set_clause = ', '.join([f'"{col}" = EXCLUDED."{col}"' for col in updatable_cols])
                insert_sql = (
                    f'INSERT INTO "{table_name}" ({col_names}) VALUES %s '
                    f'ON CONFLICT ({conflict_cols}) DO UPDATE SET {set_clause}'
                )
            else:
                insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES %s ON CONFLICT ({conflict_cols}) DO NOTHING'
        else:
            # Fastest for incremental loads when rows are append-only.
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
        if clear_before_load:
            cur.execute(f'TRUNCATE TABLE "{table_name}"')
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
    selected_funcs = get_selected_funcs()
    if not selected_funcs:
        print('No loaders selected. Set TABLES or LOADERS, or leave unset to run all.')
        return

    requested = os.getenv('PROCESSES', '').strip()
    processes = min(cpu_count(), len(selected_funcs))
    if requested.isdigit():
        processes = max(1, min(int(requested), len(selected_funcs)))
    with Pool(processes=processes) as pool:
        pool.map(worker, selected_funcs)

if __name__ == "__main__":
    main()
