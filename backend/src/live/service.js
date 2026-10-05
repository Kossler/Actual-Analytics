// Live games: polls the provider during game windows, scores every snap with our in-game model and
// serves /api/live. State lives in memory; after the nightly ingest, nflverse play-by-play replaces it.
const express = require('express');
const prisma = require('../db');
const provider = require('./espn');
const { loadModel, homeWinProbability, currentModel } = require('./model');

const LIVE_INTERVAL = Number(process.env.LIVE_POLL_MS) || 15000;     // a game is in progress
const SOON_INTERVAL = 60000;                                          // kickoff within 20 minutes
const IDLE_INTERVAL = 10 * 60000;                                     // nothing happening
// LIVE_REPLAY_EVENT=<espn event id> replays a finished game as if it were live (for testing).
const REPLAY_EVENT = process.env.LIVE_REPLAY_EVENT || null;

const games = new Map();   // our game_id -> live entry
let mapping = null;        // espn id -> { gameId, preWp, neutral }
let mappingLoadedAt = 0;
let lastPoll = null;
let lastError = null;
let timer = null;
let replay = null;

async function loadMapping() {
  const rows = await prisma.$queryRaw`
    SELECT s.game_id, s.espn, s.location, s.game_type, gp.home_wp
    FROM schedules s LEFT JOIN game_predictions gp ON gp.game_id = s.game_id
    WHERE s.espn IS NOT NULL AND s.season >= (SELECT MAX(season) FROM schedules) - 1`;
  mapping = new Map(rows.map((r) => [String(r.espn), {
    gameId: r.game_id, preWp: r.home_wp ?? 0.5, neutral: r.location === 'Neutral', otLength: r.game_type === 'REG' ? 600 : 900,
  }]));
  mappingLoadedAt = Date.now();
}

// Model state from a normalized game or play; possession unknown (e.g. between quarters) averages
// both possibilities.
function probability(snap, info) {
  const base = {
    diff: snap.homeScore - snap.awayScore,
    sec: snap.secondsLeft,
    ot: snap.period >= 5,
    yl: snap.yardsToEndzone ?? 75,
    down: snap.down ?? 0,
    togo: snap.distance ?? 10,
    toDiff: (snap.homeTimeouts ?? 3) - (snap.awayTimeouts ?? 3),
    neutral: info.neutral,
  };
  if (snap.possession === snap.home || snap.possession === snap.away) {
    return homeWinProbability({ ...base, poss: snap.possession === snap.home ? 1 : -1 }, info.preWp);
  }
  return (homeWinProbability({ ...base, poss: 1, yl: 75 }, info.preWp) + homeWinProbability({ ...base, poss: -1, yl: 75 }, info.preWp)) / 2;
}

// Chart x position: seconds left in regulation, negative for time played in overtime.
function chartSeconds(snap, info) {
  if (snap.period < 5) return snap.secondsLeft;
  return -((snap.period - 5) * info.otLength + info.otLength - snap.secondsLeft);
}

const point = (snap, info, wp) => ({
  seconds_left: chartSeconds(snap, info), home_wp: wp, home_score: snap.homeScore, away_score: snap.awayScore,
});

function finalProbability(g) {
  return g.homeScore > g.awayScore ? 1 : g.homeScore < g.awayScore ? 0 : 0.5;
}

async function backfill(entry, g, info) {
  try {
    const plays = await provider.fetchPlays(g.espnId);
    entry.series = [{ seconds_left: 3600, home_wp: info.preWp, home_score: 0, away_score: 0 }];
    for (const p of plays) {
      const wp = probability({ ...p, home: g.home, away: g.away }, info);
      entry.series.push(point(p, info, wp));
    }
    entry.backfilled = true;
  } catch (err) {
    console.warn(`[live] backfill ${g.espnId} failed: ${err.message}`);
  }
}

function replayBoard() {
  const { plays, info, game } = replay;
  replay.index = Math.min(replay.index + 3, plays.length);
  const done = replay.index >= plays.length;
  const p = plays[Math.max(replay.index - 1, 0)];
  return [{
    ...game, state: done ? 'post' : 'in', detail: done ? 'Final' : `Q${p.period} ${p.clock}`,
    period: p.period, clock: p.clock, secondsLeft: p.secondsLeft,
    homeScore: done ? game.finalHome : p.homeScore, awayScore: done ? game.finalAway : p.awayScore,
    possession: p.possession, down: p.down, distance: p.distance, yardsToEndzone: p.yardsToEndzone,
    downDistance: p.down ? `${p.down} & ${p.distance}` : null, lastPlay: p.text, lastPlayId: p.id,
    homeTimeouts: null, awayTimeouts: null, redZone: (p.yardsToEndzone ?? 100) <= 20, info,
  }];
}

