const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { searchPlayers } = require('../playerSearch');

// Fantasy Points Prediction API
const { execFile } = require('child_process');
const path = require('path');

router.get('/predict/fantasy-points/:player_id', async (req, res) => {
  const playerId = req.params.player_id;
  const scriptPath = path.resolve(__dirname, '../../../ingest/predict_fantasy_points_api.py');
  execFile('python', [scriptPath, playerId], { cwd: path.dirname(scriptPath) }, (error, stdout, stderr) => {
    if (error) {
      console.error('Prediction error:', error, stderr);
      return res.status(500).json({ error: 'Prediction failed', details: stderr });
    }
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: 'Invalid prediction output', details: stdout });
    }
  });
});

// Player search endpoint: returns player names, positions, team, and gsis_id
router.get('/player-search', async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!search) {
    return res.json([]);
  }
  try {
    const results = await searchPlayers(search);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: 'Failed to search players' });
  }
});

// --- Player CRUD ---

// Player CRUD
router.get('/players/name', async (req, res) => {
  const { name } = req.query;
});

router.get('/players', async (req, res) => {
  const players = await prisma.Player.findMany();
  res.json(players);
});

router.get('/players/:id', async (req, res) => {
  const player = await prisma.Player.findUnique({ where: { id: parseInt(req.params.id) } });
  res.json(player);
});


// GameStat CRUD
router.get('/gamestats', async (req, res) => {
  const gamestats = await prisma.GameStat.findMany();
  res.json(gamestats);
});

router.get('/gamestats/:id', async (req, res) => {
  const gamestat = await prisma.GameStat.findUnique({ where: { id: parseInt(req.params.id) } });
  res.json(gamestat);
});


// PlayerStats CRUD

// Top 12 regular-season players per position for the latest season, read from the
// precomputed player_season_stats materialized view.
const HOME_LEADERS_SQL = (orderColumn) => `
  SELECT
    player_id, player_display_name, team, position,
    COALESCE(completions, 0) AS completions,
    COALESCE(attempts, 0) AS attempts,
    COALESCE(passing_yards, 0) AS passing_yards,
    COALESCE(passing_tds, 0) AS passing_tds,
    COALESCE(passing_interceptions, 0) AS passing_interceptions,
    COALESCE(passing_epa, 0) AS passing_epa,
    passing_cpoe,
    COALESCE(sacks_suffered, 0) AS sacks_suffered,
    COALESCE(carries, 0) AS carries,
    COALESCE(rushing_yards, 0) AS rushing_yards,
    COALESCE(rushing_tds, 0) AS rushing_tds,
    COALESCE(rushing_epa, 0) AS rushing_epa,
    COALESCE(receptions, 0) AS receptions,
    COALESCE(targets, 0) AS targets,
    COALESCE(receiving_yards, 0) AS receiving_yards,
    COALESCE(receiving_tds, 0) AS receiving_tds,
    COALESCE(receiving_epa, 0) AS receiving_epa,
    game_count::INT AS games,
    game_count::INT AS game_count,
    passing_cpoe AS passing_cpoe_avg,
    CASE WHEN attempts > 0 THEN passing_epa / attempts END AS passing_epa_per_play,
    CASE WHEN carries > 0 THEN rushing_epa / carries END AS rushing_epa_per_play,
    CASE WHEN receptions > 0 THEN receiving_epa / receptions END AS receiving_epa_per_play
  FROM player_season_stats
  WHERE season = $1 AND position = $2
  ORDER BY ${orderColumn} DESC NULLS LAST, player_id
  LIMIT 12
`;

router.get('/playerstats/home', async (req, res) => {
  try {
    const [latest] = await prisma.$queryRaw`SELECT MAX(season)::INT AS season FROM player_season_stats`;
    const season = latest?.season;
    if (!season) {
      return res.status(404).json({ error: 'No season found' });
    }

    const getTop = (position, orderColumn) => prisma.$queryRawUnsafe(HOME_LEADERS_SQL(orderColumn), season, position);
    const [qbs, rbs, wrs, tes] = await Promise.all([
      getTop('QB', 'passing_yards'),
      getTop('RB', 'rushing_yards'),
      getTop('WR', 'receiving_yards'),
      getTop('TE', 'receiving_yards'),
    ]);

    res.json({ season, qbs, rbs, wrs, tes });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/playerstats', async (req, res) => {
  const stats = await prisma.player_stats.findMany();
  res.json(stats);
});

router.get('/playerstats/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid id parameter' });
  }
  const stat = await prisma.player_stats.findUnique({ where: { id } });
  if (!stat) {
    return res.status(404).json({ error: 'Player stat not found' });
  }
  res.json(stat);
});


// AdvancedMetrics CRUD
router.get('/advancedmetrics', async (req, res) => {
  const metrics = await prisma.AdvancedMetrics.findMany();
  res.json(metrics);
});

router.get('/advancedmetrics/:id', async (req, res) => {
  const metric = await prisma.AdvancedMetrics.findUnique({ where: { id: parseInt(req.params.id) } });
  res.json(metric);
});


// Contracts CRUD
router.get('/contracts', async (req, res) => {
  const contracts = await prisma.contracts.findMany();
  res.json(contracts);
});

router.get('/contracts/:id', async (req, res) => {
  const contract = await prisma.contracts.findUnique({ where: { id: parseInt(req.params.id) } });
  res.json(contract);
});

module.exports = router;
