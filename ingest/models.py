"""Game, season and player models, refreshed at the end of every ingest.

Everything here is computed from tables the ingest already maintains (schedules, team_game_pbp,
player_stats, teams) and written to model tables the API reads:

- team_ratings        Team strength entering each week: opponent-adjusted offensive EPA/play,
                      defensive EPA/play allowed and scoring margin, recency-weighted and regressed
                      to a prior.
- game_predictions    Pregame win probability and projected score for every game since 2006, from
                      team ratings, starting-quarterback ratings (and changes at QB), snap share lost
                      to injuries and a drifting home-field estimate. Features only use games
                      played before the one being predicted, and coefficients are fit on earlier
                      seasons, so current-season numbers are genuinely pregame.
- playoff_odds        Monte Carlo simulation of the rest of the current regular season.
- player_projections  Next-game stat lines with 10th-90th percentile ranges.
- model_runs          Validation metrics for each of the above.

run(conn) is called by populate_tables.finalize_load(); it can also be run directly:
    DATABASE_URL=... python models.py
"""
import json
import math
import os
from collections import defaultdict

import numpy as np
from psycopg2.extras import execute_values

MODEL_VERSION = 'epa-qb-v2'
FIRST_SEASON = 2006        # first season the game model is trained and scored on
WARMUP_SEASON = 1999       # ratings start here so 2006 has history behind it
HOLDOUT_FIRST = 2022       # seasons from here on are reported as an out-of-sample test

# Relocated franchises keep their rating history.
TEAM_ALIASES = {'OAK': 'LV', 'SD': 'LAC', 'STL': 'LA'}

# Hyperparameters chosen by coordinate descent on 2006-2017 (fit) / 2018-2021 (validate); the
# 2022-2025 holdout was scored once afterwards. Refit coefficients every run, but don't re-tune
# these nightly: with ~270 new games a year, re-tuning mostly chases noise.
PARAMS = {
    'decay': 0.95,             # weight of a game relative to the next one in team ratings
    'prior_weight': 10.0,      # games' worth of weight on the preseason prior
    'carry': 0.9,              # share of last season's rating carried into the prior
    'margin_cap': 21,          # cap on scoring margin when updating the margin rating
    'opp_adjust': True,        # rate each game's EPA relative to the opponent faced
    'qb_decay': 0.97,          # per-game decay in a quarterback's EPA/dropback history
    'qb_prior_weight': 200.0,  # dropbacks' worth of weight on the QB prior
    'qb_prior': -0.15,         # EPA/dropback prior for quarterbacks without much history
    'hfa_window': 512,         # recent non-neutral games used to estimate home-field advantage
}

# Win probability: logistic regression on these (home minus away) features. EPA/play ratings and
# starter quality (qb_diff) scored the same but overlap heavily with success rate and qb_change
# (r = 0.90 for offense), which made their weights swing sign between refits; this lean set keeps
# every weight positive and stable (walk-forward 2012-2025: Brier 0.2152 vs 0.2154 for the full set).
WIN_FEATURES = ['hfa_recent', 'mar_diff', 'qb_change', 'sdef_diff', 'soff_diff', 'inj_diff']
# Total points: linear regression.
TOTAL_FEATURES = ['one', 'lg_total', 'off_sum', 'def_sum', 'pts_sum', 'wind', 'cold', 'dome', 'qb_sum']
RATING_KEYS = ['off', 'def', 'mar', 'soff', 'sdef', 'pts_for', 'pts_against']

SIMULATIONS = 10000
TEAM_SHOCK_SD = 3.0  # uncertainty in a team's true strength, in points per game


def canon(team):
    return TEAM_ALIASES.get(team, team)


def norm_cdf(x):
    x = np.asarray(x, dtype=float)
    return 0.5 * (1.0 + np.vectorize(math.erf)(x / math.sqrt(2.0)))


def norm_ppf(p):
    """Inverse normal CDF (Acklam's approximation; |error| < 1e-8 for 0 < p < 1)."""
    p = min(max(p, 1e-9), 1 - 1e-9)
    a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02,
         -3.066479806614716e+01, 2.506628277459239e+00]
    b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01,
         -1.328068155288572e+01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00,
         4.374664141464968e+00, 2.938163982698783e+00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00]
    if p < 0.02425:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    if p > 1 - 0.02425:
        return -norm_ppf(1 - p)
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)


# --------------------------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------------------------

def market_probability(home_ml, away_ml):
    """Home win probability implied by the moneylines, with the bookmaker's margin removed."""
    if home_ml is None or away_ml is None:
        return None

    def to_prob(ml):
        return 100.0 / (ml + 100.0) if ml > 0 else -ml / (-ml + 100.0)

    home, away = to_prob(home_ml), to_prob(away_ml)
    return home / (home + away)


