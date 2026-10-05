"""Season award predictions: MVP, Offensive and Defensive Player of the Year, Offensive and
Defensive Rookie of the Year, Comeback Player and Coach of the Year.

For each award, every candidate's chance of winning is a conditional logit (a softmax across that
week's candidates) on their stats to date, measured per team game and against peers at the same
position, plus how their team is doing. It is trained on weekly snapshots of every season since
2000 labelled with the eventual winner (data/award_winners.csv, from Wikipedia), and every feature
also gets a weight that grows through the season, so early-week probabilities stay appropriately
spread out. Votes are partly narrative, which no box score captures; the backtest (each season
predicted by a model fitted without it) is stored with the model and shown on the site.

Models retrain when a new season completes; predictions are refreshed on every ingest.
"""
import json
import os
import re

import numpy as np
import pandas as pd
from scipy.optimize import minimize

VERSION = 'awards-v1'
FIRST_SEASON = 2000
WINNERS_CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'award_winners.csv')
TOP_N = 10  # candidates stored per award and week

OFFENSE = {'QB': 'QB', 'RB': 'RB', 'FB': 'RB', 'WR': 'WR', 'TE': 'TE'}
DEFENSE = {**{p: 'DL' for p in ('DE', 'DT', 'NT', 'DL', 'EDGE')},
           **{p: 'LB' for p in ('LB', 'OLB', 'ILB', 'MLB')},
           **{p: 'DB' for p in ('CB', 'DB', 'S', 'SS', 'FS', 'SAF')}}

# pool: which players are candidates; size: how many (by production to date) enter each snapshot;
# lam: ridge penalty, chosen by the backtest.
AWARDS = {
    'mvp': dict(label='Most Valuable Player', pool='offense', size=60, lam=0.1,
                features=['epa_tg', 'z_epa_tg', 'z_yds_tg', 'z_td_tg', 'pint_tg', 'win_pct', 'team_rank', 'share',
                          'is_QB', 'is_RB', 'is_WR']),
    'opoy': dict(label='Offensive Player of the Year', pool='offense', size=60, lam=0.1,
                 features=['epa_tg', 'z_epa_tg', 'z_yds_tg', 'z_td_tg', 'yds_tg', 'win_pct', 'team_rank', 'share',
                           'is_QB', 'is_RB', 'is_WR']),
    'dpoy': dict(label='Defensive Player of the Year', pool='defense', size=120, lam=0.03,
                 features=['z_sk_tg', 'z_dint_tg', 'z_pd_tg', 'z_tkl_tg', 'z_tfl_tg', 'sk_tg', 'dint_tg', 'ff_tg',
                           'dtd_tg', 'qbh_tg', 'win_pct', 'team_rank', 'def_rank', 'prev_z', 'share', 'is_DL', 'is_LB']),
    'oroy': dict(label='Offensive Rookie of the Year', pool='offense', rookies=True, size=30, lam=0.1,
                 features=['epa_tg', 'z_epa_tg', 'z_yds_tg', 'z_td_tg', 'win_pct', 'share', 'is_QB', 'is_RB', 'is_WR',
                           'pick']),
    'droy': dict(label='Defensive Rookie of the Year', pool='defense', rookies=True, size=30, lam=0.1,
                 features=['z_sk_tg', 'z_dint_tg', 'z_pd_tg', 'z_tkl_tg', 'z_tfl_tg', 'sk_tg', 'dint_tg', 'tkl_tg',
                           'win_pct', 'share', 'is_DL', 'is_LB', 'pick']),
    'cpoy': dict(label='Comeback Player of the Year', pool='offense', comeback=True, size=30, lam=0.1,
                 features=['epa_tg', 'z_fp_tg', 'fp_tg', 'win_pct', 'team_rank', 'share', 'is_QB', 'prev_g', 'drop',
                           'best']),
    'coy': dict(label='Coach of the Year', pool='coach', lam=0.03,
                features=['win_pct', 'improve', 'pd_pg', 'prev', 'new_coach']),
}

STAT_SUMS = ['py', 'ptd', 'pint', 'pepa', 'ry', 'rtd', 'repa', 'rec', 'recy', 'rectd', 'recepa',
             'sk', 'qbh', 'tfl', 'dint', 'pd', 'ff', 'tkl', 'dtd']


