// In-game win probability. Mirrors ingest/live_model.py: the features below must stay identical to
// its `features()` function, and the model itself (logistic weights, trees, blend) is read from the
// newest row of live_models.
const prisma = require('../db');

let current = null;

async function loadModel() {
  const [row] = await prisma.$queryRaw`SELECT version, model, created_at FROM live_models ORDER BY id DESC LIMIT 1`;
  current = row ? { version: row.version, ...row.model, createdAt: row.created_at } : null;
  return current;
}

const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const logit = (p) => {
  const q = clip(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
};

// state: { diff (home - away, before the snap), sec (game seconds left), ot (bool), poss (+1 home ball,
// -1 away ball), yl (yards to the end zone for the offense), down (0 if none), togo, toDiff (home - away
// timeouts), neutral (bool) }; pre: our pregame home win probability.
function featureRows(state, pre) {
  const sec = clip(state.sec, 0, 3600);
  const t = sec / 3600;
  const prior = logit(clip(pre, 0.02, 0.98));
  const scale = 1 / Math.sqrt(sec / 60 + 1);
  const { diff, poss } = state;
  const yl = state.yl ?? 75;
  const down = state.down ?? 0;
  const togo = clip(state.togo ?? 10, 0, 30);
  const toDiff = state.toDiff ?? 0;
  const neutral = state.neutral ? 1 : 0;
  const field = (poss * (100 - yl)) / 100;
  const possValue = poss * (-1 + (6 * (100 - yl)) / 100 - 0.6 * clip(down - 1, 0, 3) - 0.04 * togo);
  const adj = diff + possValue;
  const xLogit = [
    1, prior * t, prior * Math.sqrt(t), diff, diff * scale, adj * scale, possValue, possValue * scale, field,
    toDiff * (1 - t), toDiff * scale, (1 - neutral) * t, diff > 0 ? diff * scale : 0,
    Math.sign(adj) * Math.min(Math.abs(adj), 8) * scale,
  ];
  const xGbm = [diff, sec, poss, yl, down, togo, toDiff, prior, adj, adj * scale, state.ot ? 1 : 0, prior * t, diff * scale];
  return { xLogit, xGbm, t };
}

function predictTrees(trees, x) {
  let total = 0;
  for (const tree of trees) {
    let node = 0;
    while (node >= 0) {
      const [f, threshold, left, right] = tree.n[node];
      node = x[f] <= threshold ? left : right;
    }
    total += tree.v[-node - 1];
  }
  return sigmoid(total);
}

function homeWinProbability(state, pre, model = current) {
  if (!model) return null;
  const { xLogit, xGbm, t } = featureRows(state, pre);
  const pLog = sigmoid(xLogit.reduce((s, x, i) => s + x * model.logistic[i], 0));
  const pGbm = predictTrees(model.trees, xGbm);
  const [w0, w1, w2, w3] = model.blend;
  return sigmoid(w0 * logit(pLog) + w1 * logit(pGbm) + w2 * logit(pLog) * t + w3 * logit(pGbm) * t);
}

module.exports = { loadModel, homeWinProbability, featureRows, currentModel: () => current };