def load_games(cur):
    cur.execute(
        """
        SELECT game_id, season::INT, week::INT, game_type, gameday, home_team, away_team,
               home_score::FLOAT, away_score::FLOAT, location, roof, temp::FLOAT, wind::FLOAT,
               home_qb_id, away_qb_id, home_moneyline::FLOAT, away_moneyline::FLOAT
        FROM schedules
        WHERE season >= %s
        ORDER BY season, week, gameday, gametime, game_id
        """,
        (WARMUP_SEASON,),
    )
    games = []
    for row in cur.fetchall():
        (game_id, season, week, game_type, gameday, home, away, hs, as_, location, roof, temp, wind,
         home_qb, away_qb, home_ml, away_ml) = row
        games.append({
            'game_id': game_id, 'season': season, 'week': week, 'game_type': game_type,
            'home': home, 'away': away, 'home_score': hs, 'away_score': as_,
            'neutral': location == 'Neutral', 'gameday': gameday,
            'outdoor': roof in ('outdoors', 'open'), 'temp': temp, 'wind': wind,
            'home_qb': home_qb, 'away_qb': away_qb,
            'market_wp': market_probability(home_ml, away_ml),
            'completed': hs is not None and as_ is not None,
        })
    return games


def load_team_games(cur):
    """{(game_id, team): {'off': {...}, 'def': {...}}} for all plays."""
    cur.execute(
        """
        SELECT game_id, team, side, plays, epa, success
        FROM team_game_pbp
        WHERE situation = 'all' AND season >= %s
        """,
        (WARMUP_SEASON,),
    )
    out = defaultdict(dict)
    for game_id, team, side, plays, epa, success in cur.fetchall():
        if plays:
            out[(game_id, canon(team))][side] = {'epa': epa / plays, 'success': success / plays}
    return out


def load_qb_games(cur):
    """{(season, week, team): {player_id: (dropbacks, dropback_epa)}} from play-by-play."""
    cur.execute(
        "SELECT player_id, season, week, team, dropbacks, dropback_epa FROM player_week_pbp WHERE dropbacks > 0"
    )
    out = defaultdict(dict)
    for player_id, season, week, team, dropbacks, epa in cur.fetchall():
        out[(season, week, canon(team))][player_id] = (dropbacks, epa)
    return out


def load_injury_impact(cur):
    """{(season, week, team): snap share of non-QB players listed Out}.

    Each player's importance is the average share of offensive or defensive snaps he played in
    earlier games that season (or last season, early on). Empty before injury/snap data exist.
    """
    try:
        cur.execute(
            """
            SELECT i.season::INT, i.week::INT, i.team, p.pfr_id
            FROM injuries i JOIN players p ON p.gsis_id = i.gsis_id
            WHERE i.report_status = 'Out' AND i.position <> 'QB' AND p.pfr_id IS NOT NULL
            """
        )
        outs = cur.fetchall()
        cur.execute(
            """
            SELECT pfr_player_id, season::INT, week::INT,
                   COALESCE(offense_pct, 0) + COALESCE(defense_pct, 0)
            FROM snap_counts WHERE pfr_player_id IS NOT NULL
            """
        )
        snaps = defaultdict(list)
        for pfr, season, week, share in cur.fetchall():
            snaps[pfr].append((season, week, share))
    except Exception as e:
        print(f"Models: injury data unavailable ({e}); injury feature set to zero")
        if not cur.connection.autocommit:
            cur.connection.rollback()
        return {}
    impact = defaultdict(float)
    for season, week, team, pfr in outs:
        history = [s for (yr, wk, s) in snaps.get(pfr, ()) if yr == season and wk < week]
        if not history:
            history = [s for (yr, wk, s) in snaps.get(pfr, ()) if yr == season - 1]
        if history:
            impact[(season, week, canon(team))] += sum(history) / len(history)
    return impact


# --------------------------------------------------------------------------------------------
# Walk-forward features
# --------------------------------------------------------------------------------------------

class Rating:
    """Exponentially decayed average with a prior worth `prior_weight` games."""
    __slots__ = ('total', 'weight', 'prior')

    def __init__(self, prior=0.0):
        self.total = 0.0
        self.weight = 0.0
        self.prior = prior

    def value(self, prior_weight):
        return (self.total + prior_weight * self.prior) / (self.weight + prior_weight)

    def update(self, x, decay):
        self.total *= decay
        self.weight *= decay
        if x is not None:
            self.total += x
            self.weight += 1.0