async function setupReplay() {
  const { game, plays } = await provider.fetchSummary(REPLAY_EVENT);
  const info = mapping.get(REPLAY_EVENT);
  if (!game || !info || !plays.length) throw new Error(`replay event ${REPLAY_EVENT} not found`);
  replay = { plays, index: 0, info, game: { ...game, finalHome: game.homeScore, finalAway: game.awayScore } };
  console.log(`[live] replaying ESPN event ${REPLAY_EVENT} (${plays.length} plays)`);
}

async function poll() {
  let next = IDLE_INTERVAL;
  try {
    if (!currentModel()) await loadModel();
    if (!mapping || Date.now() - mappingLoadedAt > 30 * 60000) await loadMapping();
    if (REPLAY_EVENT && !replay) await setupReplay();
    const board = replay ? replayBoard() : await provider.fetchScoreboard();
    const now = Date.now();
    for (const g of board) {
      const info = g.info || mapping.get(g.espnId);
      if (!info) continue;
      const entry = games.get(info.gameId) || { game_id: info.gameId, series: [], backfilled: !!replay };
      if (!replay && !entry.backfilled && (g.state === 'in' || g.state === 'post')) await backfill(entry, g, info);
      const wp = g.state === 'post' ? finalProbability(g) : g.state === 'in' && currentModel() ? probability(g, info) : info.preWp;
      const last = entry.series[entry.series.length - 1];
      const changed = !last || last.seconds_left !== chartSeconds(g, info) || last.home_score !== g.homeScore || last.away_score !== g.awayScore
        || entry.lastPlayId !== g.lastPlayId;
      if ((g.state === 'in' || g.state === 'post') && changed) {
        if (!entry.series.length) entry.series.push({ seconds_left: 3600, home_wp: info.preWp, home_score: 0, away_score: 0 });
        entry.series.push(point(g, info, wp));
      }
      Object.assign(entry, {
        espn_id: g.espnId, state: g.state, detail: g.detail, period: g.period, clock: g.clock,
        home_team: g.home, away_team: g.away, home_score: g.homeScore, away_score: g.awayScore,
        possession: g.possession, down_distance: g.downDistance, red_zone: g.redZone, last_play: g.lastPlay,
        home_wp: wp, pregame_home_wp: info.preWp, kickoff: g.kickoff, lastPlayId: g.lastPlayId,
      });
      games.set(info.gameId, entry);
      if (g.state === 'in') next = replay ? 3000 : LIVE_INTERVAL;
      else if (g.state === 'pre' && g.kickoff && new Date(g.kickoff) - now < 20 * 60000) next = Math.min(next, SOON_INTERVAL);
    }
    lastPoll = new Date().toISOString();
    lastError = null;
  } catch (err) {
    lastError = err.message;
    next = 60000;
    console.warn('[live] poll failed:', err.message);
  }
  timer = setTimeout(poll, next);
  timer.unref?.();
}

function start() {
  if (process.env.LIVE_UPDATES === '0' || timer) return;
  poll();
}

// Fresh model and pregame probabilities after an ingest.
async function refresh() {
  await loadModel().catch(() => null);
  await loadMapping().catch(() => null);
}

const publicEntry = ({ series, backfilled, lastPlayId, ...rest }) => rest;

const router = express.Router();
router.get('/', (req, res) => {
  res.set('Cache-Control', 'public, max-age=5, s-maxage=5');
  res.json({
    updated_at: lastPoll, provider: provider.name, model: currentModel()?.version || null, error: lastError,
    games: [...games.values()].map(publicEntry),
  });
});
router.get('/:gameId', (req, res) => {
  const entry = games.get(req.params.gameId);
  res.set('Cache-Control', 'public, max-age=5, s-maxage=5');
  if (!entry) return res.status(404).json({ error: 'Not live' });
  res.json({ updated_at: lastPoll, ...publicEntry(entry), series: entry.series });
});

module.exports = { router, start, refresh };
