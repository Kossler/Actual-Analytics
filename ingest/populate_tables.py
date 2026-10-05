import nflreadpy
from nflreadpy.config import update_config
import polars as pl
import psycopg2
import os
import re
import inspect
import sys
from datetime import datetime
import multiprocessing
import time
from multiprocessing import cpu_count

# nflreadpy caches every download in memory by default. Each file is read once per run here, so the
# cache only holds memory: during a multi-season backfill it would keep every season resident.
update_config(cache_mode='off', verbose=False)

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
    'load_depth_charts_sleeper',
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

# Loaders for sources other than nflreadpy: loader name -> function(creds) returning a DataFrame.
def _sleeper_depth_charts(creds):
    import depth_charts
    return depth_charts.fetch(creds)


CUSTOM_LOADERS = {'load_depth_charts_sleeper': _sleeper_depth_charts}

# Datasets nflverse publishes as complete snapshots: the table is replaced on every load (inside
# the load's transaction, so readers keep seeing the old rows until it commits).
REPLACE_TABLES = {'contracts', 'depth_charts_current', 'depth_charts_sleeper'}

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


# First season of each loader that downloads one file per season. Multi-season loads of these run
# one season at a time (download, insert, commit) so memory stays bounded: the full play-by-play
# history is ~1.3M rows x 372 columns and does not fit in a CI runner's memory in one piece.
SEASON_FILE_START = {
    'load_pbp': 1999,
    'load_player_stats': 1999,
    'load_team_stats': 1999,
    'load_rosters': 1999,
    'load_rosters_weekly': 2002,
    'load_snap_counts': 2012,
    'load_injuries': 2009,
    'load_participation': 2016,
    'load_ftn_charting': 2022,
    'load_ff_opportunity': 2006,
    'load_pfr_advstats': 2018,
    'load_depth_charts': 2001,
}

# Loaders that only make sense for the current season.
CURRENT_SEASON_ONLY = {'load_depth_charts_current'}

# Upper bound on cells converted to Python objects per insert batch.
MAX_CELLS_PER_BATCH = 2_000_000

BIGINT_MIN = -9223372036854775808
BIGINT_MAX = 9223372036854775807


def env_flag(name):
    return os.getenv(name, '').strip().lower() in {'1', 'true', 'yes', 'y'}


def requested_seasons():
    """SEASONS="2024,2025" > LATEST_SEASON=1 > every season (True)."""
    raw = os.getenv('SEASONS', '').strip()
    if raw:
        seasons = [int(x.strip()) for x in raw.split(',') if x.strip().isdigit()]
        if seasons:
            return seasons
    if env_flag('LATEST_SEASON'):
        return [get_latest_season_cached()]
    return True


def season_batches(fname, base_name, seasons):
    """Split a load into per-season batches for loaders that publish one file per season."""
    current = get_latest_season_cached()
    if fname in CURRENT_SEASON_ONLY:
        return [[current]]
    first = SEASON_FILE_START.get(base_name)
    if first is None:
        return [seasons]
    years = list(range(first, current + 1)) if seasons is True else list(seasons)
    return [[year] for year in years]


def jsonable(value):
    import numpy as np
    if isinstance(value, np.ndarray):
        value = value.tolist()
    if isinstance(value, list):
        return [jsonable(v) for v in value]
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    return value


def serialize_cell(cell):
    import json
    import numpy as np
    # Nested values (lists, structs) are stored as one JSON document, encoded once.
    if isinstance(cell, (list, np.ndarray, dict)):
        return json.dumps(jsonable(cell), default=str)
    if isinstance(cell, (int, np.integer)) and (cell < BIGINT_MIN or cell > BIGINT_MAX):
        return str(cell)
    return cell


