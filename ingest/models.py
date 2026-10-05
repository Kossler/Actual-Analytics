"""Game, season and player models, refreshed at the end of every ingest.

Everything here is computed from tables the ingest already maintains (schedules, team_game_pbp,
player_stats, teams) and written to model tables the API reads:

- team_ratings        Team strength entering each week: offensive EPA/play, defensive EPA/play
                      allowed and scoring margin, recency-weighted and regressed to a prior.
- game_predictions    Pregame win probability and projected score for every game since 2006.
                      Ratings only use games played before the one being predicted, and the
                      regression weights are fit on earlier seasons, so current-season numbers
                      are genuinely pregame.
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

MODEL_VERSION = 'epa-ratings-v1'
FIRST_SEASON = 2006

# Relocated franchises keep their rating history.
TEAM_ALIASES = {'OAK': 'LV', 'SD': 'LAC', 'STL': 'LA'}

# Rating hyperparameters searched on 2006-2021 (tuned on 2006-2017, validated on 2018-2021).
PARAM_GRID = [
    {'decay': decay, 'prior_weight': prior_weight, 'carry': carry}
    for decay in (0.88, 0.92, 0.95, 0.98)
    for prior_weight in (6.0, 10.0, 16.0, 24.0)
    for carry in (0.6, 0.75, 0.9)
]
MARGIN_CAP = 24  # blowouts say little more about team strength than a 24-point win

SIMULATIONS = 10000
TEAM_SHOCK_SD = 3.0  # uncertainty in a team's true strength, in points per game


def canon(team):
    return TEAM_ALIASES.get(team, team)


def norm_cdf(x):
    x = np.asarray(x, dtype=float)
    return 0.5 * (1.0 + np.vectorize(math.erf)(x / math.sqrt(2.0)))


# --------------------------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------------------------

def load_games(cur):
    cur.execute(
        """
        SELECT game_id, season::INT, week::INT, game_type, home_team, away_team,
               home_score::FLOAT, away_score::FLOAT, location, gameday,
               home_moneyline::FLOAT, away_moneyline::FLOAT
        FROM schedules
        WHERE season >= %s
        ORDER BY season, week, gameday, game_id
        """,
        (FIRST_SEASON,),
    )
    games = []
    for row in cur.fetchall():
        game_id, season, week, game_type, home, away, hs, as_, location, gameday, home_ml, away_ml = row
        games.append({
            'market_wp': market_probability(home_ml, away_ml),
            'game_id': game_id, 'season': season, 'week': week, 'game_type': game_type,
            'home': home, 'away': away, 'home_score': hs, 'away_score': as_,
            'neutral': location == 'Neutral', 'gameday': gameday,
            'completed': hs is not None and as_ is not None,
        })
    return games


def market_probability(home_ml, away_ml):
    """Home win probability implied by the moneylines, with the bookmaker's margin removed."""
    if home_ml is None or away_ml is None:
        return None

    def to_prob(ml):
        return 100.0 / (ml + 100.0) if ml > 0 else -ml / (-ml + 100.0)

    home, away = to_prob(home_ml), to_prob(away_ml)
    return home / (home + away)


def load_team_games(cur):
    """{(game_id, team): {'off': epa/play, 'def': epa/play allowed, ...}} for all plays."""
    cur.execute(
        """
        SELECT game_id, team, side, plays, epa, pass_plays, pass_epa, rush_plays, rush_epa
        FROM team_game_pbp
        WHERE situation = 'all' AND season >= %s
        """,
        (FIRST_SEASON,),
    )
    out = defaultdict(dict)
    for game_id, team, side, plays, epa, pass_plays, pass_epa, rush_plays, rush_epa in cur.fetchall():
        if plays:
            out[(game_id, canon(team))][side] = {
                'epa_pp': epa / plays, 'pass_plays': pass_plays, 'pass_epa': pass_epa,
                'rush_plays': rush_plays, 'rush_epa': rush_epa,
            }
    return out


# --------------------------------------------------------------------------------------------
# Team ratings
# --------------------------------------------------------------------------------------------

