"""Depth charts from Sleeper (https://docs.sleeper.com/), loaded into depth_charts_sleeper.

Sleeper's players file lists every player's depth chart spot (depth_chart_position, e.g. QB, LWR,
LDE, and depth_chart_order). Sleeper asks that the file be fetched at most once a day; sources.py
gives it a daily version, so scheduled runs load it on the first check of each UTC day.

The file is free for non-commercial use. It doesn't order offensive linemen (they are all "OL") or
list returners and holders, so the depth_chart view fills those spots from nflverse's chart.
"""
import re
from collections import defaultdict
from datetime import datetime, timezone

import nflreadpy
import polars as pl
import psycopg2
import requests

PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl'

# Sleeper abbreviations that differ from nflverse's.
TEAMS = {'LAR': 'LA'}

# Sleeper position -> (unit, abbreviation shown, name, slot). Slots order the spots like nflverse's
# chart (WR, WR, line, slot WR, QB, TE, RB, FB) and leave room for the spots the view takes from
# nflverse: linemen 3-7 and, on special teams, holder 3, punt returner 4, kick returner 5.
SPOTS = {
    'LWR': ('Offense', 'WR', 'Wide Receiver', 1),
    'RWR': ('Offense', 'WR', 'Wide Receiver', 2),
    'SWR': ('Offense', 'WR', 'Slot Receiver', 8),
    'QB': ('Offense', 'QB', 'Quarterback', 9),
    'TE': ('Offense', 'TE', 'Tight End', 10),
    'RB': ('Offense', 'RB', 'Running Back', 11),
    'FB': ('Offense', 'FB', 'Fullback', 12),
    'LDE': ('Base D', 'LDE', 'Left Defensive End', 1),
    'LDT': ('Base D', 'LDT', 'Left Defensive Tackle', 2),
    'NT': ('Base D', 'NT', 'Nose Tackle', 3),
    'RDT': ('Base D', 'RDT', 'Right Defensive Tackle', 4),
    'RDE': ('Base D', 'RDE', 'Right Defensive End', 5),
    'DL': ('Base D', 'DL', 'Defensive Lineman', 6),
    'LOLB': ('Base D', 'LOLB', 'Left Outside Linebacker', 7),
    'LILB': ('Base D', 'LILB', 'Left Inside Linebacker', 8),
    'MLB': ('Base D', 'MLB', 'Middle Linebacker', 9),
    'RILB': ('Base D', 'RILB', 'Right Inside Linebacker', 10),
    'ROLB': ('Base D', 'ROLB', 'Right Outside Linebacker', 11),
    'LB': ('Base D', 'LB', 'Linebacker', 12),
    'LCB': ('Base D', 'LCB', 'Left Cornerback', 13),
    'SS': ('Base D', 'SS', 'Strong Safety', 14),
    'FS': ('Base D', 'FS', 'Free Safety', 15),
    'RCB': ('Base D', 'RCB', 'Right Cornerback', 16),
    'NB': ('Base D', 'NB', 'Nickel Back', 17),
    'DB': ('Base D', 'DB', 'Defensive Back', 18),
    'K': ('Special Teams', 'PK', 'Place kicker', 1),
    'P': ('Special Teams', 'P', 'Punter', 2),
    'LS': ('Special Teams', 'LS', 'Long Snapper', 6),
}

# A full file lists ~1,600 players across all 32 teams; anything far short is a bad response, and
# loading it would replace a good chart with a partial one.
MIN_ROWS, MIN_TEAMS = 1000, 30


def norm(name):
    name = re.sub(r"[^a-z ]", '', (name or '').lower().replace('-', ' '))
    return ' '.join(w for w in name.split() if w not in {'jr', 'sr', 'ii', 'iii', 'iv', 'v'})


def gsis_lookup(creds):
    """Functions mapping a Sleeper player to a GSIS id: Sleeper's own gsis_id when it has one,
    then nflverse's id crosswalk, then a unique name on that team's current roster (the
    crosswalk is slow to add rookies)."""
    ids = nflreadpy.load_ff_playerids().select(['sleeper_id', 'gsis_id']).drop_nulls()
    crosswalk = {str(s): g for s, g in ids.iter_rows()}
    conn = psycopg2.connect(**creds)
    try:
        with conn.cursor() as cur:
            cur.execute("""
              SELECT DISTINCT ON (gsis_id) gsis_id, full_name, team FROM rosters_weekly
              WHERE season = (SELECT MAX(season) FROM rosters_weekly) AND gsis_id IS NOT NULL
              ORDER BY gsis_id, week DESC""")
            rows = cur.fetchall()
    finally:
        conn.close()
    roster = defaultdict(set)
    for gsis, name, team in rows:
        roster[(norm(name), team)].add(gsis)

    def lookup(sleeper_id, p, team):
        own = (p.get('gsis_id') or '').strip()
        if own:
            return own
        if sleeper_id in crosswalk:
            return crosswalk[sleeper_id]
        hit = roster.get((norm(p.get('full_name')), team), ())
        return next(iter(hit)) if len(hit) == 1 else None
    return lookup


def fetch(creds):
    """The current depth chart as rows for depth_charts_sleeper."""
    res = requests.get(PLAYERS_URL, timeout=60, headers={'User-Agent': 'second-level-analytics-ingest'})
    res.raise_for_status()
    players = res.json()
    dt = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    lookup = gsis_lookup(creds)

    rows = []
    for sleeper_id, p in players.items():
        spot = SPOTS.get(p.get('depth_chart_position'))
        if not (spot and p.get('team') and p.get('active')):
            continue
        team = TEAMS.get(p['team'], p['team'])
        grp, abb, name, slot = spot
        rows.append({
            'dt': dt, 'team': team, 'player_name': p.get('full_name'), 'sleeper_id': sleeper_id,
            'gsis_id': lookup(sleeper_id, p, team), 'depth_chart_position': p['depth_chart_position'],
            'injury_status': p.get('injury_status'),
            'pos_grp': grp, 'pos_abb': abb, 'pos_name': name, 'pos_slot': slot,
            # Sorting only: players without an order go last, then by Sleeper's popularity rank.
            '_order': p.get('depth_chart_order') or 99, '_search': p.get('search_rank') or 9_999_999,
        })
    teams = {r['team'] for r in rows}
    if len(rows) < MIN_ROWS or len(teams) < MIN_TEAMS:
        raise RuntimeError(f'Sleeper returned {len(rows)} depth chart rows for {len(teams)} teams; keeping the current chart')

    # 1, 2, 3... within each spot: Sleeper's order can skip numbers (players it no longer lists).
    df = pl.DataFrame(rows).sort(['team', 'depth_chart_position', '_order', '_search'])
    df = df.with_columns(pl.int_range(1, pl.len() + 1).over(['team', 'depth_chart_position']).alias('pos_rank'))
    matched = df['gsis_id'].is_not_null().sum()
    print(f"  Sleeper depth charts: {len(df)} players on {len(teams)} teams, {matched} matched to GSIS ids")
    return df.drop(['_order', '_search'])
