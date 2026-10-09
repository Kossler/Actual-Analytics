"""Which nflverse files each table is loaded from, and whether they changed since the last load.

nflverse publishes every dataset as a file on a GitHub release (github.com/nflverse/nflverse-data).
Each dataset has its own schedule, and the actual publish times drift (their jobs queue on GitHub
Actions and wait on upstream sources such as PFR, Next Gen Stats and FTN), so instead of guessing
times the ingest polls: a HEAD request returns each file's ETag without downloading it (and without
touching GitHub's API rate limit), and a table is reloaded only when one of its files changed.

  python sources.py check     # print the tables whose files changed (and write them to
                              # $GITHUB_OUTPUT as `tables=...` when running in Actions)
"""
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

BASE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/'

# Table -> release files it is loaded from ({season} is the season being loaded). Must match the
# paths nflreadpy downloads for each loader in populate_tables.py.
SOURCE_FILES = {
    'schedules': ['schedules/games.parquet'],
    'teams': ['teams/teams_colors_logos.parquet'],
    'players': ['players/players.parquet'],
    'contracts': ['contracts/historical_contracts.parquet'],
    'rosters_weekly': ['weekly_rosters/roster_weekly_{season}.parquet'],
    'player_stats': ['stats_player/stats_player_week_{season}.parquet'],
    'pbp': ['pbp/play_by_play_{season}.parquet'],
    'snap_counts': ['snap_counts/snap_counts_{season}.parquet'],
    'injuries': ['injuries/injuries_{season}.parquet'],
    'depth_charts_current': ['depth_charts/depth_charts_{season}.parquet'],
    'ftn_charting': ['ftn_charting/ftn_charting_{season}.parquet'],
    # Published only after each season ends; until then the file doesn't exist and nothing loads.
    'participation': ['pbp_participation/pbp_participation_{season}.parquet'],
    'nextgen_stats': ['nextgen_stats/ngs_passing.parquet'],
    'nextgen_rushing': ['nextgen_stats/ngs_rushing.parquet'],
    'nextgen_receiving': ['nextgen_stats/ngs_receiving.parquet'],
    'pfr_advstats_pass': ['pfr_advstats/advstats_week_pass_{season}.parquet'],
    'pfr_advstats_rush': ['pfr_advstats/advstats_week_rush_{season}.parquet'],
    'pfr_advstats_rec': ['pfr_advstats/advstats_week_rec_{season}.parquet'],
    'pfr_advstats_def': ['pfr_advstats/advstats_week_def_{season}.parquet'],
    # Expected fantasy points, from ffverse rather than nflverse.
    'ff_opportunity': ['https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_{season}.parquet'],
    # Sleeper's players file (depth charts). Sleeper asks for at most one fetch a day, so it isn't
    # checked: its version is the UTC date, which makes it load on the first run of each day.
    'depth_charts_sleeper': ['https://api.sleeper.app/v1/players/nfl'],
}
DAILY_FILES = {'https://api.sleeper.app/v1/players/nfl'}


def source_urls(table, season):
    return [(path if path.startswith('https://') else BASE_URL + path).format(season=season)
            for path in SOURCE_FILES.get(table, [])]


def file_version(url, attempts=3):
    """The file's ETag (falling back to Last-Modified and size), or None if it is not published
    (e.g. a new season's file before its first game). GitHub's release downloads fail now and then
    (500s, timeouts); after retrying, an unreachable file also returns None, so its table is skipped
    this run and checked again on the next one instead of failing the whole check."""
    for attempt in range(attempts):
        try:
            res = requests.head(url, allow_redirects=True, timeout=30,
                                headers={'User-Agent': 'second-level-analytics-ingest'})
            if res.status_code == 404:
                return None
            res.raise_for_status()
            return res.headers.get('ETag') or f"{res.headers.get('Last-Modified')}|{res.headers.get('Content-Length')}"
        except requests.RequestException as e:
            if attempt == attempts - 1:
                print(f"WARNING: could not check {url} ({e}); skipping it this run", file=sys.stderr)
                return None
            time.sleep(3 * (attempt + 1))


def current_versions(tables, season):
    """{table: {url: version}} for every table's files, checked in parallel."""
    pairs = [(t, url) for t in tables for url in source_urls(t, season)]
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    with ThreadPoolExecutor(max_workers=8) as pool:
        versions = list(pool.map(lambda p: today if p[1] in DAILY_FILES else file_version(p[1]), pairs))
    out = {t: {} for t in tables}
    for (t, url), version in zip(pairs, versions):
        out[t][url] = version
    return out


def loaded_versions(cur):
    """{url: version} recorded after the last successful load of each file. Empty if the
    source_files table does not exist yet (every table then counts as changed)."""
    try:
        cur.execute('SELECT url, version FROM source_files')
        return dict(cur.fetchall())
    except Exception:
        cur.connection.rollback()
        return {}


def changed_tables(cur, tables, season):
    """(changed, versions): the tables with a published file that differs from what was last
    loaded, and the versions seen now (to record once those tables load). Tables without a
    known source file always count as changed."""
    versions = current_versions(tables, season)
    loaded = loaded_versions(cur)
    changed = []
    for t in tables:
        files = versions[t]
        if not SOURCE_FILES.get(t):
            changed.append(t)
        elif any(v is not None and loaded.get(url) != v for url, v in files.items()):
            changed.append(t)
    return changed, versions


def record_loaded(cur, table, files):
    """Remember the versions just loaded for a table's files."""
    for url, version in files.items():
        if version is None:
            continue
        cur.execute(
            'INSERT INTO source_files (url, table_name, version, loaded_at) VALUES (%s, %s, %s, now()) '
            'ON CONFLICT (url) DO UPDATE SET version = EXCLUDED.version, table_name = EXCLUDED.table_name, '
            'loaded_at = EXCLUDED.loaded_at',
            (url, table, version),
        )


def get_database_url():
    """DATABASE_URL from the environment, else from ingest/.env (as populate_tables reads it)."""
    if os.getenv('DATABASE_URL'):
        return os.getenv('DATABASE_URL')
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    return line.strip().split('=', 1)[1]
    raise SystemExit('DATABASE_URL is not set')


def latest_season(cur):
    """The season the ingest loads: the newest one on the schedule (as populate_tables does)."""
    cur.execute('SELECT MAX(season)::INT FROM schedules')
    return cur.fetchone()[0]


def main():
    if sys.argv[1:] != ['check']:
        print(__doc__)
        sys.exit(2)
    import psycopg2

    tables = [t.strip() for t in (os.getenv('TABLES') or ','.join(SOURCE_FILES)).split(',') if t.strip()]
    conn = psycopg2.connect(get_database_url())
    cur = conn.cursor()
    season = latest_season(cur)
    changed, versions = changed_tables(cur, tables, season)
    conn.close()
    for t in tables:
        state = 'changed' if t in changed else 'unchanged'
        missing = [u.rsplit('/', 1)[-1] for u, v in versions[t].items() if v is None]
        print(f"{t}: {state}{f' (not published yet: {missing})' if missing else ''}")
    print(f"Changed since last load ({season} season): {', '.join(changed) or 'none'}")
    output = os.getenv('GITHUB_OUTPUT')
    if output:
        with open(output, 'a') as f:
            f.write(f"tables={','.join(changed)}\n")


if __name__ == '__main__':
    main()
