import nflreadpy
import polars as pl
import psycopg2
import os
import re
import inspect
import sys
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
    # An explicit environment variable wins over ingest/.env, so a run can be pointed at another
    # database (e.g. a local dev copy) without editing the file.
    if os.getenv('DATABASE_URL'):
        return os.getenv('DATABASE_URL')
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
    'load_rosters_weekly', 'load_schedules', 'load_snap_counts', 'load_team_stats', 'load_teams', 'load_trades',
    'load_nextgen_rushing', 'load_nextgen_receiving', 'load_depth_charts_current',
    'load_pfr_advstats_pass', 'load_pfr_advstats_rush', 'load_pfr_advstats_rec', 'load_pfr_advstats_def',
]

# Loaders that call an nflreadpy function with fixed arguments: loader name -> (function, kwargs).
# The table name is still derived from the loader name (load_nextgen_rushing -> nextgen_rushing).
LOADER_ALIASES = {
    'load_nextgen_rushing': ('load_nextgen_stats', {'stat_type': 'rushing'}),
    'load_nextgen_receiving': ('load_nextgen_stats', {'stat_type': 'receiving'}),
    'load_depth_charts_current': ('load_depth_charts', {}),
    'load_pfr_advstats_pass': ('load_pfr_advstats', {'stat_type': 'pass', 'summary_level': 'week'}),
    'load_pfr_advstats_rush': ('load_pfr_advstats', {'stat_type': 'rush', 'summary_level': 'week'}),
    'load_pfr_advstats_rec': ('load_pfr_advstats', {'stat_type': 'rec', 'summary_level': 'week'}),
    'load_pfr_advstats_def': ('load_pfr_advstats', {'stat_type': 'def', 'summary_level': 'week'}),
}

# Datasets nflverse publishes as complete snapshots: the table is replaced on every load (inside
# the load's transaction, so readers keep seeing the old rows until it commits).
REPLACE_TABLES = {'contracts', 'depth_charts_current'}

# nflverse lists relocated and alias franchises (LAR for LA, OAK, SD, STL) next to the 32 current
# teams; they share team_id, so keeping them would make the stored abbreviation depend on load order.
TEAM_ALIASES = {'LAR', 'OAK', 'SD', 'STL'}


def transform(table_name, df):
    """Per-table adjustments applied after download and before insert."""
    if table_name == 'depth_charts_current' and 'dt' in df.columns and len(df):
        # Since 2026 nflverse publishes timestamped snapshots; keep only the newest one.
        df = df.filter(pl.col('dt') == df['dt'].max())
    if table_name == 'teams' and 'team_abbr' in df.columns:
        df = df.filter(~pl.col('team_abbr').is_in(list(TEAM_ALIASES)))
    if table_name == 'contracts':
        # The snapshot repeats some rows verbatim; distinct deals can share player, team and year.
        flat = [c for c in df.columns if df.schema[c] not in (pl.List, pl.Struct) and not isinstance(df.schema[c], (pl.List, pl.Struct))]
        df = df.unique(subset=flat, keep='first', maintain_order=True)
    if table_name == 'injuries' and 'gsis_id' in df.columns:
        df = df.filter(pl.col('gsis_id').is_not_null())
    return df


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
    "depth_charts": ["gsis_id", "season", "week", "elias_id"],
    "draft_picks": ["season", "round", "pick", "pfr_player_id"],
    "ff_opportunity": ["game_id", "player_id"],
    "ff_playerids": ["mfl_id", "sportradar_id", "fantasypros_id", "gsis_id", "pff_id", "sleeper_id", "nfl_id", "pfr_id"],
    "ff_rankings": ["id", "sportsdata_id", "yahoo_id", "cbs_id"],
    "ftn_charting": ["nflverse_game_id", "nflverse_play_id"],
    "nextgen_stats": ["season", "week", "player_gsis_id"],
    "nextgen_rushing": ["season", "week", "player_gsis_id"],
    "nextgen_receiving": ["season", "week", "player_gsis_id"],
    "officials": ["game_id", "official_id"],
    "participation": ["nflverse_game_id", "play_id"],
    "pbp": ["game_id", "play_id"],
    "player_stats": ["player_id", "season", "week"],
    # gsis_id alone: the old 8-column key was mostly NULL, so ON CONFLICT never matched and
    # every run appended a duplicate of every player.
    "players": ["gsis_id"],
    "rosters": ["season", "team", "gsis_id", "espn_id", "sportradar_id", "yahoo_id", "rotowire_id", "pff_id", "pfr_id", "fantasy_data_id", "sleeper_id"],
    "rosters_weekly": ["season", "team", "gsis_id", "espn_id", "sportradar_id", "yahoo_id", "rotowire_id", "pff_id", "pfr_id", "fantasy_data_id", "sleeper_id", "week"],
    "schedules": ["game_id", "season", "week"],
    "snap_counts": ["game_id", "pfr_game_id", "pfr_player_id", "season", "week"],
    "team_stats": ["season", "week", "team"],
    "injuries": ["season", "game_type", "week", "gsis_id"],
    "pfr_advstats_pass": ["game_id", "pfr_player_id"],
    "pfr_advstats_rush": ["game_id", "pfr_player_id"],
    "pfr_advstats_rec": ["game_id", "pfr_player_id"],
    "pfr_advstats_def": ["game_id", "pfr_player_id"],
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

