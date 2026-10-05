"""Refresh data/award_winners.csv: AP award winners by season, from Wikipedia.

nflverse doesn't publish awards, so the award models train on this list. It changes once a year
(the NFL Honors in February); run this afterwards and commit the CSV:

    pip install lxml html5lib beautifulsoup4   # only needed for this script
    python awards_history.py

The award model matches players to nflverse ids by name and season (award_model.py).
"""
import io
import os
import re
import sys
import time

import pandas as pd
import requests

FIRST_SEASON = 2000
HEADERS = {'User-Agent': 'SecondLevelAnalytics/1.0 (awards history; contact via github.com/Kossler/Actual-Analytics)'}
PAGES = {
    'mvp': 'AP_NFL_Most_Valuable_Player',
    'opoy': 'AP_NFL_Offensive_Player_of_the_Year',
    'dpoy': 'AP_NFL_Defensive_Player_of_the_Year',
    'oroy': 'AP_NFL_Offensive_Rookie_of_the_Year',
    'droy': 'AP_NFL_Defensive_Rookie_of_the_Year',
    'cpoy': 'AP_NFL_Comeback_Player_of_the_Year',
    'coy': 'AP_NFL_Coach_of_the_Year',
    'poy': 'NFL_Protector_of_the_Year',
}
# AP first-team All-Pro offensive linemen (two tackles, two guards, a center) since snap counts
# start: the training labels for Protector of the Year, which was first awarded for 2025.
ALL_PRO_FIRST_SEASON = 2013
# The AP has picked by side since 2016 (left tackle, left guard, ...).
ALL_PRO_LINE = {'tackle': 'T', 'offensive tackle': 'T', 'left tackle': 'T', 'right tackle': 'T',
                'guard': 'G', 'left guard': 'G', 'right guard': 'G', 'center': 'C'}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'award_winners.csv')

# Shared awards that Wikipedia lists in a single cell: (award, season) -> the winners.
CO_WINNERS = {('mvp', 2003): [('Peyton Manning', 'Indianapolis Colts'), ('Steve McNair', 'Tennessee Titans')]}


def fetch(page):
    """Rendered HTML of a Wikipedia page, politely: spaced out and backing off when rate-limited."""
    for attempt in range(5):
        res = requests.get('https://en.wikipedia.org/w/api.php', headers=HEADERS, timeout=30, params={
            'action': 'parse', 'page': page, 'prop': 'text', 'format': 'json', 'formatversion': 2, 'redirects': 1})
        if res.status_code == 429:
            wait = int(res.headers.get('Retry-After', 0) or 0) or 10 * (attempt + 1)
            print(f'Rate limited; waiting {wait}s')
            time.sleep(wait)
            continue
        res.raise_for_status()
        time.sleep(2)
        return res.json()['parse']['text']
    raise RuntimeError(f'Wikipedia kept rate-limiting {page}')


_pages = {}


def tables(page):
    if page not in _pages:
        _pages[page] = fetch(page)
    html = _pages[page]
    # Some cells carry malformed spans (e.g. rowspan="“1”").
    html = re.sub(r'(rowspan|colspan)="[^"\d]*(\d+)[^"\d]*"', r'\1="\2"', html)
    try:
        return pd.read_html(io.StringIO(html), flavor='bs4')
    except ValueError:
        print(f'WARNING: no tables on {page}')
        return []


def clean(text):
    text = re.sub(r'\[[^\]]*\]', '', str(text))           # footnote markers
    text = re.sub(r'\s*\(\d+\)\s*$', '', text)             # "Lamar Jackson (2)"
    return re.sub(r'[*†‡§^#~]+', '', text).strip()