class TeamState:
    __slots__ = ('season', 'games', 'sums', 'weights', 'priors')

    def __init__(self, season):
        self.season = season
        self.games = 0
        self.sums = [0.0, 0.0, 0.0]      # off EPA/play, def EPA/play allowed, margin
        self.weights = [0.0, 0.0, 0.0]
        self.priors = [0.0, 0.0, 0.0]

    def rating(self, prior_weight):
        return tuple(
            (self.sums[i] + prior_weight * self.priors[i]) / (self.weights[i] + prior_weight)
            for i in range(3)
        )


def compute_ratings(games, team_games, params):
    """Ratings entering each game, plus each team's state after the last completed game."""
    decay, prior_weight, carry = params['decay'], params['prior_weight'], params['carry']
    states = {}
    pregame = {}
    recent_totals = []
    for g in games:
        teams = (canon(g['home']), canon(g['away']))
        for team in teams:
            st = states.get(team)
            if st is None:
                states[team] = TeamState(g['season'])
            elif st.season != g['season']:
                last = st.rating(prior_weight)
                fresh = TeamState(g['season'])
                fresh.priors = [carry * value for value in last]
                states[team] = fresh
        home_r = states[teams[0]].rating(prior_weight)
        away_r = states[teams[1]].rating(prior_weight)
        league_total = float(np.mean(recent_totals[-256:])) if recent_totals else 44.0
        pregame[g['game_id']] = (home_r, away_r, league_total)

        if not g['completed']:
            continue
        recent_totals.append(g['home_score'] + g['away_score'])
        margin = max(-MARGIN_CAP, min(MARGIN_CAP, g['home_score'] - g['away_score']))
        for team, sign in ((teams[0], 1), (teams[1], -1)):
            tg = team_games.get((g['game_id'], team), {})
            st = states[team]
            values = [
                tg['off']['epa_pp'] if 'off' in tg else None,
                tg['def']['epa_pp'] if 'def' in tg else None,
                sign * margin,
            ]
            for i, value in enumerate(values):
                st.sums[i] *= decay
                st.weights[i] *= decay
                if value is not None:
                    st.sums[i] += value
                    st.weights[i] += 1.0
            st.games += 1
    return pregame, states


def game_features(g, pregame):
    (h_off, h_def, h_mar), (a_off, a_def, a_mar), league_total = pregame[g['game_id']]
    hfa = 0.0 if g['neutral'] else 1.0
    margin_x = [hfa, h_off - a_off, a_def - h_def, h_mar - a_mar]
    total_x = [1.0, league_total, h_off + a_off, h_def + a_def]
    return margin_x, total_x


# --------------------------------------------------------------------------------------------
# Game model
# --------------------------------------------------------------------------------------------

def fit_game_model(games, pregame, seasons):
    rows = [g for g in games if g['completed'] and g['season'] in seasons]
    xm, xt, ym, yt = [], [], [], []
    for g in rows:
        m, t = game_features(g, pregame)
        xm.append(m)
        xt.append(t)
        ym.append(g['home_score'] - g['away_score'])
        yt.append(g['home_score'] + g['away_score'])
    xm, xt, ym, yt = map(np.array, (xm, xt, ym, yt))
    beta_m = np.linalg.lstsq(xm, ym, rcond=None)[0]
    beta_t = np.linalg.lstsq(xt, yt, rcond=None)[0]
    sigma = float(np.std(ym - xm @ beta_m))
    return {'margin': beta_m, 'total': beta_t, 'sigma': sigma, 'n': len(rows)}


def predict_game(model, g, pregame):
    m, t = game_features(g, pregame)
    margin = float(np.dot(model['margin'], m))
    total = float(np.dot(model['total'], t))
    home_wp = float(norm_cdf(margin / model['sigma']))
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


def evaluate(model, games, pregame, seasons):
    """Scores the model on completed games, alongside the betting market on the same games."""
    probs, outcomes, margin_err, total_err = [], [], [], []
    m_probs, m_model, m_outcomes = [], [], []
    for g in games:
        if not g['completed'] or g['season'] not in seasons:
            continue
        actual = g['home_score'] - g['away_score']
        p = predict_game(model, g, pregame)
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