def build_features(games, team_games, qb_games, injury_impact, P=PARAMS):
    """Pregame features for every game, in order, using only games completed before it.

    Returns (features, team_states) where team_states holds each team's ratings after the last
    completed game (for the team_ratings table).
    """
    decay, pw, carry = P['decay'], P['prior_weight'], P['carry']
    qb_decay, qb_pw, qb_prior = P['qb_decay'], P['qb_prior_weight'], P['qb_prior']
    teams = {}
    qb_history = {}      # player_id -> (decayed EPA sum, decayed dropbacks)
    team_qb_level = {}   # team -> Rating of the QB play it has been getting
    league_totals, home_margins = [], []
    features = []

    def team_state(team, season):
        st = teams.get(team)
        if st is None or st['season'] != season:
            prev = st['ratings'] if st else None
            ratings = {}
            for k in RATING_KEYS:
                last = prev[k].value(pw) if prev else None
                if k in ('pts_for', 'pts_against'):
                    prior = 22.0 if last is None else 22.0 + carry * (last - 22.0)
                else:
                    prior = 0.0 if last is None else carry * last
                ratings[k] = Rating(prior)
            st = {'season': season, 'ratings': ratings, 'games': 0}
            teams[team] = st
        return st

    def qb_rating(player_id):
        if not player_id or player_id not in qb_history:
            return qb_prior
        total, dropbacks = qb_history[player_id]
        return (total + qb_pw * qb_prior) / (dropbacks + qb_pw)

    for g in games:
        home, away = canon(g['home']), canon(g['away'])
        hs, as_ = team_state(home, g['season']), team_state(away, g['season'])
        hr = {k: v.value(pw) for k, v in hs['ratings'].items()}
        ar = {k: v.value(pw) for k, v in as_['ratings'].items()}
        h_level = team_qb_level[home].value(3.0) if home in team_qb_level else qb_prior
        a_level = team_qb_level[away].value(3.0) if away in team_qb_level else qb_prior
        # Without a listed starter (games more than a week out), assume the usual QB play continues.
        hq = qb_rating(g['home_qb']) if g['home_qb'] else h_level
        aq = qb_rating(g['away_qb']) if g['away_qb'] else a_level
        h_out = injury_impact.get((g['season'], g['week'], home), 0.0)
        a_out = injury_impact.get((g['season'], g['week'], away), 0.0)
        outdoor = g['outdoor']
        features.append({
            'game': g,
            'one': 1.0,
            'hfa_recent': 0.0 if g['neutral'] else (
                float(np.mean(home_margins[-P['hfa_window']:])) if len(home_margins) > 100 else 2.5),
            'off_diff': hr['off'] - ar['off'],
            'def_diff': ar['def'] - hr['def'],
            'mar_diff': hr['mar'] - ar['mar'],
            'soff_diff': hr['soff'] - ar['soff'],
            'sdef_diff': ar['sdef'] - hr['sdef'],
            'qb_diff': hq - aq,
            'qb_change': (hq - h_level) - (aq - a_level),
            'qb_sum': hq + aq,
            'inj_diff': a_out - h_out,
            'lg_total': float(np.mean(league_totals[-256:])) if league_totals else 41.0,
            'off_sum': hr['off'] + ar['off'],
            'def_sum': hr['def'] + ar['def'],
            'pts_sum': hr['pts_for'] + ar['pts_for'] + hr['pts_against'] + ar['pts_against'],
            'wind': (g['wind'] or 0.0) if outdoor else 0.0,
            'cold': max(0.0, 40.0 - (g['temp'] if g['temp'] is not None else 60.0)) if outdoor else 0.0,
            'dome': 0.0 if outdoor else 1.0,
            'ratings': (hr, ar),
        })
        if not g['completed']:
            continue

        league_totals.append(g['home_score'] + g['away_score'])
        if not g['neutral']:
            home_margins.append(g['home_score'] - g['away_score'])
        margin = max(-P['margin_cap'], min(P['margin_cap'], g['home_score'] - g['away_score']))
        for team, st, opp, sign, pf, pa in ((home, hs, ar, 1, g['home_score'], g['away_score']),
                                            (away, as_, hr, -1, g['away_score'], g['home_score'])):
            tg = team_games.get((g['game_id'], team), {})
            off, de = tg.get('off'), tg.get('def')
            values = {
                'off': off['epa'] - (opp['def'] if P['opp_adjust'] else 0.0) if off else None,
                'def': de['epa'] - (opp['off'] if P['opp_adjust'] else 0.0) if de else None,
                'soff': off['success'] if off else None,
                'sdef': de['success'] if de else None,
                'mar': sign * margin,
                'pts_for': pf,
                'pts_against': pa,
            }
            for k, v in values.items():
                st['ratings'][k].update(v, decay)
            st['games'] += 1

            played = qb_games.get((g['season'], g['week'], team), {})
            total_db = sum(db for db, _ in played.values())
            for player_id, (db, epa) in played.items():
                s, w = qb_history.get(player_id, (0.0, 0.0))
                qb_history[player_id] = (s * qb_decay + epa, w * qb_decay + db)
            if total_db:
                level = team_qb_level.setdefault(team, Rating(qb_prior))
                level.update(sum(qb_rating(pid) * db for pid, (db, _) in played.items()) / total_db, decay)
    return features, teams


# --------------------------------------------------------------------------------------------
# Game model
# --------------------------------------------------------------------------------------------

def decided(f, seasons):
    g = f['game']
    return g['completed'] and g['season'] in seasons and g['home_score'] != g['away_score']


def matrix(rows, names):
    return np.array([[r[n] for n in names] for r in rows], dtype=float)