def winners(award, page):
    rows = []
    for t in tables(page):
        # Two-row headers ("Season / Season", "Team / Statistics") come back as tuples: use the top row.
        name = lambda c: (c[0] if isinstance(c, tuple) else str(c)).split('[')[0].strip().lower()
        cols = {}
        for c in t.columns:
            cols.setdefault(name(c), c)
        season_col = cols.get('season') or cols.get('year')
        name_col = cols.get('player') or cols.get('coach') or cols.get('winner')
        if season_col is None or name_col is None:
            continue
        for _, r in t.iterrows():
            season = re.match(r'(\d{4})', str(r[season_col]))
            if not season or int(season.group(1)) < FIRST_SEASON:
                continue
            team_col = cols.get('team')
            pos_col = cols.get('position') or cols.get('pos.')
            rows.append({
                'award': award, 'season': int(season.group(1)), 'name': clean(r[name_col]),
                'team': clean(r[team_col]) if team_col is not None else '',
                'position': clean(r[pos_col]) if pos_col is not None else '',
            })
    # Co-winners appear as separate rows; keep each once.
    return pd.DataFrame(rows).drop_duplicates(['award', 'season', 'name'])


def all_pro_line(season):
    """AP first-team offensive linemen from Wikipedia's "<season> All-Pro Team" page."""
    rows = []
    for t in tables(f'{season}_All-Pro_Team'):
        flat = [' '.join(str(x) for x in c) if isinstance(c, tuple) else str(c) for c in t.columns]
        pos_col = next((c for c, f in zip(t.columns, flat) if 'Position' in f), None)
        first_col = next((c for c, f in zip(t.columns, flat) if 'First team' in f), None)
        if pos_col is None or first_col is None:
            continue
        for _, r in t.iterrows():
            position = ALL_PRO_LINE.get(clean(r[pos_col]).lower())
            if not position:
                continue
            # "Name, Team (AP, PFWA, TSN) Name, Team (AP-2) ...": keep the AP first-team picks.
            for name, team, selectors in re.findall(r'([^,()]+?),\s*([^,()]+?)\s*\(([^)]*)\)', clean(r[first_col])):
                if 'AP' in [x.strip() for x in selectors.split(',')]:
                    rows.append({'award': 'allpro_ol', 'season': season, 'name': name.strip(), 'team': team.strip(),
                                 'position': position})
    return pd.DataFrame(rows).drop_duplicates(['season', 'name']) if rows else pd.DataFrame()


OFFENSE = {'quarterback', 'running back', 'wide receiver', 'tight end', 'fullback', 'qb', 'rb', 'wr', 'te', 'fb',
           'offensive tackle', 'guard', 'center', 'ot', 'g', 'c', 'kick returner', 'kr'}


def main(last_season=None):
    frames = [winners(award, page) for award, page in PAGES.items()]
    last_season = last_season or max(int(f.season.max()) for f in frames if len(f))
    for season in range(ALL_PRO_FIRST_SEASON, last_season + 1):
        frames.append(all_pro_line(season))
    df = pd.concat(frames, ignore_index=True)
    # Both rookie pages redirect to one combined page listing the offensive and defensive winner;
    # assign each rookie to the award for their side of the ball.
    rookies = df[df.award.isin(['oroy', 'droy'])].drop_duplicates(['season', 'name']).copy()
    rookies['award'] = ['oroy' if str(p).strip().lower() in OFFENSE else 'droy' for p in rookies.position]
    df = pd.concat([df[~df.award.isin(['oroy', 'droy'])], rookies], ignore_index=True).sort_values(['award', 'season'])
    for (award, season), names in CO_WINNERS.items():
        row = df[(df.award == award) & (df.season == season)].iloc[0]
        df = pd.concat([df[~((df.award == award) & (df.season == season))],
                        pd.DataFrame([{**row.to_dict(), 'name': n, 'team': t} for n, t in names])], ignore_index=True)
    df = df.sort_values(['award', 'season', 'name'])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_csv(OUT, index=False)
    print(df.groupby('award').season.agg(['count', 'min', 'max']))
    print(f'Wrote {len(df)} rows to {OUT}')


if __name__ == '__main__':
    sys.exit(main())