def select_params(games, team_games):
    tune_fit, tune_eval = set(range(2006, 2018)), set(range(2018, 2022))
    best = None
    for params in PARAM_GRID:
        pregame, _ = compute_ratings(games, team_games, params)
        model = fit_game_model(games, pregame, tune_fit)
        score = evaluate(model, games, pregame, tune_eval)['log_loss']
        if best is None or score < best[0]:
            best = (score, params)
    return best[1]


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
OPPONENT_SIDE = {
    'passing_yards': 'pass', 'passing_tds': 'pass', 'completions': 'pass',
    'receiving_yards': 'pass', 'receiving_tds': 'pass', 'receptions': 'pass',
    'rushing_yards': 'rush', 'rushing_tds': 'rush',
    'passing_interceptions': 'pass_inverse',
}
USAGE_FLOOR = {'QB': ('attempts', 15.0), 'RB': ('touches', 5.0), 'WR': ('targets', 2.5), 'TE': ('targets', 2.0)}
RECENCY = 0.88
LAST_SEASON_WEIGHT = 0.6
Z90 = 1.2816


def poisson_quantile(mean, q):
    k, cumulative, p = 0, 0.0, math.exp(-mean)
    while True:
        cumulative += p
        if cumulative >= q or k > 20:
            return k
        k += 1
        p *= mean / k


def project_player(history, position, season, opp_factor):
    """history: per-game stat dicts, most recent first. Returns {stat: (mean, sd)}.

    sd is None for count stats (TDs, INTs), whose ranges come from a Poisson distribution.
    """
    weights = np.array([
        (RECENCY ** i) * (1.0 if h['season'] == season else LAST_SEASON_WEIGHT)
        for i, h in enumerate(history)
    ])
    n_eff = weights.sum()
    out = {}
    for stat in PROJECTION_STATS[position]:
        values = np.array([h.get(stat) or 0.0 for h in history], dtype=float)
        mean = float(np.dot(weights, values) / n_eff)
        side = OPPONENT_SIDE.get(stat)
        if side:
            mean *= opp_factor['pass'] if side.startswith('pass') else opp_factor['rush']
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


def opponent_factors(team_games_by_season, season, before_week):
    """Per defense: multiplier on yardage/TDs from EPA allowed per pass and rush play so far."""
    allowed = defaultdict(lambda: {'pass_plays': 0, 'pass_epa': 0.0, 'rush_plays': 0, 'rush_epa': 0.0})
    league = {'pass_plays': 0, 'pass_epa': 0.0, 'rush_plays': 0, 'rush_epa': 0.0}
    for (week, team), d in team_games_by_season.get(season, {}).items():
        if week >= before_week:
            continue
        for key in league:
            allowed[team][key] += d[key]
            league[key] += d[key]
    factors = {}
    if not league['pass_plays']:
        return factors, {'pass': 1.0, 'rush': 1.0}
    lg_pass = league['pass_epa'] / league['pass_plays']
    lg_rush = league['rush_epa'] / max(league['rush_plays'], 1)
    for team, d in allowed.items():
        shrink = 150.0  # plays of league-average defense mixed in
        pass_rate = (d['pass_epa'] + shrink * lg_pass) / (d['pass_plays'] + shrink)
        rush_rate = (d['rush_epa'] + shrink * lg_rush) / (d['rush_plays'] + shrink)
        factors[team] = {
            'pass': min(1.15, max(0.85, 1.0 + 1.5 * (pass_rate - lg_pass))),
            'rush': min(1.15, max(0.85, 1.0 + 1.5 * (rush_rate - lg_rush))),
        }
    return factors, {'pass': 1.0, 'rush': 1.0}


def load_defense_games(cur, seasons):
    cur.execute(
        """
        SELECT season, week, team, pass_plays, pass_epa, rush_plays, rush_epa
        FROM team_game_pbp
        WHERE side = 'def' AND situation = 'all' AND season_type = 'REG' AND season = ANY(%s)
        """,
        (list(seasons),),
    )
    out = defaultdict(dict)
    for season, week, team, pass_plays, pass_epa, rush_plays, rush_epa in cur.fetchall():
        out[season][(week, team)] = {'pass_plays': pass_plays, 'pass_epa': pass_epa,
                                     'rush_plays': rush_plays, 'rush_epa': rush_epa}
    return out