# ------------------------------------------------------------------------------------------------
# Data
# ------------------------------------------------------------------------------------------------

def norm(name):
    s = str(name).lower().replace('.', '').replace("'", '').replace('-', ' ')
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def load(conn, last_season):
    read = lambda sql, *a: pd.read_sql_query(sql, conn, params=a or None)
    ps = read("""
      SELECT season::INT AS season, week::INT AS week, player_id, player_display_name AS name, position, team,
             COALESCE(passing_yards,0) py, COALESCE(passing_tds,0) ptd, COALESCE(passing_interceptions,0) pint,
             COALESCE(passing_epa,0) pepa, COALESCE(rushing_yards,0) ry, COALESCE(rushing_tds,0) rtd,
             COALESCE(rushing_epa,0) repa, COALESCE(receptions,0) rec, COALESCE(receiving_yards,0) recy,
             COALESCE(receiving_tds,0) rectd, COALESCE(receiving_epa,0) recepa,
             COALESCE(def_sacks,0) sk, COALESCE(def_qb_hits,0) qbh, COALESCE(def_tackles_for_loss,0) tfl,
             COALESCE(def_interceptions,0) dint, COALESCE(def_pass_defended,0) pd, COALESCE(def_fumbles_forced,0) ff,
             COALESCE(def_tackles_solo,0) + COALESCE(def_tackle_assists,0) tkl, COALESCE(def_tds,0) dtd
      FROM player_stats
      WHERE season BETWEEN %s AND %s AND season_type = 'REG' AND player_id IS NOT NULL""", FIRST_SEASON - 1, last_season)
    ps['fp'] = ps.py / 25 + 4 * ps.ptd - 2 * ps.pint + (ps.ry + ps.recy) / 10 + 6 * (ps.rtd + ps.rectd) + 0.5 * ps.rec
    ps['dscore'] = 4 * ps.sk + 5 * ps.dint + 0.5 * ps.tkl + 1.5 * ps.pd + 3 * ps.ff + 1.5 * ps.tfl + 6 * ps.dtd + ps.qbh
    ps['epa'] = ps.pepa + ps.repa + ps.recepa
    ps['yds'] = ps.py + ps.ry + ps.recy
    ps['td'] = ps.ptd + ps.rtd + ps.rectd

    games = read("""
      SELECT season::INT season, week::INT week, home_team, away_team, home_score, away_score, home_coach, away_coach
      FROM schedules WHERE game_type = 'REG' AND season BETWEEN %s AND %s AND home_score IS NOT NULL""",
                 FIRST_SEASON - 1, last_season)
    side = lambda a, b: games.rename(columns={f'{a}_team': 'team', f'{a}_score': 'pf', f'{b}_score': 'pa',
                                              f'{a}_coach': 'coach'})[['season', 'week', 'team', 'pf', 'pa', 'coach']]
    tg = pd.concat([side('home', 'away'), side('away', 'home')]).sort_values(['season', 'team', 'week'])
    by = tg.groupby(['season', 'team'])
    tg['gp'] = by.cumcount() + 1
    tg['w'] = (tg.pf > tg.pa).astype(int).groupby([tg.season, tg.team]).cumsum()
    tg['l'] = (tg.pf < tg.pa).astype(int).groupby([tg.season, tg.team]).cumsum()
    tg['t'] = (tg.pf == tg.pa).astype(int).groupby([tg.season, tg.team]).cumsum()
    tg['pdiff'] = (tg.pf - tg.pa).groupby([tg.season, tg.team]).cumsum()
    tg['wins'] = tg.w + 0.5 * tg.t

    tdef = read("""
      SELECT season::INT season, week::INT week, team, plays::FLOAT plays, epa FROM team_game_pbp
      WHERE situation = 'all' AND side = 'def' AND season_type = 'REG' AND season BETWEEN %s AND %s""",
                FIRST_SEASON, last_season).sort_values(['season', 'team', 'week'])
    tdef['cplays'] = tdef.groupby(['season', 'team']).plays.cumsum()
    tdef['cepa'] = tdef.groupby(['season', 'team']).epa.cumsum()

    players = read("SELECT gsis_id AS player_id, display_name, rookie_season, draft_year, draft_pick FROM players")
    teams = read("SELECT team_abbr, team_name FROM teams")
    return Data(ps, tg, tdef, players, teams)