def insert_frame(cur, table_name, df, upsert, chunk_size):
    """Insert one DataFrame into its table. Returns the number of rows sent, or None on a schema problem."""
    from psycopg2.extras import execute_values

    df = transform(table_name, df)
    df = select_table_columns(cur, table_name, df)
    columns = df.columns
    unique_cols = TABLE_UNIQUE_KEYS.get(table_name, [])
    if unique_cols and not all(col in columns for col in unique_cols):
        print(f"  WARNING: Not all ON CONFLICT columns {unique_cols} are present for {table_name}. Skipping.")
        return None
    if table_name == 'players':
        df = df.filter(pl.col('gsis_id').is_not_null())
    if upsert and unique_cols:
        # A batch with a repeated key makes ON CONFLICT DO UPDATE fail; keep the last row per key.
        df = df.unique(subset=unique_cols, keep='last', maintain_order=True)

    col_names = ', '.join(f'"{col}"' for col in columns)
    if unique_cols:
        conflict_cols = ', '.join(f'"{col}"' for col in unique_cols)
        updatable = [c for c in columns if c not in unique_cols]
        if upsert and updatable:
            set_clause = ', '.join(f'"{col}" = EXCLUDED."{col}"' for col in updatable)
            insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES %s ON CONFLICT ({conflict_cols}) DO UPDATE SET {set_clause}'
        else:
            insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES %s ON CONFLICT ({conflict_cols}) DO NOTHING'
    else:
        insert_sql = f'INSERT INTO "{table_name}" ({col_names}) VALUES %s ON CONFLICT DO NOTHING'

    # Convert to Python rows one slice at a time; wide tables (pbp) get smaller slices.
    rows_per_batch = max(500, min(chunk_size, MAX_CELLS_PER_BATCH // max(len(columns), 1)))
    for offset in range(0, len(df), rows_per_batch):
        batch = df.slice(offset, rows_per_batch).to_dicts()
        values = [tuple(serialize_cell(row[col]) for col in columns) for row in batch]
        execute_values(cur, insert_sql, values, page_size=rows_per_batch)
    return len(df)


def loader_tasks(fname):
    """Split a loader into tasks: one per season for per-season files, otherwise one task."""
    if fname in CUSTOM_LOADERS:
        return [(fname, None)]
    base_name, _ = LOADER_ALIASES.get(fname, (fname, {}))
    func = getattr(nflreadpy, base_name)
    if 'seasons' not in inspect.signature(func).parameters:
        return [(fname, None)]
    return [(fname, batch) for batch in season_batches(fname, base_name, requested_seasons())]


def process_table(fname, creds, seasons=None):
    """Load one batch of an nflreadpy dataset into its table: one season (``seasons=[2024]``) for
    per-season loaders, or the whole dataset (``seasons=None``). Returns (ok, rows).

    Env knobs: UPSERT / UPSERT_TABLES (update on conflict), CLEAR_BEFORE_LOAD (truncate first;
    REPLACE_TABLES always are), CHUNK_SIZE (max rows per insert statement).
    """
    if fname in CUSTOM_LOADERS:
        func, args = CUSTOM_LOADERS[fname], {'creds': creds}
    else:
        base_name, fixed_args = LOADER_ALIASES.get(fname, (fname, {}))
        func = getattr(nflreadpy, base_name)
        args = {**get_default_args(func), **fixed_args}
    table_name = fname.replace('load_', '')
    label = fname + (f" seasons={seasons}" if seasons is not None else "")

    upsert_tables_raw = os.getenv('UPSERT_TABLES', '').strip()
    if upsert_tables_raw:
        upsert = table_name in {t.strip() for t in upsert_tables_raw.split(',') if t.strip()}
    else:
        upsert = env_flag('UPSERT')
    chunk_size = int(os.getenv('CHUNK_SIZE', '50000'))

    df = None
    for attempt in range(1, 4):
        try:
            if seasons is None:
                df = func(**args)
            else:
                df = func(seasons=seasons, **{k: v for k, v in args.items() if k != 'seasons'})
            break
        except ConnectionError as e:
            # GitHub release downloads occasionally drop; retry with backoff before giving up.
            if attempt == 3:
                print(f"Error loading {label} after {attempt} attempts: {e}")
                return False, 0
            print(f"Retrying {label} (attempt {attempt} failed: {str(e)[:120]})")
            time.sleep(5 * attempt)
        except Exception as e:
            print(f"Error loading {label}: {e}")
            return False, 0
    if df is None or len(df) == 0:
        print(f"No data for {label}.")
        return True, 0

    conn = psycopg2.connect(
        dbname=creds['dbname'],
        user=creds['user'],
        password=creds['password'],
        host=creds['host'],
        port=creds['port']
    )
    cur = conn.cursor()
    try:
        # Snapshot tables (REPLACE_TABLES) are single-batch loads, so truncating here is safe.
        if env_flag('CLEAR_BEFORE_LOAD') or table_name in REPLACE_TABLES:
            cur.execute(f'TRUNCATE TABLE "{table_name}"')
        inserted = insert_frame(cur, table_name, df, upsert, chunk_size)
        if inserted is None:
            conn.rollback()
            return False, 0
        conn.commit()
        print(f"Loaded {label}: {inserted} rows into {table_name}")
        return True, inserted
    except Exception as e:
        conn.rollback()
        print(f"Error populating {table_name} from {label}: {e}")
        return False, 0
    finally:
        cur.close()
        conn.close()


# Move worker to top-level for multiprocessing compatibility
def worker(task):
    # Each process must create its own DB connection
    fname, seasons = task
    try:
        creds = parse_database_url(get_database_url())
        return process_table(fname, creds, seasons)
    except Exception as e:
        print(f"Error processing {fname} {seasons or ''}: {e}")
        return False, 0

def check_sources(selected_funcs, changed_only):
    """Read the current version of every selected table's nflverse files before downloading, so
    the versions can be recorded once the loads succeed. With changed_only (CHANGED_ONLY=1), also
    drop the loaders whose files are unchanged since their last load. Returns (loaders, versions);
    versions is None for multi-season loads (backfills), which are not tracked."""
    import sources
    seasons = requested_seasons()
    if seasons is True or len(seasons) != 1:
        if changed_only:
            print('CHANGED_ONLY applies to single-season loads; loading everything selected.')
        return selected_funcs, None
    creds = parse_database_url(get_database_url())
    conn = psycopg2.connect(dbname=creds['dbname'], user=creds['user'], password=creds['password'],
                            host=creds['host'], port=creds['port'])
    try:
        tables = [f.replace('load_', '') for f in selected_funcs]
        changed, versions = sources.changed_tables(conn.cursor(), tables, seasons[0])
    finally:
        conn.close()
    if not changed_only:
        return selected_funcs, versions
    skipped = [t for t in tables if t not in changed]
    if skipped:
        print(f"Unchanged since the last load, skipping: {', '.join(skipped)}")
    return [f for f in selected_funcs if f.replace('load_', '') in changed], versions


def record_versions(versions, loaded_tables):
    """Store the file versions of the tables that loaded, so the next run can skip them."""
    import sources
    creds = parse_database_url(get_database_url())
    conn = psycopg2.connect(dbname=creds['dbname'], user=creds['user'], password=creds['password'],
                            host=creds['host'], port=creds['port'])
    try:
        with conn, conn.cursor() as cur:
            for table in loaded_tables:
                sources.record_loaded(cur, table, versions.get(table, {}))
    except Exception as e:
        # Not fatal: those tables just reload on the next run.
        print(f"WARNING: could not record source versions: {e}")
    finally:
        conn.close()


def main():
    selected_funcs = get_selected_funcs()
    if not selected_funcs:
        print('No loaders selected. Set TABLES or LOADERS, or leave unset to run all.')
        return
    try:
        selected_funcs, versions = check_sources(selected_funcs, env_flag('CHANGED_ONLY'))
    except Exception as e:
        # Can't tell what changed (e.g. GitHub unreachable): load everything selected.
        print(f"WARNING: could not check source versions, loading everything selected: {e}")
        versions = None
    if not selected_funcs:
        print('No source files changed since the last load; nothing to do.')
        return

    requested = os.getenv('PROCESSES', '').strip()
    processes = min(cpu_count(), len(selected_funcs))
    if requested.isdigit():
        processes = max(1, min(int(requested), len(selected_funcs)))
    # One task per season for per-season datasets. maxtasksperchild=1 gives every task a fresh
    # process, so memory from one season (polars/pyarrow do not always return it to the OS) is
    # released before the next starts; a full-history backfill stays at one season's footprint.
    tasks = [task for fname in selected_funcs for task in loader_tasks(fname)]
    # 'spawn', not Linux's default 'fork': the parent has already downloaded the schedule (to find the
    # current season), and forked workers would share its open TLS connection, corrupting each
    # other's downloads (SSL "bad record mac" / "wrong version number" errors, then hangs).
    with multiprocessing.get_context('spawn').Pool(processes=processes, maxtasksperchild=1) as pool:
        task_results = pool.map(worker, tasks, chunksize=1)

    results = []
    for fname in selected_funcs:
        outcomes = [r for (f, _), r in zip(tasks, task_results) if f == fname]
        rows = sum(r[1] for r in outcomes)
        ok = all(r[0] for r in outcomes)
        print(f"Table {fname.replace('load_', '')}: {rows} rows loaded{'' if ok else ' (with errors)'}.")
        results.append(ok)

    # Finalize even after partial failures: the tables that did load still need fresh stats,
    # the season view refreshed and the API cache invalidated.
    finalized = finalize_load([f.replace('load_', '') for f in selected_funcs])
    if versions is not None:
        record_versions(versions, [f.replace('load_', '') for f, ok in zip(selected_funcs, results) if ok])

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
    'player_week_def_pbp': {'pbp'},
    'player_week_adv': {'pbp', 'ftn_charting'},
    'player_week_kicking': {'pbp'},
    'player_week_ol': {'pbp', 'snap_counts', 'players', 'pfr_advstats_pass', 'pfr_advstats_rush'},
    'team_game_pbp': {'pbp'},
    'team_game_adv': {'pbp', 'ftn_charting'},
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
            try:
                cur.execute(f'REFRESH MATERIALIZED VIEW CONCURRENTLY {view}')
            except psycopg2.OperationalError as e:
                # Parallel workers need shared memory; small Postgres containers can run out.
                if 'shared memory' not in str(e):
                    raise
                print(f"  {view}: out of shared memory, retrying without parallel workers")
                cur.execute('SET max_parallel_workers_per_gather = 0')
                cur.execute(f'REFRESH MATERIALIZED VIEW CONCURRENTLY {view}')
                cur.execute('RESET max_parallel_workers_per_gather')
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