def build_projections(cur, games, season):
    """Projections for the next unplayed week, plus a backtest over completed weeks."""
    by_player = load_player_games(cur, (season - 1, season))
    defenses = load_defense_games(cur, (season - 1, season))

    def history_before(rows, s, week):
        return [r for r in reversed(rows) if (r['season'], r['week']) < (s, week)]

    # Backtest: every completed week from week 3 of last season onward, using only earlier games.
    samples = defaultdict(list)  # stat -> [(season, mean, sd, actual)]
    for s in (season - 1, season):
        weeks = sorted({r['week'] for rows in by_player.values() for r in rows if r['season'] == s})
        for week in weeks:
            if week < 3:
                continue
            factors, neutral = opponent_factors(defenses, s, week)
            for rows in by_player.values():
                actual = next((r for r in rows if r['season'] == s and r['week'] == week), None)
                if actual is None or actual['position'] not in PROJECTION_STATS:
                    continue
                history = history_before(rows, s, week)
                if len(history) < 2 or not usage(history, actual['position'], s):
                    continue
                proj = project_player(history, actual['position'], s,
                                      factors.get(actual['opponent'], neutral))
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
    factors, neutral = opponent_factors(defenses, season, week)

    rows_out = []
    for player_id, rows in by_player.items():
        history = history_before(rows, season, week)
        if len(history) < 2:
            continue
        latest = history[0]
        position, team = latest['position'], latest['team']
        if position not in PROJECTION_STATS or team not in matchup or not usage(history, position, season):
            continue
        opponent, home, game_id = matchup[team]
        proj = project_player(history, position, season, factors.get(opponent, neutral))
        stats_json = {}
        for stat, (mean, sd) in proj.items():
            low, high = interval(mean, sd, scales.get(stat, 1.0))
            stats_json[stat] = {'mean': round(mean, 1), 'low': round(low, 1), 'high': round(high, 1)}
        rows_out.append((season, week, player_id, latest['name'], position, team, opponent, home,
                         game_id, json.dumps(stats_json)))
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
    team_games = load_team_games(cur)
    current_season = max(g['season'] for g in games)
    completed_seasons = set(range(FIRST_SEASON, current_season))

    params = select_params(games, team_games)
    pregame, states = compute_ratings(games, team_games, params)

    holdout = {s for s in completed_seasons if s >= 2022}
    validation_model = fit_game_model(games, pregame, completed_seasons - holdout)
    validation = evaluate(validation_model, games, pregame, holdout)
    model = fit_game_model(games, pregame, completed_seasons)
    current = evaluate(model, games, pregame, {current_season})
    print(f"Models: params {params}; holdout 2022+ {validation}; {current_season} so far {current}")

    predictions = {g['game_id']: predict_game(model, g, pregame) for g in games}
    rng = np.random.default_rng(current_season * 1000 + len([g for g in games if g['completed']]))
    odds = simulate_season(cur, games, predictions, model, current_season, rng)
    projections, backtest = build_projections(cur, games, current_season)

    rating_rows = []
    for g in games:
        if g['season'] < current_season - 1:
            continue
        home_r, away_r, _ = pregame[g['game_id']]
        for team, r in ((g['home'], home_r), (g['away'], away_r)):
            st = states.get(canon(team))
            rating_rows.append((g['season'], g['week'], team, r[0], r[1], r[2], st.games if st else 0))
    rating_rows = list({(r[0], r[1], r[2]): r for r in rating_rows}.values())

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
        """, rating_rows, page_size=5000)
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
                                                opponent, home, game_id, stats)
                VALUES %s
            """, projections)
        execute_values(cur, "INSERT INTO model_runs (model, version, metrics) VALUES %s", [
            ('game', MODEL_VERSION, json.dumps({
                'params': params, 'sigma': model['sigma'], 'trained_games': model['n'],
                'trained_seasons': [min(completed_seasons), max(completed_seasons)],
                'coefficients': {'margin': model['margin'].tolist(), 'total': model['total'].tolist()},
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


if __name__ == '__main__':
    import psycopg2
    from populate_tables import get_database_url
    connection = psycopg2.connect(get_database_url())
    connection.autocommit = True
    run(connection)
    connection.close()