class Data:
    def __init__(self, ps, tg, tdef, players, teams):
        self.ps, self.tg, self.tdef = ps, tg, tdef
        self.last_week = tg.groupby('season').week.max().to_dict()
        final = tg.groupby(['season', 'team']).last().reset_index()
        final['win_pct'] = final.wins / final.gp
        self.prev_wp = {(r.season + 1, r.team): r.win_pct for r in final.itertuples()}
        self.prev_record = {(r.season + 1, r.team): f'{r.w}-{r.l}' + (f'-{r.t}' if r.t else '') for r in final.itertuples()}
        self.prev_coach = {(r.season + 1, r.team): r.coach for r in final.itertuples()}
        p = players.set_index('player_id')
        self.rookie_season = p.rookie_season.fillna(p.draft_year).to_dict()
        self.draft_pick = p.draft_pick.to_dict()
        self.team_abbr = dict(zip(teams.team_name, teams.team_abbr))

        tot = ps.groupby(['player_id', 'season']).agg(g=('week', 'nunique'), fp=('fp', 'sum'), d=('dscore', 'sum')).reset_index()
        tot['fppg'], tot['dpg'] = tot.fp / tot.g, tot.d / tot.g
        self.games_by = {(r.player_id, r.season): r.g for r in tot.itertuples()}
        self.fppg_by = {(r.player_id, r.season): r.fppg for r in tot.itertuples()}
        self.prev_dpg = {(r.player_id, r.season + 1): r.dpg for r in tot[tot.g >= 6].itertuples()}
        qual = tot[tot.g >= 8].sort_values(['player_id', 'season'])
        qual['best'] = qual.groupby('player_id').fppg.cummax()
        self._best = {(r.player_id, r.season): r.best for r in qual.itertuples()}
        self._seasons = qual.groupby('player_id').season.apply(list).to_dict()
        self._ps_by_season = {s: d.sort_values('week') for s, d in ps.groupby('season')}

    def best_prior(self, pid, season):
        """Best fantasy points per game in a season of 8+ games, before last season."""
        prior = [y for y in self._seasons.get(pid, []) if y < season - 1]
        return self._best[(pid, prior[-1])] if prior else np.nan

    def teams_at(self, season, k):
        return self.tg[(self.tg.season == season) & (self.tg.week <= k)].groupby('team').last()

    def defense_rank(self, season, k):
        t = self.tdef[(self.tdef.season == season) & (self.tdef.week <= k)].groupby('team').last()
        epa = t.cepa / t.cplays
        return 1 - (epa.rank(method='min') - 1) / max(len(epa) - 1, 1)


def winner_ids(data, winners):
    """{(award, season): set of player ids (coach: team abbreviations)}."""
    out = {}
    for r in winners.itertuples():
        if r.award == 'coy':
            # Match the coach by name on the schedule, else by team (interim coaches like Arians, 2012).
            coaches = data.tg[data.tg.season == r.season]
            hit = coaches[coaches.coach.map(norm) == norm(r.name)].team.unique()
            team = hit[0] if len(hit) else data.team_abbr.get(r.team)
            out.setdefault(('coy', r.season), set()).add(team)
            continue
        pool = data.ps[data.ps.season == r.season][['player_id', 'name']].drop_duplicates()
        n = norm(r.name)
        hit = pool[pool.name.map(norm) == n].player_id.unique()
        if len(hit) > 1:  # two players share the name that season: the more productive one won
            prod = data.ps[(data.ps.season == r.season) & data.ps.player_id.isin(hit)].groupby('player_id')[['fp', 'dscore']].sum().sum(axis=1)
            hit = [prod.idxmax()]
        if len(hit) == 0:  # nickname spellings (Mike Vick, Pat Surtain): first initial and last name
            first, last = n.split(' ')[0], n.split(' ')[-1]
            hit = pool[pool.name.map(lambda x: norm(x).split(' ')[-1] == last and norm(x)[:1] == first[:1])].player_id.unique()
        if len(hit) == 1:
            out.setdefault((r.award, r.season), set()).add(hit[0])
        else:
            print(f'  Awards: could not match {r.award} {r.season} {r.name}')
    return out