def fit_logistic(X, y, ridge=1e-3, iterations=60):
    beta = np.zeros(X.shape[1])
    for _ in range(iterations):
        p = 1.0 / (1.0 + np.exp(-X @ beta))
        hessian = X.T @ (X * (p * (1 - p))[:, None]) + ridge * np.eye(X.shape[1])
        step = np.linalg.solve(hessian, X.T @ (y - p) - ridge * beta)
        beta += step
        if np.max(np.abs(step)) < 1e-9:
            break
    return beta


def fit_game_model(features, seasons):
    win_rows = [f for f in features if decided(f, seasons)]
    y = np.array([1.0 if f['game']['home_score'] > f['game']['away_score'] else 0.0 for f in win_rows])
    win = fit_logistic(matrix(win_rows, WIN_FEATURES), y)
    played = [f for f in features if f['game']['completed'] and f['game']['season'] in seasons]
    totals = np.array([f['game']['home_score'] + f['game']['away_score'] for f in played])
    total = np.linalg.lstsq(matrix(played, TOTAL_FEATURES), totals, rcond=None)[0]
    # Spread of real margins around the margin implied by our win probabilities.
    p = 1.0 / (1.0 + np.exp(-matrix(played, WIN_FEATURES) @ win))
    implied = np.array([norm_ppf(x) for x in p])
    margins = np.array([f['game']['home_score'] - f['game']['away_score'] for f in played])
    sigma = float(np.dot(implied, margins) / np.dot(implied, implied))  # margin = sigma * probit(p)
    return {'win': win, 'total': total, 'sigma': sigma, 'n': len(win_rows)}


def predict_game(model, f):
    home_wp = float(1.0 / (1.0 + np.exp(-np.dot(model['win'], [f[n] for n in WIN_FEATURES]))))
    # Margin consistent with the win probability, so favourite and projected score always agree.
    margin = model['sigma'] * norm_ppf(home_wp)
    total = float(np.dot(model['total'], [f[n] for n in TOTAL_FEATURES]))
    return {
        'home_wp': home_wp, 'proj_margin': margin,
        'home_proj': (total + margin) / 2.0, 'away_proj': (total - margin) / 2.0,
    }


def score_probabilities(probs, outcomes):
    if not len(outcomes):
        return {'games': 0}
    probs = np.clip(np.array(probs, dtype=float), 1e-6, 1 - 1e-6)
    outcomes = np.array(outcomes, dtype=float)
    return {
        'games': int(len(outcomes)),
        'accuracy': float(np.mean((probs > 0.5) == (outcomes == 1))),
        'brier': float(np.mean((probs - outcomes) ** 2)),
        'log_loss': float(-np.mean(outcomes * np.log(probs) + (1 - outcomes) * np.log(1 - probs))),
    }


def evaluate(model, features, seasons):
    """Scores the model on completed games, alongside the betting market on the same games."""
    probs, outcomes, margin_err, total_err = [], [], [], []
    m_probs, m_model, m_outcomes = [], [], []
    for f in features:
        g = f['game']
        if not g['completed'] or g['season'] not in seasons:
            continue
        actual = g['home_score'] - g['away_score']
        p = predict_game(model, f)
        margin_err.append(abs(p['proj_margin'] - actual))
        total_err.append(abs(p['home_proj'] + p['away_proj'] - g['home_score'] - g['away_score']))
        if actual == 0:
            continue  # ties have no winner to score
        won = 1.0 if actual > 0 else 0.0
        probs.append(p['home_wp'])
        outcomes.append(won)
        if g['market_wp'] is not None:
            m_probs.append(g['market_wp'])
            m_model.append(p['home_wp'])
            m_outcomes.append(won)
    result = score_probabilities(probs, outcomes)
    if margin_err:
        result['margin_mae'] = float(np.mean(margin_err))
        result['total_mae'] = float(np.mean(total_err))
    result['market'] = score_probabilities(m_probs, m_outcomes)
    result['model_on_market_games'] = score_probabilities(m_model, m_outcomes)
    return result


# --------------------------------------------------------------------------------------------
# Playoff odds
# --------------------------------------------------------------------------------------------

