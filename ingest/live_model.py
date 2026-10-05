"""In-game win probability model.

Trained on play-by-play game states (score, clock, possession, down, distance, field position,
timeouts) with our pregame probability as the starting point, and stored in live_models for the
API to evaluate during games (backend/src/live/model.js mirrors the features below exactly).

Two models are blended: a logistic regression on engineered features (best early in games) and
gradient-boosted trees (best in the final minutes). On 2022-2025 plays, trained on earlier seasons,
the blend scores Brier 0.159 overall and 0.076 in the final two minutes; nflfastR's spread-aware
probability scores 0.153 and 0.075. Most of that gap is the starting point: nflfastR starts from
the betting line, ours from the football-only pregame model.

Retrained only when a new completed season is available (training takes about a minute).
"""
import json
import math

import numpy as np

VERSION = 'live-wp-v1'
FIRST_SEASON = 2007  # walk-forward pregame probabilities need at least one earlier season

GBM_PARAMS = dict(n_estimators=400, learning_rate=0.06, num_leaves=63, min_child_samples=200,
                  subsample=0.8, subsample_freq=1, colsample_bytree=0.9, verbose=-1,
                  # diff, sec, poss, yl, down, togo, to_diff, prior, adj, adj*scale, ot, prior*t, diff*scale
                  monotone_constraints=[1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1])


def features(diff, sec, ot, poss, yl, down, togo, to_diff, neutral, pre):
    """Arrays in, (X_logit, X_gbm, t) out. Keep in sync with backend/src/live/model.js."""
    sec = np.clip(sec, 0, 3600)
    t = sec / 3600.0
    pre = np.clip(pre, 0.02, 0.98)
    prior = np.log(pre / (1 - pre))
    scale = 1.0 / np.sqrt(sec / 60.0 + 1.0)
    field = poss * (100 - yl) / 100.0
    poss_value = poss * (-1.0 + 6.0 * (100 - yl) / 100.0 - 0.6 * np.clip(down - 1, 0, 3) - 0.04 * togo)
    adj = diff + poss_value
    x_logit = np.column_stack([
        np.ones_like(t), prior * t, prior * np.sqrt(t), diff, diff * scale, adj * scale, poss_value,
        poss_value * scale, field, to_diff * (1 - t), to_diff * scale, (1 - neutral) * t,
        diff * scale * (diff > 0), np.sign(adj) * np.minimum(np.abs(adj), 8) * scale,
    ])
    x_gbm = np.column_stack([diff, sec, poss, yl, down, togo, to_diff, prior, adj, adj * scale, ot, prior * t, diff * scale])
    return x_logit, x_gbm, t


def load_states(cur, first, last):
    """One row per play: the state at the snap, from the home team's perspective."""
    cur.execute(
        """
        SELECT p.season::INT,
               -- Scores before the play: the previous play's running totals.
               COALESCE(LAG(p.total_home_score) OVER w, 0) - COALESCE(LAG(p.total_away_score) OVER w, 0) AS diff,
               p.game_seconds_remaining, CASE WHEN p.qtr >= 5 THEN 1 ELSE 0 END AS ot,
               CASE WHEN p.posteam = p.home_team THEN 1 ELSE -1 END AS poss,
               COALESCE(p.yardline_100, 75), COALESCE(p.down, 0), LEAST(GREATEST(COALESCE(p.ydstogo, 10), 0), 30),
               COALESCE(p.home_timeouts_remaining, 3) - COALESCE(p.away_timeouts_remaining, 3) AS to_diff,
               CASE WHEN s.location = 'Neutral' THEN 1 ELSE 0 END AS neutral,
               p.game_id, s.home_score::FLOAT - s.away_score::FLOAT AS final_margin
        FROM pbp p JOIN schedules s ON s.game_id = p.game_id
        WHERE p.season BETWEEN %s AND %s AND s.home_score IS NOT NULL
          AND p.game_seconds_remaining IS NOT NULL AND p.posteam IS NOT NULL
        WINDOW w AS (PARTITION BY p.game_id ORDER BY p.play_id)
        """,
        (first, last),
    )
    rows = cur.fetchall()
    cols = list(zip(*rows)) if rows else [[] for _ in range(12)]
    as_float = lambda i: np.array(cols[i], dtype=float)
    return {
        'season': np.array(cols[0], dtype=int), 'diff': as_float(1), 'sec': as_float(2), 'ot': as_float(3),
        'poss': as_float(4), 'yl': as_float(5), 'down': as_float(6), 'togo': as_float(7), 'to_diff': as_float(8),
        'neutral': as_float(9), 'game_id': list(cols[10]), 'final_margin': as_float(11),
    }


def fit_logistic(X, y, ridge=1e-3):
    beta = np.zeros(X.shape[1])
    for _ in range(40):
        p = 1 / (1 + np.exp(-X @ beta))
        H = X.T @ (X * (p * (1 - p))[:, None]) + ridge * np.eye(X.shape[1])
        step = np.linalg.solve(H, X.T @ (y - p) - ridge * beta)
        beta += step
        if np.max(np.abs(step)) < 1e-8:
            break
    return beta


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def stack(p_log, p_gbm, t):
    return np.column_stack([logit(p_log), logit(p_gbm), logit(p_log) * t, logit(p_gbm) * t])