# ------------------------------------------------------------------------------------------------
# Snapshots and features
# ------------------------------------------------------------------------------------------------

def player_snapshot(data, award, season, k):
    cfg = AWARDS[award]
    sp = data._ps_by_season.get(season)
    if sp is None:
        return None
    cum = sp[sp.week <= k]
    if cum.empty:
        return None
    agg = cum.groupby('player_id').agg(
        name=('name', 'last'), position=('position', 'last'), team=('team', 'last'), g=('week', 'nunique'),
        **{c: (c, 'sum') for c in STAT_SUMS + ['epa', 'yds', 'td', 'fp', 'dscore']}).reset_index()
    teams = data.teams_at(season, k)
    wp = teams.wins / teams.gp
    agg['tgp'] = agg.team.map(teams.gp).fillna(agg.g)
    agg['win_pct'] = agg.team.map(wp).fillna(0.5)
    agg['team_rank'] = agg.team.map(1 - (wp.rank(ascending=False, method='min') - 1) / max(len(wp) - 1, 1)).fillna(0.5)
    agg['record'] = agg.team.map(teams.w.astype(int).astype(str) + '-' + teams.l.astype(int).astype(str))
    offense = cfg['pool'] == 'offense'
    groups = OFFENSE if offense else DEFENSE
    agg = agg[agg.position.isin(groups)].copy()
    agg['pos'] = agg.position.map(groups)
    if not offense:
        agg['def_rank'] = agg.team.map(data.defense_rank(season, k)).fillna(0.5)
        agg['prev_dpg'] = agg.player_id.map(lambda p: data.prev_dpg.get((p, season), np.nan))
    if cfg.get('rookies'):
        agg = agg[agg.player_id.map(lambda p: data.rookie_season.get(p) == season)].copy()
        agg['pick'] = np.log(agg.player_id.map(data.draft_pick).astype(float).fillna(260).clip(1, 260))
    if cfg.get('comeback'):
        # Candidates: back from missing most of last season (injury, benching) or from a season well
        # below their best. Last season's rate stands in for "best" for second-year players.
        agg['prev_g'] = agg.player_id.map(lambda p: data.games_by.get((p, season - 1), 0))
        prev_fppg = agg.player_id.map(lambda p: data.fppg_by.get((p, season - 1), np.nan))
        agg['best'] = agg.player_id.map(lambda p: data.best_prior(p, season)).fillna(prev_fppg)
        agg['drop'] = ((agg.best - prev_fppg.fillna(0)) / agg.best).clip(lower=0)
        agg = agg[agg.best.notna() & ((agg.prev_g <= 12) | (agg['drop'] >= 0.2))].copy()
    if agg.empty:
        return None
    agg = agg.nlargest(cfg['size'], 'fp' if offense else 'dscore')
    agg['season'], agg['week'], agg['p'] = season, k, k / data.last_week.get(season, 18)
    return agg


def coach_snapshot(data, season, k):
    t = data.teams_at(season, k).reset_index()
    if t.empty:
        return None
    t['win_pct'] = t.wins / t.gp
    t['prev'] = [data.prev_wp.get((season, x), 0.5) for x in t.team]
    t['improve'] = t.win_pct - t.prev
    t['pd_pg'] = t.pdiff / t.gp
    t['new_coach'] = [float(data.prev_coach.get((season, x)) != c) for x, c in zip(t.team, t.coach)]
    t['record'] = t.w.astype(int).astype(str) + '-' + t.l.astype(int).astype(str)
    t['prev_record'] = [data.prev_record.get((season, x)) for x in t.team]
    t['player_id'], t['name'], t['position'] = t.team, t.coach, 'HC'
    t['season'], t['week'], t['p'] = season, k, k / data.last_week.get(season, 18)
    return t