def simulate_season(cur, games, predictions, model, season, rng):
    cur.execute("SELECT team_abbr, team_conf, team_division FROM teams WHERE team_conf IS NOT NULL")
    teams = cur.fetchall()
    index = {abbr: i for i, (abbr, _, _) in enumerate(teams)}
    n_teams = len(teams)

    reg = [g for g in games if g['season'] == season and g['game_type'] == 'REG'
           and g['home'] in index and g['away'] in index]
    if not reg:
        return None
    base_wins = np.zeros(n_teams)
    games_played = np.zeros(n_teams)
    remaining = []
    for g in reg:
        h, a = index[g['home']], index[g['away']]
        if g['completed']:
            games_played[[h, a]] += 1
            if g['home_score'] > g['away_score']:
                base_wins[h] += 1
            elif g['home_score'] < g['away_score']:
                base_wins[a] += 1
            else:
                base_wins[[h, a]] += 0.5
        else:
            remaining.append((h, a, predictions[g['game_id']]['proj_margin']))
    total_games = np.zeros(n_teams)
    for g in reg:
        total_games[[index[g['home']], index[g['away']]]] += 1

    wins = np.tile(base_wins, (SIMULATIONS, 1))
    if remaining:
        home_idx = np.array([r[0] for r in remaining])
        away_idx = np.array([r[1] for r in remaining])
        margins = np.array([r[2] for r in remaining])
        shocks = rng.normal(0.0, TEAM_SHOCK_SD, size=(SIMULATIONS, n_teams))
        sim_margin = margins[None, :] + shocks[:, home_idx] - shocks[:, away_idx]
        home_win = rng.random(sim_margin.shape) < norm_cdf(sim_margin / model['sigma'])
        for col in range(len(remaining)):
            wins[:, home_idx[col]] += home_win[:, col]
            wins[:, away_idx[col]] += ~home_win[:, col]
    # Random tie-breaks stand in for the NFL's tiebreaker procedure.
    ranked = wins + rng.random(wins.shape) * 0.01

    playoff = np.zeros(n_teams)
    division_title = np.zeros(n_teams)
    top_seed = np.zeros(n_teams)
    for conf in sorted({t[1] for t in teams}):
        conf_idx = np.array([i for i, t in enumerate(teams) if t[1] == conf])
        divisions = defaultdict(list)
        for i in conf_idx:
            divisions[teams[i][2]].append(i)
        winners = np.stack([
            np.array(members)[np.argmax(ranked[:, members], axis=1)] for members in divisions.values()
        ], axis=1)  # (sims, divisions)
        is_winner = np.zeros((SIMULATIONS, n_teams), dtype=bool)
        np.put_along_axis(is_winner, winners, True, axis=1)
        division_title += is_winner.sum(axis=0)
        winner_scores = np.take_along_axis(ranked, winners, axis=1)
        best = winners[np.arange(SIMULATIONS), np.argmax(winner_scores, axis=1)]
        np.add.at(top_seed, best, 1)
        wildcard_scores = np.where(is_winner[:, conf_idx], -np.inf, ranked[:, conf_idx])
        wildcards = conf_idx[np.argsort(-wildcard_scores, axis=1)[:, :3]]
        made = is_winner.copy()
        np.put_along_axis(made, wildcards, True, axis=1)
        playoff[conf_idx] += made[:, conf_idx].sum(axis=0)

    completed_weeks = [g['week'] for g in reg if g['completed']]
    through_week = max(completed_weeks) if completed_weeks else 0
    mean_wins = wins.mean(axis=0)
    rows = []
    for i, (abbr, _, _) in enumerate(teams):
        rows.append((
            season, abbr, int(through_week),
            float(playoff[i] / SIMULATIONS), float(division_title[i] / SIMULATIONS),
            float(top_seed[i] / SIMULATIONS),
            float(mean_wins[i]), float(total_games[i] - mean_wins[i]), SIMULATIONS,
        ))
    return rows


# --------------------------------------------------------------------------------------------
# Player projections
# --------------------------------------------------------------------------------------------

PROJECTION_STATS = {
    'QB': ['attempts', 'completions', 'passing_yards', 'passing_tds', 'passing_interceptions',
           'carries', 'rushing_yards', 'rushing_tds'],
    'RB': ['carries', 'rushing_yards', 'rushing_tds', 'targets', 'receptions', 'receiving_yards',
           'receiving_tds'],
    'WR': ['targets', 'receptions', 'receiving_yards', 'receiving_tds'],
    'TE': ['targets', 'receptions', 'receiving_yards', 'receiving_tds'],
}
COUNT_STATS = {'passing_tds', 'passing_interceptions', 'rushing_tds', 'receiving_tds'}
# Typical game-to-game coefficient of variation, used to stabilise small samples.
STAT_CV = {
    'attempts': 0.25, 'completions': 0.28, 'passing_yards': 0.32, 'carries': 0.4,
    'rushing_yards': 0.55, 'targets': 0.45, 'receptions': 0.5, 'receiving_yards': 0.6,
}
USAGE_FLOOR = {'QB': ('attempts', 15.0), 'RB': ('touches', 5.0), 'WR': ('targets', 2.5), 'TE': ('targets', 2.0)}
# Backtested on 2023-2024, scored on 2025 (about 1% lower error than the previous settings): recent
# games matter, last season much less, and the opponent adjustment is position-specific. The
# earlier adjustment from a defense's overall EPA allowed made projections worse and was removed.
RECENCY = 0.88
LAST_SEASON_WEIGHT = 0.3
OPPONENT_STATS = ('passing_yards', 'rushing_yards', 'receiving_yards', 'receptions')
OPPONENT_SHRINK = 4.0   # games of league-average defense mixed into each defense's record
OPPONENT_POWER = 0.5    # dampens the adjustment (1.0 would apply it in full)
Z90 = 1.2816