def select_table_columns(cur, table_name, df):
    """Keep only the DataFrame columns the table has.

    nflverse adds columns over time (e.g. player_stats.game_id in 2026); inserting an unknown
    column fails the whole table, so new upstream columns are dropped with a warning instead.
    """
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = %s",
        (table_name,),
    )
    table_columns = {row[0] for row in cur.fetchall()}
    if not table_columns:
        return df
    extra = [c for c in df.columns if c not in table_columns]
    if extra:
        print(f"  WARNING: Ignoring columns not in table {table_name}: {extra}")
    return df.select([c for c in df.columns if c in table_columns])


def process_table(fname, creds):
    """Load one nflreadpy dataset into its table. Returns False if the table failed to load."""
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
    base_name, fixed_args = LOADER_ALIASES.get(fname, (fname, {}))
    func = getattr(nflreadpy, base_name)
    args = {**get_default_args(func), **fixed_args}
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
                return True
        except Exception as e:
            print(f"Error loading {fname} data: {e}")
            cur.close()
            conn.close()
            return False
    else:
        print(f"Loading {fname} with default arguments...")
        try:
            df = func(**args) if args else func()
        except Exception as e:
            print(f"Skipping {fname}: {e}")
            cur.close()
            conn.close()
            return False
    table_name = fname.replace('load_', '')
    upsert = upsert_all if upsert_tables is None else (table_name in upsert_tables)
    df = transform(table_name, df)
    df = select_table_columns(cur, table_name, df)
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
        return False
    if table_name == 'players':
        df = df.filter(pl.col('gsis_id').is_not_null())
    if upsert and unique_cols:
        # A batch with a repeated key makes ON CONFLICT DO UPDATE fail; keep the last row per key.
        df = df.unique(subset=unique_cols, keep='last', maintain_order=True)
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
    def jsonable(value):
        if isinstance(value, np.ndarray):
            value = value.tolist()
        if isinstance(value, list):
            return [jsonable(v) for v in value]
        if isinstance(value, dict):
            return {k: jsonable(v) for k, v in value.items()}
        return value

    def serialize_cell(cell):
        # Nested values (lists, structs) are stored as one JSON document, encoded once.
        if isinstance(cell, (list, np.ndarray, dict)):
            return json.dumps(jsonable(cell), default=str)
        if isinstance(cell, (int, np.integer)):
            if cell < BIGINT_MIN or cell > BIGINT_MAX:
                return str(cell)
        return cell
    try:
        if clear_before_load or table_name in REPLACE_TABLES:
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
        return False
    cur.close()
    conn.close()
    return True


# Move worker to top-level for multiprocessing compatibility
def worker(fname):
    # Each process must create its own DB connection
    try:
        db_url = get_database_url()
        creds = parse_database_url(db_url)
        return process_table(fname, creds)
    except Exception as e:
        print(f"Error processing {fname}: {e}")
        return False

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
        results = pool.map(worker, selected_funcs)

    # Finalize even after partial failures: the tables that did load still need fresh stats,
    # the season view refreshed and the API cache invalidated.
    finalized = finalize_load([f.replace('load_', '') for f in selected_funcs])

    failed = [f for f, ok in zip(selected_funcs, results) if not ok]
    if failed or not finalized:
        # Exit non-zero so the workflow run is marked as failed.
        print(f"Ingestion finished with errors. Failed loaders: {', '.join(failed) or 'none'}; "
              f"finalize {'succeeded' if finalized else 'failed'}.")
        sys.exit(1)


# Materialized views the API reads, and the tables each is built from.
MATERIALIZED_VIEWS = {
    'player_season_stats': {'player_stats', 'players', 'snap_counts'},
    'player_week_pbp': {'pbp'},
    'team_game_pbp': {'pbp'},
}


def finalize_load(tables):
    """Refresh planner statistics after bulk loads so the API's queries get good plans, then
    bump app_meta.data_version so the API drops its cached responses. Returns False on any error."""
    creds = parse_database_url(get_database_url())
    conn = psycopg2.connect(
        dbname=creds['dbname'],
        user=creds['user'],
        password=creds['password'],
        host=creds['host'],
        port=creds['port']
    )
    conn.autocommit = True
    cur = conn.cursor()
    ok = True
    for table_name in tables:
        try:
            cur.execute(f'ANALYZE "{table_name}"')
            print(f"Analyzed {table_name}")
        except Exception as e:
            print(f"Error analyzing {table_name}: {e}")
            ok = False
    # Views and model outputs must be current before data_version tells the API to re-cache.
    for view, sources in MATERIALIZED_VIEWS.items():
        if not (sources & set(tables)):
            continue
        try:
            cur.execute(f'REFRESH MATERIALIZED VIEW CONCURRENTLY {view}')
            cur.execute(f'ANALYZE {view}')
            print(f"Refreshed {view}")
        except Exception as e:
            print(f"Error refreshing {view}: {e}")
            ok = False
    try:
        import models
        models.run(conn)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error running models: {e}")
        ok = False
    try:
        cur.execute(
            "INSERT INTO app_meta (key, value, updated_at) "
            "VALUES ('data_version', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'), now()) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at"
        )
        print("Bumped data_version")
    except Exception as e:
        print(f"Error bumping data_version: {e}")
        ok = False
    cur.close()
    conn.close()
    return ok

if __name__ == "__main__":
    main()