def design(df, award):
    if award == 'coy':
        return df
    for c in ['epa', 'yds', 'td', 'pint', 'fp', 'sk', 'qbh', 'tfl', 'dint', 'pd', 'ff', 'tkl', 'dtd']:
        df[c + '_tg'] = df[c] / df.tgp.clip(lower=1)
    df['share'] = df.g / df.tgp.clip(lower=1)
    for p in ('QB', 'RB', 'WR', 'DL', 'LB'):
        df['is_' + p] = (df.pos == p).astype(float)
    if 'prev_dpg' in df:
        gp = df.groupby(['season', 'week', 'pos']).prev_dpg
        df['prev_z'] = ((df.prev_dpg - gp.transform('mean')) / gp.transform('std')).fillna(0)
    # Standing among peers at the same position this week (z-score): a record rushing season stands
    # out even though quarterbacks gain more yards.
    g = df.groupby(['season', 'week', 'pos'])
    for c in ['epa_tg', 'yds_tg', 'td_tg', 'fp_tg', 'sk_tg', 'dint_tg', 'pd_tg', 'tkl_tg', 'tfl_tg']:
        df['z_' + c] = ((df[c] - g[c].transform('mean')) / g[c].transform('std').replace(0, np.nan)).fillna(0)
    return df


def snapshots(data, award, seasons):
    frames = []
    for season in seasons:
        for k in range(1, data.last_week.get(season, 0) + 1):
            snap = coach_snapshot(data, season, k) if award == 'coy' else player_snapshot(data, award, season, k)
            if snap is not None:
                frames.append(snap)
    return design(pd.concat(frames, ignore_index=True), award) if frames else None


# ------------------------------------------------------------------------------------------------
# Conditional logit
# ------------------------------------------------------------------------------------------------

def matrix(df, feats, mu=None, sd=None):
    X = df[feats].to_numpy(float)
    if mu is None:
        mu, sd = np.nanmean(X, 0), np.nanstd(X, 0) + 1e-9
    X = np.nan_to_num((X - np.asarray(mu)) / np.asarray(sd))
    p = df.p.to_numpy()[:, None]
    return np.hstack([X, X * p]), mu, sd  # each feature's weight can grow through the season


def group_index(groups):
    """Sort order and group starts, for vectorised per-group softmax."""
    order = np.argsort(groups, kind='stable')
    g = groups[order]
    starts = np.r_[0, np.flatnonzero(g[1:] != g[:-1]) + 1]
    return order, starts


def log_softmax(s, starts):
    m = np.maximum.reduceat(s, starts)
    sizes = np.diff(np.r_[starts, len(s)])
    m_rep = np.repeat(m, sizes)
    lse = m + np.log(np.add.reduceat(np.exp(s - m_rep), starts))
    return s - np.repeat(lse, sizes)


def fit(X, y, groups, lam):
    order, starts = group_index(groups)
    X, y = X[order], y[order]
    sizes = np.diff(np.r_[starts, len(y)])
    wins = np.add.reduceat(y, starts)
    n = max((wins > 0).sum(), 1)

    def objective(w):
        lp = log_softmax(X @ w, starts)
        p = np.exp(lp)
        loss = -(y * lp).sum() / n + lam * w @ w
        grad = -(X.T @ (y - p * np.repeat(wins, sizes))) / n + 2 * lam * w
        return loss, grad

    return minimize(objective, np.zeros(X.shape[1]), jac=True, method='L-BFGS-B').x


def probabilities(X, w, groups, scale=1.0):
    """Softmax within each group of X @ w, with the scores multiplied by `scale` (temperature)."""
    order, starts = group_index(groups)
    s = (X @ w) * scale
    out = np.empty(len(groups))
    out[order] = np.exp(log_softmax(s[order], starts))
    return out


def temperature(t, p):
    """Score multiplier at season progress p (0-1): a + b * p, floored to stay positive."""
    return np.maximum(t[0] + t[1] * p, 0.05)