def compact_trees(booster):
    """LightGBM trees as {n: [[feature, threshold, left, right], ...], v: [leaf values]}; a negative
    child index -(k + 1) points at leaf k. Every split is `x <= threshold` goes left."""
    trees = []
    for info in booster.dump_model()['tree_info']:
        nodes, leaves = [], []

        def walk(node):
            if 'leaf_value' in node:
                leaves.append(node['leaf_value'])
                return -len(leaves)
            assert node['decision_type'] == '<=', node['decision_type']
            idx = len(nodes)
            nodes.append(None)
            left = walk(node['left_child'])
            right = walk(node['right_child'])
            nodes[idx] = [node['split_feature'], node['threshold'], left, right]
            return idx

        root = walk(info['tree_structure'])
        if root < 0:  # single-leaf tree
            nodes = [[0, float('inf'), root, root]]
        trees.append({'n': nodes, 'v': leaves})
    return trees


def predict_compact(trees, x):
    raw = np.zeros(len(x))
    for i, row in enumerate(x):
        total = 0.0
        for tree in trees:
            node = 0
            while node >= 0:
                f, thr, left, right = tree['n'][node]
                node = left if row[f] <= thr else right
            total += tree['v'][-node - 1]
        raw[i] = total
    return 1 / (1 + np.exp(-raw))


def score(p, y):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {'brier': float(np.mean((p - y) ** 2)), 'log_loss': float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))),
            'plays': int(len(y))}


def run(conn, features_list, fit_game_model, predict_game, current_season):
    """Train and store the model when a newer completed season is available."""
    import lightgbm as lgb

    cur = conn.cursor()
    last_complete = current_season - 1
    cur.execute("SELECT metrics->>'trained_through' FROM live_models ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    if row and row[0] and int(row[0]) >= last_complete:
        print(f"Live model: up to date (trained through {row[0]})")
        return

    # Walk-forward pregame probabilities: each season predicted by a model fit on earlier seasons.
    pregame = {}
    for season in range(FIRST_SEASON, last_complete + 1):
        model = fit_game_model(features_list, set(range(FIRST_SEASON - 1, season)))
        for f in features_list:
            if f['game']['season'] == season:
                pregame[f['game']['game_id']] = predict_game(model, f)['home_wp']

    d = load_states(cur, FIRST_SEASON, last_complete)
    keep = (d['final_margin'] != 0) & np.array([g in pregame for g in d['game_id']])
    pre = np.array([pregame.get(g, 0.5) for g in d['game_id']])
    x_logit, x_gbm, t = features(d['diff'], d['sec'], d['ot'], d['poss'], d['yl'], d['down'], d['togo'],
                                 d['to_diff'], d['neutral'], pre)
    y = (d['final_margin'] > 0).astype(float)
    x_logit, x_gbm, t, y, season = x_logit[keep], x_gbm[keep], t[keep], y[keep], d['season'][keep]

    # Out-of-sample check on the last four completed seasons, and blend weights fit on the four before.
    test = season > last_complete - 4
    inner = season <= last_complete - 8
    blend_rows = (~test) & (~inner)
    b_inner = fit_logistic(x_logit[inner], y[inner])
    g_inner = lgb.LGBMClassifier(**GBM_PARAMS).fit(x_gbm[inner], y[inner])
    weights = fit_logistic(stack(1 / (1 + np.exp(-x_logit[blend_rows] @ b_inner)),
                                 g_inner.predict_proba(x_gbm[blend_rows])[:, 1], t[blend_rows]), y[blend_rows])
    b_train = fit_logistic(x_logit[~test], y[~test])
    g_train = lgb.LGBMClassifier(**GBM_PARAMS).fit(x_gbm[~test], y[~test])
    p_test = 1 / (1 + np.exp(-stack(1 / (1 + np.exp(-x_logit[test] @ b_train)),
                                    g_train.predict_proba(x_gbm[test])[:, 1], t[test]) @ weights))
    late = t[test] <= 120 / 3600
    metrics = {
        'trained_through': last_complete,
        'test_seasons': [last_complete - 3, last_complete],
        'test': score(p_test, y[test]),
        'test_final_two_minutes': score(p_test[late], y[test][late]),
    }

    # Final models on every completed season.
    beta = fit_logistic(x_logit, y)
    gbm = lgb.LGBMClassifier(**GBM_PARAMS).fit(x_gbm, y)
    trees = compact_trees(gbm.booster_)
    # The exported trees must reproduce LightGBM's own predictions.
    sample = x_gbm[:: max(1, len(x_gbm) // 200)]
    assert np.allclose(predict_compact(trees, sample), gbm.predict_proba(sample)[:, 1], atol=1e-6)

    model = {'logistic': beta.tolist(), 'trees': trees, 'blend': weights.tolist()}
    cur.execute(
        "INSERT INTO live_models (version, model, metrics) VALUES (%s, %s, %s)",
        (VERSION, json.dumps(model), json.dumps(metrics)),
    )
    if not conn.autocommit:
        conn.commit()
    print(f"Live model: trained through {last_complete}; test {metrics['test']}, "
          f"final two minutes {metrics['test_final_two_minutes']}")
