const express = require('express');
const router = express.Router();
const prisma = require('../db');

// --- Player CRUD ---

// Player CRUD
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


// Play CRUD
router.get('/plays', async (req, res) => {
  const plays = await prisma.Play.findMany();
  res.json(plays);
});

router.get('/plays/:id', async (req, res) => {
  const play = await prisma.Play.findUnique({ where: { id: parseInt(req.params.id) } });
  res.json(play);
});


// PlayerStats CRUD
router.get('/playerstats', async (req, res) => {
  const stats = await prisma.PlayerStats.findMany();
  res.json(stats);
});

router.get('/playerstats/:id', async (req, res) => {
  const stat = await prisma.PlayerStats.findUnique({ where: { id: parseInt(req.params.id) } });
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