def fit_temperature(scores, y, groups, p):
    """Calibrate out-of-sample scores: the (a, b) whose scaled softmax best predicts the winners.
    The raw model is overconfident early in the season, when a few games say little."""
    order, starts = group_index(groups)
    scores, y, p = scores[order], y[order], p[order]
    n = max((np.add.reduceat(y, starts) > 0).sum(), 1)

    def loss(t):
        return -(y * log_softmax(scores * temperature(t, p), starts)).sum() / n

    return list(map(float, minimize(loss, [1.0, 0.0], method='Nelder-Mead').x))


# ------------------------------------------------------------------------------------------------
# Training, backtest, prediction
# ------------------------------------------------------------------------------------------------

def labelled_snapshots(data, award, seasons, labels):
    df = snapshots(data, award, seasons)
    df['y'] = [float(pid in labels.get((award, s), ())) for pid, s in zip(df.player_id, df.season)]
    df['grp'] = df.season * 100 + df.week
    return df


def backtest(df, cfg):
    """Leave-one-season-out: each season scored by a model fitted on the others. Those out-of-sample
    scores calibrate the temperature, and the calibrated probabilities are the backtest.
    Returns (scored rows with prob, temperature)."""
    scored = []
    for s in sorted(df.season.unique()):
        test = df[df.season == s]
        if not test.y.any():
            continue
        train_df = df[df.season != s]
        X, mu, sd = matrix(train_df, cfg['features'])
        w = fit(X, train_df.y.to_numpy(), train_df.grp.to_numpy(), cfg['lam'])
        Xt, _, _ = matrix(test, cfg['features'], mu, sd)
        scored.append(test.assign(score=Xt @ w))
    scored = pd.concat(scored, ignore_index=True)
    temp = fit_temperature(scored.score.to_numpy(), scored.y.to_numpy(), scored.grp.to_numpy(), scored.p.to_numpy())
    scored['prob'] = probabilities(scored.score.to_numpy()[:, None], np.ones(1), scored.grp.to_numpy(),
                                   temperature(temp, scored.p.to_numpy()))
    return scored, temp