def poisson_quantile(mean, q):
    k, cumulative, p = 0, 0.0, math.exp(-mean)
    while True:
        cumulative += p
        if cumulative >= q or k > 20:
            return k
        k += 1
        p *= mean / k


def project_player(history, position, season, adjust):
    """history: per-game stat dicts, most recent first. Returns {stat: (mean, sd)}.

    sd is None for count stats (TDs, INTs), whose ranges come from a Poisson distribution.
    adjust: {stat: multiplier} for the opponent's defense.
    """
    weights = np.array([
        (RECENCY ** i) * (1.0 if h['season'] == season else LAST_SEASON_WEIGHT)
        for i, h in enumerate(history)
    ])
    n_eff = weights.sum()
    out = {}
    for stat in PROJECTION_STATS[position]:
        values = np.array([h.get(stat) or 0.0 for h in history], dtype=float)
        mean = float(np.dot(weights, values) / n_eff) * adjust.get(stat, 1.0)
        if stat in COUNT_STATS:
            out[stat] = (mean, None)
            continue
        variance = float(np.dot(weights, (values - values.mean()) ** 2) / n_eff)
        prior_sd = STAT_CV.get(stat, 0.5) * mean
        out[stat] = (mean, math.sqrt((n_eff * variance + 4.0 * prior_sd ** 2) / (n_eff + 4.0)))
    return out


def interval(mean, sd, scale):
    """10th-90th percentile range; scale widens the normal range to its backtested coverage."""
    if sd is None:
        return float(poisson_quantile(mean, 0.1)), float(poisson_quantile(mean, 0.9))
    return max(0.0, mean - Z90 * scale * sd), mean + Z90 * scale * sd


def usage(history, position, season):
    stat, floor = USAGE_FLOOR[position]
    recent = history[:4]
    if stat == 'touches':
        values = [(h.get('carries') or 0) + (h.get('targets') or 0) for h in recent]
    else:
        values = [h.get(stat) or 0 for h in recent]
    return bool(values) and float(np.mean(values)) >= floor and history[0]['season'] == season


def load_player_games(cur, seasons):
    stats = sorted({s for stats in PROJECTION_STATS.values() for s in stats})
    cur.execute(
        f"""
        SELECT player_id, player_display_name, position, team, season::INT, week::INT, opponent_team,
               {', '.join(f'{s}::FLOAT' for s in stats)}
        FROM player_stats
        WHERE season = ANY(%s) AND season_type = 'REG' AND position IN ('QB', 'RB', 'WR', 'TE')
        ORDER BY player_id, season, week
        """,
        (list(seasons),),
    )
    by_player = defaultdict(list)
    for row in cur.fetchall():
        player_id, name, position, team, season, week, opponent = row[:7]
        game = {'name': name, 'position': position, 'team': team, 'season': season, 'week': week,
                'opponent': opponent}
        game.update(dict(zip(stats, row[7:])))
        by_player[player_id].append(game)
    return by_player


def defense_allowed(by_player):
    """{(season, defense, week): {(position, stat): total}} from opposing players' game lines."""
    allowed = defaultdict(lambda: defaultdict(float))
    for rows in by_player.values():
        for r in rows:
            if r['position'] in PROJECTION_STATS and r['opponent']:
                bucket = allowed[(r['season'], r['opponent'], r['week'])]
                for stat in OPPONENT_STATS:
                    bucket[(r['position'], stat)] += r.get(stat) or 0.0
    return allowed


def position_factors(allowed, season, before_week):
    """{(defense, position, stat): multiplier} from what each defense allowed to each position
    group earlier in the season, shrunk toward the league average."""
    games, totals, league = defaultdict(int), defaultdict(float), defaultdict(float)
    league_games = 0
    for (s, defense, week), values in allowed.items():
        if s != season or week >= before_week:
            continue
        games[defense] += 1
        league_games += 1
        for key, value in values.items():
            totals[(defense,) + key] += value
            league[key] += value
    factors = {}
    for (defense, position, stat), value in totals.items():
        average = league[(position, stat)] / league_games
        if average > 0:
            shrunk = (value + OPPONENT_SHRINK * average) / (games[defense] + OPPONENT_SHRINK)
            factors[(defense, position, stat)] = min(1.3, max(0.7, shrunk / average)) ** OPPONENT_POWER
    return factors


def opponent_adjustment(factors, opponent, position):
    return {stat: factors.get((opponent, position, stat), 1.0) for stat in OPPONENT_STATS}


# Depth-chart filters for the upcoming week: quarterbacks must be QB1; others must be listed within
# these ranks at their position.
DEPTH_LIMIT = {'QB': 1, 'RB': 3, 'WR': 3, 'TE': 2}


