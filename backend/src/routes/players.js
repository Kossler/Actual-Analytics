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

// 3) Player detail with game logs
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

// 4) Get player median stats by season
router.get('/:id/medians', async (req, res) => {
  const playerId = parseInt(req.params.id);
  const stats = await prisma.playerStats.findMany({
    where: { playerId },
    orderBy: { season: 'desc' }
  });
  res.json(stats);
});

// 5) Get player advanced metrics by season
router.get('/:id/advanced', async (req, res) => {
  const playerId = parseInt(req.params.id);
  const stats = await prisma.advancedMetrics.findMany({
    where: { playerId },
    orderBy: { season: 'desc' }
  });
  res.json(stats);
});

module.exports = router;