def backtest_metrics(data, scored):
    checks = {'final': [], 'midseason': []}
    for s, test in scored.groupby('season'):
        lw = data.last_week[s]
        for key, k in (('final', lw), ('midseason', lw // 2)):
            snap = test[test.week == k]
            if not snap.y.any():
                continue
            pw = snap[snap.y == 1].prob.max()
            checks[key].append({'top': bool((snap.prob > pw).sum() == 0), 'rank': int((snap.prob > pw).sum() + 1),
                                'prob': float(pw)})
    metrics = {
        key: {'seasons': len(v), 'top_pick': sum(c['top'] for c in v), 'top3': sum(c['rank'] <= 3 for c in v),
              'mean_rank': float(np.mean([c['rank'] for c in v])) if v else None,
              'winner_prob': float(np.mean([c['prob'] for c in v])) if v else None}
        for key, v in checks.items()}
    # Calibration check: the weekly leader's probability vs how often the leader won.
    top = scored.loc[scored.groupby(['season', 'week']).prob.idxmax()]
    stage = pd.cut(top.p, [0, 0.25, 0.5, 0.75, 1.0], labels=['Weeks 1-4', 'Weeks 5-9', 'Weeks 10-13', 'Weeks 14-18'])
    metrics['calibration'] = [
        {'stage': str(k), 'leader_prob': float(g.prob.mean()), 'leader_won': float(g.y.mean()), 'snapshots': int(len(g))}
        for k, g in top.groupby(stage, observed=True)]
    return metrics


def calibration_bands(scored_by_award):
    """Across all awards: candidates given each probability band, and how often they won."""
    rows = pd.concat(scored_by_award, ignore_index=True)
    rows['stage'] = np.where(rows.p <= 0.25, 'Weeks 1-4', 'Week 5 on')
    rows['band'] = pd.cut(rows.prob, [0.1, 0.25, 0.5, 0.7, 1.0], labels=['10-25%', '25-50%', '50-70%', '70%+'])
    return [{'stage': stage, 'band': str(band), 'predicted': float(g.prob.mean()), 'won': float(g.y.mean()),
             'candidates': int(len(g))}
            for (stage, band), g in rows.dropna(subset=['band']).groupby(['stage', 'band'], observed=True)]


def train(data, winners, last_complete):
    seasons = list(range(FIRST_SEASON, last_complete + 1))
    labels = winner_ids(data, winners)
    models, metrics, all_scored = {}, {}, []
    for award, cfg in AWARDS.items():
        df = labelled_snapshots(data, award, seasons, labels)
        scored, temp = backtest(df, cfg)
        metrics[award] = backtest_metrics(data, scored)
        all_scored.append(scored[['p', 'prob', 'y']])
        X, mu, sd = matrix(df, cfg['features'])
        w = fit(X, df.y.to_numpy(), df.grp.to_numpy(), cfg['lam'])
        models[award] = {'features': cfg['features'], 'mu': list(map(float, mu)), 'sd': list(map(float, sd)),
                         'w': list(map(float, w)), 'temperature': temp}
        m = metrics[award]['final']
        print(f"  Awards: {award} backtest, season's end: top pick {m['top_pick']}/{m['seasons']}, top 3 {m['top3']}, "
              f"mean rank {m['mean_rank']:.1f}; temperature {temp[0]:.2f} + {temp[1]:.2f} x progress")
    metrics['calibration_bands'] = calibration_bands(all_scored)
    return models, metrics


def display_stats(row, award):
    """The few numbers shown next to a candidate."""
    if award == 'coy':
        return {'record': row.record, 'prev_record': row.prev_record, 'point_diff': int(row.pdiff)}
    base = {'games': int(row.g), 'team_record': row.record}
    if AWARDS[award]['pool'] == 'defense':
        return {**base, 'sacks': float(row.sk), 'interceptions': int(row.dint), 'tackles': int(row.tkl),
                'tfl': int(row.tfl), 'forced_fumbles': int(row.ff), 'passes_defended': int(row.pd)}
    stats = {**base, 'epa': round(float(row.epa), 1)}
    if row.pos == 'QB':
        stats.update(pass_yards=int(row.py), pass_tds=int(row.ptd), interceptions=int(row.pint),
                     rush_yards=int(row.ry), rush_tds=int(row.rtd))
    else:
        stats.update(rush_yards=int(row.ry), rec_yards=int(row.recy), receptions=int(row.rec),
                     tds=int(row.rtd + row.rectd))
    return stats


def predict(data, models, season):
    """Top candidates per award for every completed week of the season."""
    rows = []
    for award, model in models.items():
        df = snapshots(data, award, [season])
        if df is None:
            continue
        X, _, _ = matrix(df, model['features'], model['mu'], model['sd'])
        scale = temperature(model.get('temperature', [1.0, 0.0]), df.p.to_numpy())
        df['prob'] = probabilities(X, np.array(model['w']), df.week.to_numpy(), scale)
        for week, snap in df.groupby('week'):
            for rank, r in enumerate(snap.nlargest(TOP_N, 'prob').itertuples(), start=1):
                rows.append((season, int(week), award, rank, r.player_id if award != 'coy' else None, r.name,
                             r.team, r.position, float(r.prob), json.dumps(display_stats(r, award))))
    return rows


def run(conn, current_season):
    """Retrain when a newer completed season is available; refresh this season's predictions."""
    from psycopg2.extras import execute_values
    cur = conn.cursor()
    last_complete = current_season - 1
    cur.execute("SELECT model, metrics FROM award_models ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    data = load(conn, current_season)
    if row and row[1].get('trained_through', 0) >= last_complete:
        models = row[0]
    else:
        winners = pd.read_csv(WINNERS_CSV)
        models, metrics = train(data, winners, last_complete)
        metrics['trained_through'] = last_complete
        cur.execute("INSERT INTO award_models (version, model, metrics) VALUES (%s, %s, %s)",
                    (VERSION, json.dumps(models), json.dumps(metrics)))
    rows = predict(data, models, current_season)
    cur.execute("DELETE FROM award_predictions WHERE season = %s", (current_season,))
    if rows:
        execute_values(cur, """INSERT INTO award_predictions
            (season, week, award, rank, player_id, name, team, position, probability, stats) VALUES %s""", rows)
    if not conn.autocommit:
        conn.commit()
    weeks = max((r[1] for r in rows), default=0)
    print(f"Awards: {len(rows)} predictions for {current_season} through week {weeks}")
