const express = require('express');
const router = express.Router();
const prisma = require('../db');

// 1) List players (simple)
router.get('/', async (req, res) => {
  const players = await prisma.player.findMany({ 
    select: { id: true, name: true, team: true, position: true } 
  });
  res.json(players);
});

// 2) Player medians endpoint: medians of rushing/receiving/passing yards per player in a season
router.get('/medians', async (req, res) => {
  const season = parseInt(req.query.season) || new Date().getFullYear();
  // We will use a raw SQL query to compute median using percentile_cont
  const mysql = await prisma.$queryRawUnsafe(`
    SELECT p.id as player_id, p.name,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gs."rushingYds") as median_rushing,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gs."receivingYds") as median_receiving,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY gs."passingYds") as median_passing
    FROM "GameStat" gs
      JOIN "Player" p ON p.id = gs."playerId"
    WHERE gs.season = ${season}
    GROUP BY p.id, p.name
    ORDER BY p.name
    LIMIT 1000;
  `);
  res.json(mysql);
});

// Get available seasons
router.get('/available-years', async (req, res) => {
  const years = await prisma.$queryRaw`
    SELECT DISTINCT season 
    FROM "GameStat" 
    ORDER BY season DESC
  `;
  res.json(years.map(y => y.season));
});

// 3) Get all players' aggregated stats for a season (MUST be before /:id routes)
router.get('/season/:season/all-stats', async (req, res) => {
  const season = parseInt(req.params.season);
  
  // Get all GameStat aggregated by player + AdvancedMetrics
  const allStats = await prisma.$queryRawUnsafe(`
    SELECT 
      p.id as "playerId",
      p.name,
      p.team,
      p.position,
      gs.season,
      CAST(SUM(gs.passing_attempts) AS INTEGER) as "passingAttempts",
      CAST(SUM(gs.passing_completions) AS INTEGER) as "passingCompletions",
      CAST(SUM(gs."passingYds") AS INTEGER) as "passingYds",
      CAST(SUM(gs.passing_tds) AS INTEGER) as "passingTDs",
      CAST(SUM(gs.passing_interceptions) AS INTEGER) as "interceptions",
      CAST(SUM(gs.rushing_attempts) AS INTEGER) as "rushingAttempts",
      CAST(SUM(gs."rushingYds") AS INTEGER) as "rushingYds",
      CAST(SUM(gs.rushing_tds) AS INTEGER) as "rushingTDs",
      CAST(SUM(gs.receptions) AS INTEGER) as "receptions",
      CAST(SUM(gs."receivingYds") AS INTEGER) as "receivingYds",
      CAST(SUM(gs.receiving_tds) AS INTEGER) as "receivingTDs",
      CAST(SUM(gs.targets) AS INTEGER) as "targets",
      CAST(SUM(gs.passing_sacks) AS INTEGER) as "sacks",
      CAST(SUM(gs.passing_epa) AS DOUBLE PRECISION) as "passingEPA",
      CAST(SUM(gs.rushing_epa) AS DOUBLE PRECISION) as "rushingEPA",
      CAST(SUM(gs.receiving_epa) AS DOUBLE PRECISION) as "receivingEPA",
      CAST(AVG(gs.success_rate) AS DOUBLE PRECISION) as "successRate",
      CAST(AVG(gs.cpoe) AS DOUBLE PRECISION) as "cpoe",
      CAST(COUNT(DISTINCT gs.week) AS INTEGER) as "games"
    FROM "GameStat" gs
    JOIN "Player" p ON p.id = gs."playerId"
    WHERE gs.season = ${season}
    GROUP BY p.id, p.name, p.team, p.position, gs.season
    ORDER BY p.name
  `);
  
  res.json(allStats);
});

// 4) Player detail with game logs
router.get('/:id/stats', async (req, res) => {
  const id = parseInt(req.params.id);
  const season = parseInt(req.query.season) || null;
  const where = season ? { playerId: id, season } : { playerId: id };
  const stats = await prisma.gameStat.findMany({
    where,
    orderBy: [{ season: 'desc' }, { week: 'asc' }]
  });
  res.json(stats);
});

// 5) Get player median stats by season
router.get('/:id/medians', async (req, res) => {
  const playerId = parseInt(req.params.id);
  const stats = await prisma.playerStats.findMany({
    where: { playerId },
    orderBy: { season: 'desc' }
  });
  res.json(stats);
});

// 6) Get player advanced metrics by season
router.get('/:id/advanced', async (req, res) => {
  const playerId = parseInt(req.params.id);
  const stats = await prisma.advancedMetrics.findMany({
    where: { playerId },
    orderBy: { season: 'desc' }
  });
  res.json(stats);
});

module.exports = router;