def load_availability(cur, season, week):
    """Injury report status and best depth-chart rank per player for the upcoming week."""
    status = {}
    try:
        cur.execute(
            """
            SELECT DISTINCT ON (gsis_id) gsis_id, report_status
            FROM injuries
            WHERE season = %s AND week = %s AND gsis_id IS NOT NULL
            ORDER BY gsis_id, game_type DESC
            """,
            (season, week),
        )
        status = {gsis: s for gsis, s in cur.fetchall()}
    except Exception as e:  # table missing on an old schema: no injury filter
        print(f"Models: injuries unavailable ({e})")
        if not cur.connection.autocommit:
            cur.connection.rollback()
    depth, teams_with_depth = {}, set()
    try:
        cur.execute(
            """
            SELECT gsis_id, team, pos_abb, MIN(pos_rank)::INT
            FROM depth_charts_current
            WHERE gsis_id IS NOT NULL AND pos_abb IN ('QB', 'RB', 'FB', 'WR', 'TE')
            GROUP BY gsis_id, team, pos_abb
            """
        )
        for gsis, team, pos, rank in cur.fetchall():
            teams_with_depth.add(team)
            pos = 'RB' if pos == 'FB' else pos
            depth.setdefault(gsis, {})[pos] = min(rank, depth.get(gsis, {}).get(pos, rank))
    except Exception as e:
        print(f"Models: depth charts unavailable ({e})")
        if not cur.connection.autocommit:
            cur.connection.rollback()
    return status, depth, teams_with_depth


def build_projections(cur, games, season):
    """Projections for the next unplayed week, plus a backtest over completed weeks."""
    by_player = load_player_games(cur, (season - 1, season))
    allowed = defense_allowed(by_player)

    def history_before(rows, s, week):
        return [r for r in reversed(rows) if (r['season'], r['week']) < (s, week)]

    # Backtest: every completed week from week 3 of last season onward, using only earlier games.
    samples = defaultdict(list)  # stat -> [(season, mean, sd, actual)]
    for s in (season - 1, season):
        weeks = sorted({r['week'] for rows in by_player.values() for r in rows if r['season'] == s})
        for week in weeks:
            if week < 3:
                continue
            factors = position_factors(allowed, s, week)
            for rows in by_player.values():
                actual = next((r for r in rows if r['season'] == s and r['week'] == week), None)
                if actual is None or actual['position'] not in PROJECTION_STATS:
                    continue
                history = history_before(rows, s, week)
                if len(history) < 2 or not usage(history, actual['position'], s):
                    continue
                proj = project_player(history, actual['position'], s,
                                      opponent_adjustment(factors, actual['opponent'], actual['position']))
                for stat, (mean, sd) in proj.items():
                    samples[stat].append((s, mean, sd, actual.get(stat) or 0.0))

    # Widen (or narrow) each stat's normal range so it held 80% of last season's outcomes, then
    # report coverage on the current season, which the calibration never saw.
    scales, backtest = {}, {}
    for stat, rows in samples.items():
        if stat not in COUNT_STATS:
            z = [abs(actual - mean) / sd for s, mean, sd, actual in rows if s == season - 1 and sd]
            scales[stat] = float(np.quantile(z, 0.8) / Z90) if len(z) >= 100 else 1.0
        held_out = [r for r in rows if r[0] == season] or rows
        hits = [lo <= actual <= hi for _, mean, sd, actual in held_out
                for lo, hi in [interval(mean, sd, scales.get(stat, 1.0))]]
        backtest[stat] = {
            'mae': float(np.mean([abs(mean - actual) for _, mean, _, actual in held_out])),
            'range_coverage': float(np.mean(hits)),
            'n': len(held_out),
            'scale': scales.get(stat, 1.0),
            'evaluated_on': season if any(r[0] == season for r in rows) else season - 1,
        }

    upcoming = [g for g in games if g['season'] == season and not g['completed']
                and g['game_type'] in ('REG', 'WC', 'DIV', 'CON', 'SB')]
    if not upcoming:
        return [], backtest
    week = min(g['week'] for g in upcoming)
    week_games = [g for g in upcoming if g['week'] == week]
    matchup = {}
    for g in week_games:
        matchup[g['home']] = (g['away'], True, g['game_id'])
        matchup[g['away']] = (g['home'], False, g['game_id'])
    factors = position_factors(allowed, season, week)
    injury_status, depth, teams_with_depth = load_availability(cur, season, week)

    rows_out = []
    skipped = defaultdict(int)
    for player_id, rows in by_player.items():
        history = history_before(rows, season, week)
        if len(history) < 2:
            continue
        latest = history[0]
        position, team = latest['position'], latest['team']
        if position not in PROJECTION_STATS or team not in matchup or not usage(history, position, season):
            continue
        opponent, home, game_id = matchup[team]
        proj = project_player(history, position, season, opponent_adjustment(factors, opponent, position))
        stats_json = {}
        for stat, (mean, sd) in proj.items():
            low, high = interval(mean, sd, scales.get(stat, 1.0))
            stats_json[stat] = {'mean': round(mean, 1), 'low': round(low, 1), 'high': round(high, 1)}
        status = injury_status.get(player_id)
        rank = depth.get(player_id, {}).get(position)
        if status == 'Out':
            skipped['out'] += 1
            continue
        # Only filter on the depth chart when the team has one; a missing feed shouldn't empty the week.
        if team in teams_with_depth and (rank is None or rank > DEPTH_LIMIT[position]):
            skipped['depth_chart'] += 1
            continue
        rows_out.append((season, week, player_id, latest['name'], position, team, opponent, home,
                         game_id, json.dumps(stats_json), status, rank))
    if skipped:
        print(f"Models: projections skipped {dict(skipped)}")
    return rows_out, backtest


# --------------------------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------------------------

def run(conn):
    cur = conn.cursor()
    games = load_games(cur)
    if not games:
        print("Models: no games found; skipping")
        return
    features, team_states = build_features(
        games, load_team_games(cur), load_qb_games(cur), load_injury_impact(cur))
    current_season = max(g['season'] for g in games)
    completed_seasons = set(range(FIRST_SEASON, current_season))
    holdout = {s for s in completed_seasons if s >= HOLDOUT_FIRST}

    validation_model = fit_game_model(features, completed_seasons - holdout)
    validation = evaluate(validation_model, features, holdout)
    model = fit_game_model(features, completed_seasons)
    current = evaluate(model, features, {current_season})
    print(f"Models: holdout {min(holdout)}-{max(holdout)} {validation}; {current_season} so far {current}")

    scored = [f for f in features if f['game']['season'] >= FIRST_SEASON]
    games = [f['game'] for f in scored]
    predictions = {f['game']['game_id']: predict_game(model, f) for f in scored}
    rng = np.random.default_rng(current_season * 1000 + len([g for g in games if g['completed']]))
    odds = simulate_season(cur, games, predictions, model, current_season, rng)
    projections, backtest = build_projections(cur, games, current_season)

    rating_rows = {}
    for f in scored:
        g = f['game']
        if g['season'] < current_season - 1:
            continue
        for team, r in ((g['home'], f['ratings'][0]), (g['away'], f['ratings'][1])):
            st = team_states.get(canon(team))
            rating_rows[(g['season'], g['week'], team)] = (
                g['season'], g['week'], team, r['off'], r['def'], r['mar'], st['games'] if st else 0)

    cur.execute('BEGIN')
    try:
        cur.execute('TRUNCATE game_predictions, team_ratings')
        execute_values(cur, """
            INSERT INTO game_predictions (game_id, season, week, game_type, home_team, away_team,
                                          home_wp, home_proj, away_proj, proj_margin, model_version)
            VALUES %s
        """, [
            (g['game_id'], g['season'], g['week'], g['game_type'], g['home'], g['away'],
             p['home_wp'], p['home_proj'], p['away_proj'], p['proj_margin'], MODEL_VERSION)
            for g in games for p in [predictions[g['game_id']]]
        ], page_size=5000)
        execute_values(cur, """
            INSERT INTO team_ratings (season, week, team, off_epa, def_epa, margin, games) VALUES %s
        """, list(rating_rows.values()), page_size=5000)
        if odds:
            cur.execute('DELETE FROM playoff_odds WHERE season = %s', (current_season,))
            execute_values(cur, """
                INSERT INTO playoff_odds (season, team, through_week, playoff_pct, division_pct,
                                          top_seed_pct, proj_wins, proj_losses, sims)
                VALUES %s
            """, odds)
        cur.execute('DELETE FROM player_projections WHERE season = %s', (current_season,))
        if projections:
            execute_values(cur, """
                INSERT INTO player_projections (season, week, player_id, player_name, position, team,
                                                opponent, home, game_id, stats, injury_status, depth_rank)
                VALUES %s
            """, projections)
        execute_values(cur, "INSERT INTO model_runs (model, version, metrics) VALUES %s", [
            ('game', MODEL_VERSION, json.dumps({
                'params': PARAMS, 'sigma': model['sigma'], 'trained_games': model['n'],
                'trained_seasons': [min(completed_seasons), max(completed_seasons)],
                'features': WIN_FEATURES,
                'coefficients': {
                    'win': dict(zip(WIN_FEATURES, model['win'].tolist())),
                    'total': dict(zip(TOTAL_FEATURES, model['total'].tolist())),
                },
                'holdout': {'seasons': [min(holdout), max(holdout)], **validation},
                'current_season': {'season': current_season, **current},
            })),
            ('player_projections', MODEL_VERSION, json.dumps({'backtest': backtest})),
        ])
        cur.execute('COMMIT')
    except Exception:
        cur.execute('ROLLBACK')
        raise
    print(f"Models: wrote {len(predictions)} game predictions, {len(odds or [])} playoff odds rows, "
          f"{len(projections)} player projections")

    # In-game win probability model (retrained only when a new completed season is available).
    import live_model
    live_model.run(conn, features, fit_game_model, predict_game, current_season)


if __name__ == '__main__':
    import psycopg2
    from populate_tables import get_database_url
    connection = psycopg2.connect(get_database_url())
    connection.autocommit = True
    run(connection)
    connection.close()
