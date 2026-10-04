const express = require('express');
const prisma = require('../db');
const { searchPlayers } = require('../playerSearch');
const router = express.Router();

// Per-player queries, shared by the individual endpoints and /:gsis_id/profile.
const ADVANCED_SQL = `
      WITH season_agg AS (
        SELECT
          ps.season,
          $1::TEXT AS "playerId",
          SUM(COALESCE(ps.passing_epa, 0)::FLOAT) AS passing_epa,
          SUM(COALESCE(ps.rushing_epa, 0)::FLOAT) AS rushing_epa,
          SUM(COALESCE(ps.receiving_epa, 0)::FLOAT) AS receiving_epa,
          AVG(ps.passing_cpoe::FLOAT) AS cpoe,
          SUM(COALESCE(ps.attempts, 0)::FLOAT) AS attempts,
          SUM(COALESCE(ps.carries, 0)::FLOAT) AS carries,
          SUM(COALESCE(ps.passing_yards, 0)::FLOAT) AS passing_yards,
          SUM(COALESCE(ps.passing_tds, 0)::FLOAT) AS passing_tds,
          SUM(COALESCE(ps.passing_interceptions, 0)::FLOAT) AS passing_interceptions,
          SUM(COALESCE(ps.sacks_suffered, 0)::FLOAT) AS sacks_suffered,
          SUM(COALESCE(ps.sack_yards_lost, 0)::FLOAT) AS sack_yards_lost
        FROM player_stats ps
        WHERE ps.player_id = $1 AND ps.season_type = 'REG'
        GROUP BY ps.season
      )
      SELECT
        season,
        "playerId",
        (passing_epa + rushing_epa + receiving_epa) AS epa,
        passing_epa,
        rushing_epa,
        receiving_epa,
        cpoe,
        attempts,
        carries,
        passing_yards,
        passing_tds,
        passing_interceptions,
        sacks_suffered,
        sack_yards_lost,
        CASE WHEN attempts > 0 THEN (passing_epa / attempts) ELSE NULL END AS passing_epa_per_play,
        CASE WHEN carries > 0 THEN (rushing_epa / carries) ELSE NULL END AS rushing_epa_per_play
      FROM season_agg
      ORDER BY season DESC
    `;

const ALL_WEEKLY_SQL = `
      SELECT
        ps.week,
        ps.season,
        completions::FLOAT AS completions,
        attempts::FLOAT AS attempts,
        passing_yards::FLOAT AS passing_yards,
        passing_tds::FLOAT AS passing_tds,
        passing_interceptions::FLOAT AS passing_interceptions,
        sacks_suffered::FLOAT AS sacks_suffered,
        sack_yards_lost::FLOAT AS sack_yards_lost,
        passing_epa::FLOAT AS passing_epa,
        passing_cpoe::FLOAT AS passing_cpoe,
        carries::FLOAT AS carries,
        rushing_yards::FLOAT AS rushing_yards,
        rushing_tds::FLOAT AS rushing_tds,
        rushing_epa::FLOAT AS rushing_epa,
        receptions::FLOAT AS receptions,
        targets::FLOAT AS targets,
        receiving_yards::FLOAT AS receiving_yards,
        receiving_tds::FLOAT AS receiving_tds,
        receiving_epa::FLOAT AS receiving_epa,
        def_tackles_solo::FLOAT AS def_tackles_solo,
        def_tackles_with_assist::FLOAT AS def_tackles_with_assist,
        def_tackle_assists::FLOAT AS def_tackle_assists,
        def_sacks::FLOAT AS def_sacks,
        def_interceptions::FLOAT AS def_interceptions,
        fumble_recovery_own::FLOAT AS fumble_recovery_own,
        fumble_recovery_yards_own::FLOAT AS fumble_recovery_yards_own,
        fumble_recovery_opp::FLOAT AS fumble_recovery_opp,
        fumble_recovery_yards_opp::FLOAT AS fumble_recovery_yards_opp,
        fumble_recovery_tds::FLOAT AS fumble_recovery_tds,
        def_tds::FLOAT AS def_tds,
        def_tackles_for_loss::FLOAT AS def_tackles_for_loss,
        def_tackles_for_loss_yards::FLOAT AS def_tackles_for_loss_yards,
        def_fumbles_forced::FLOAT AS def_fumbles_forced,
        def_sack_yards::FLOAT AS def_sack_yards,
        def_qb_hits::FLOAT AS def_qb_hits,
        def_interception_yards::FLOAT AS def_interception_yards,
        def_pass_defended::FLOAT AS def_pass_defended,
        def_fumbles::FLOAT AS def_fumbles,
        def_safeties::FLOAT AS def_safeties,
        penalties::FLOAT AS penalties,
        penalty_yards::FLOAT AS penalty_yards,
        punt_returns::FLOAT AS punt_returns,
        punt_return_yards::FLOAT AS punt_return_yards,
        kickoff_returns::FLOAT AS kickoff_returns,
        kickoff_return_yards::FLOAT AS kickoff_return_yards
      FROM player_stats ps
      WHERE ps.player_id = $1 AND ps.season_type = 'REG'
      ORDER BY ps.season DESC, ps.week ASC
    `;

const YEARLY_STATS_SQL = `
      SELECT
        player_stats.season AS season,
        COALESCE(SUM(completions::FLOAT),0) AS completions,
        COALESCE(SUM(attempts::FLOAT),0) AS attempts,
        -- removed passing_attempts and rushing_attempts, use attempts and carries instead
        COALESCE(SUM(passing_yards::FLOAT),0) AS passing_yards,
        COALESCE(SUM(passing_tds::FLOAT),0) AS passing_tds,
        COALESCE(SUM(passing_interceptions::FLOAT),0) AS passing_interceptions,
        COALESCE(SUM(sacks_suffered::FLOAT),0) AS sacks_suffered,
        COALESCE(SUM(passing_epa::FLOAT),0) AS passing_epa,
        COALESCE(AVG(passing_cpoe::FLOAT),0) AS passing_cpoe,
        COALESCE(SUM(carries::FLOAT),0) AS carries,
        COALESCE(SUM(rushing_yards::FLOAT),0) AS rushing_yards,
        COALESCE(SUM(rushing_tds::FLOAT),0) AS rushing_tds,
        COALESCE(SUM(rushing_epa::FLOAT),0) AS rushing_epa,
        COALESCE(SUM(receptions::FLOAT),0) AS receptions,
        COALESCE(SUM(targets::FLOAT),0) AS targets,
        COALESCE(SUM(receiving_yards::FLOAT),0) AS receiving_yards,
        COALESCE(SUM(receiving_tds::FLOAT),0) AS receiving_tds,
        COALESCE(SUM(receiving_epa::FLOAT),0) AS receiving_epa,
        COALESCE(SUM(target_share::FLOAT),0) AS target_share,
        COALESCE(SUM(def_tackles_solo::FLOAT),0) AS def_tackles_solo,
        COALESCE(SUM(def_tackle_assists::FLOAT),0) AS def_tackle_assists,
        COALESCE(SUM(def_sacks::FLOAT),0) AS def_sacks,
        COALESCE(SUM(def_interceptions::FLOAT),0) AS def_interceptions,
        COALESCE(SUM(fumble_recovery_own::FLOAT),0) AS fumble_recovery_own,
        COALESCE(SUM(fumble_recovery_opp::FLOAT),0) AS fumble_recovery_opp,
        COALESCE(SUM(def_tds::FLOAT),0) AS def_tds,
        COALESCE(SUM(def_tackles_for_loss::FLOAT),0) AS def_tackles_for_loss,
        COALESCE(SUM(def_tackles_for_loss_yards::FLOAT),0) AS def_tackles_for_loss_yards,
        COALESCE(SUM(def_fumbles_forced::FLOAT),0) AS def_fumbles_forced,
        COALESCE(SUM(def_sack_yards::FLOAT),0) AS def_sack_yards,
        COALESCE(SUM(def_qb_hits::FLOAT),0) AS def_qb_hits,
        COALESCE(SUM(def_interception_yards::FLOAT),0) AS def_interception_yards,
        COALESCE(SUM(def_pass_defended::FLOAT),0) AS def_pass_defended,
        COALESCE(SUM(def_fumbles::FLOAT),0) AS def_fumbles,
        COALESCE(SUM(def_safeties::FLOAT),0) AS def_safeties,
        COUNT(*) AS game_count
      FROM player_stats
      WHERE player_id = $1 AND season_type = 'REG'
      GROUP BY player_stats.season
      ORDER BY player_stats.season DESC
    `;

// Fuzzy player search (trigram similarity + substring), joined to teams for team_name
router.get('/search', async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!search) {
    return res.json([]);
  }
  try {
    const results = await searchPlayers(search);
    res.json(convertBigInts(results));
  } catch (err) {
    res.status(500).json({ error: 'Failed to search players' });
  }
});

// Get available years from the GameStat or PlayerStats table
router.get('/available-years', async (req, res) => {
  try {
    // Distinct seasons, descending. A recursive "loose index scan" walks the season index
    // one value at a time (~27 lookups) instead of reading all ~480k rows like DISTINCT does.
    const query = `
      WITH RECURSIVE seasons AS (
        (SELECT season FROM player_stats WHERE season IS NOT NULL ORDER BY season DESC LIMIT 1)
        UNION ALL
        SELECT (SELECT ps.season FROM player_stats ps WHERE ps.season < seasons.season ORDER BY ps.season DESC LIMIT 1)
        FROM seasons
        WHERE seasons.season IS NOT NULL
      )
      SELECT season FROM seasons WHERE season IS NOT NULL
    `;
    const years = await prisma.$queryRawUnsafe(query);
    // years will be array of objects: [{ season: 2025n }, ...]
    const availableYears = years.map(y => typeof y.season === 'bigint' ? Number(y.season) : y.season).filter(Boolean);
    res.json(availableYears);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch available years' });
  }
});

// Get player metadata by GSIS ID
router.get('/:gsis_id', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  if (!gsis_id) {
    return res.status(400).json({ error: 'Missing player GSIS ID' });
  }
  try {
    const player = await prisma.players.findFirst({ where: { gsis_id } });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(convertBigInts(player));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player metadata' });
  }
});

// Everything the player page needs in one request: metadata, season totals, every weekly row
// (the page filters these per season), and advanced metrics.
router.get('/:gsis_id/profile', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  try {
    const [player, seasons, weekly, advanced] = await Promise.all([
      prisma.players.findUnique({ where: { gsis_id } }),
      prisma.$queryRawUnsafe(YEARLY_STATS_SQL, gsis_id),
      prisma.$queryRawUnsafe(ALL_WEEKLY_SQL, gsis_id),
      prisma.$queryRawUnsafe(ADVANCED_SQL, gsis_id),
    ]);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(convertBigInts({ player, seasons, weekly, advanced }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player profile' });
  }
});

// Get contract history for a player by GSIS ID
router.get('/:gsis_id/contracts', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  if (!gsis_id) {
    return res.status(400).json({ error: 'Missing player GSIS ID' });
  }

  try {
    const player = await prisma.players.findFirst({
      where: { gsis_id },
      select: { gsis_id: true, otc_id: true },
    });

    // If the player isn't in the players table, still allow a best-effort lookup by gsis_id.
    const where = player?.otc_id
      ? { OR: [{ gsis_id }, { otc_id: player.otc_id }] }
      : { gsis_id };

    const contracts = await prisma.contracts.findMany({
      where,
      orderBy: [{ year_signed: 'desc' }],
    });

    res.json(convertBigInts(contracts));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player contract history' });
  }
});

// Get advanced metrics for a specific player (EPA, CPOE, success rates, etc.)
router.get('/:gsis_id/advanced', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  if (!gsis_id) {
    return res.status(400).json({ error: 'Missing player GSIS ID' });
  }
  try {
    const query = ADVANCED_SQL;
    const { Prisma } = require('@prisma/client');
    const metrics = await prisma.$queryRawUnsafe(query, gsis_id);
    res.json(convertBigInts(metrics));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch advanced metrics' });
  }
});

// Get all weekly stats for a specific player (across all seasons)
router.get('/:gsis_id/all-weekly', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  if (!gsis_id) {
    return res.status(400).json({ error: 'Missing player GSIS ID' });
  }
  try {
    const query = ALL_WEEKLY_SQL;
    const { Prisma } = require('@prisma/client');
    const stats = await prisma.$queryRawUnsafe(query, gsis_id);
    res.json(convertBigInts(stats));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch all weekly stats' });
  }
});

// Get weekly stats for a specific player and season
router.get('/:gsis_id/weekly', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  const season = parseInt(req.query.season);
  if (!gsis_id || isNaN(season)) {
    return res.status(400).json({ error: 'Missing or invalid player GSIS ID or season' });
  }
  try {
    const query = `
      SELECT
        ps.week,
        ps.season,
        completions::FLOAT AS completions,
        attempts::FLOAT AS attempts,
        passing_yards::FLOAT AS passing_yards,
        passing_tds::FLOAT AS passing_tds,
        passing_interceptions::FLOAT AS passing_interceptions,
        sacks_suffered::FLOAT AS sacks_suffered,
        sack_yards_lost::FLOAT AS sack_yards_lost,
        passing_epa::FLOAT AS passing_epa,
        passing_cpoe::FLOAT AS passing_cpoe,
        carries::FLOAT AS carries,
        rushing_yards::FLOAT AS rushing_yards,
        rushing_tds::FLOAT AS rushing_tds,
        rushing_epa::FLOAT AS rushing_epa,
        receptions::FLOAT AS receptions,
        targets::FLOAT AS targets,
        receiving_yards::FLOAT AS receiving_yards,
        receiving_tds::FLOAT AS receiving_tds,
        receiving_epa::FLOAT AS receiving_epa,
        def_tackles_solo::FLOAT AS def_tackles_solo,
        def_tackles_with_assist::FLOAT AS def_tackles_with_assist,
        def_tackle_assists::FLOAT AS def_tackle_assists,
        def_sacks::FLOAT AS def_sacks,
        def_interceptions::FLOAT AS def_interceptions,
        fumble_recovery_own::FLOAT AS fumble_recovery_own,
        fumble_recovery_yards_own::FLOAT AS fumble_recovery_yards_own,
        fumble_recovery_opp::FLOAT AS fumble_recovery_opp,
        fumble_recovery_yards_opp::FLOAT AS fumble_recovery_yards_opp,
        fumble_recovery_tds::FLOAT AS fumble_recovery_tds,
        def_tds::FLOAT AS def_tds,
        def_tackles_for_loss::FLOAT AS def_tackles_for_loss,
        def_tackles_for_loss_yards::FLOAT AS def_tackles_for_loss_yards,
        def_fumbles_forced::FLOAT AS def_fumbles_forced,
        def_sack_yards::FLOAT AS def_sack_yards,
        def_qb_hits::FLOAT AS def_qb_hits,
        def_interception_yards::FLOAT AS def_interception_yards,
        def_pass_defended::FLOAT AS def_pass_defended,
        def_fumbles::FLOAT AS def_fumbles,
        def_safeties::FLOAT AS def_safeties,
        penalties::FLOAT AS penalties,
        penalty_yards::FLOAT AS penalty_yards,
        punt_returns::FLOAT AS punt_returns,
        punt_return_yards::FLOAT AS punt_return_yards,
        kickoff_returns::FLOAT AS kickoff_returns,
        kickoff_return_yards::FLOAT AS kickoff_return_yards
      FROM player_stats ps
      WHERE ps.player_id = $1 AND ps.season = $2 AND ps.season_type = 'REG'
      ORDER BY ps.week ASC
    `;
    const { Prisma } = require('@prisma/client');
    const stats = await prisma.$queryRawUnsafe(query, gsis_id, season);
    res.json(convertBigInts(stats));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player weekly stats' });
  }
});

// Get yearly stats for a specific player
router.get('/:gsis_id/stats', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  if (!gsis_id) {
    return res.status(400).json({ error: 'Missing player GSIS ID' });
  }
  try {
    const query = YEARLY_STATS_SQL;
    const { Prisma } = require('@prisma/client');
    const stats = await prisma.$queryRawUnsafe(query, gsis_id);
    res.json(convertBigInts(stats));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player yearly stats' });
  }
});

// Helper to convert BigInt values to strings for JSON serialization
function convertBigInts(obj) {
  if (Array.isArray(obj)) {
    return obj.map(convertBigInts);
  } else if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : convertBigInts(v)])
    );
  }
  return obj;
}

// Get all player stats for a given season
router.get('/season/:season/all-stats', async (req, res) => {
  const season = parseInt(req.params.season);
  if (isNaN(season)) {
    return res.status(400).json({ error: 'Invalid season' });
  }
  // Season totals per player, precomputed in the player_season_stats materialized view
  try {
    const query = `
      SELECT *
      FROM player_season_stats
      WHERE season = $1
      ORDER BY player_id ASC
    `;
    const { Prisma } = require('@prisma/client');
    const stats = await prisma.$queryRawUnsafe(query, season);
    res.json(convertBigInts(stats));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// List players (simple, only using the players table)
router.get('/', async (req, res) => {
  // Pagination and search support with strict type validation
  let page = 1;
  if (Object.prototype.hasOwnProperty.call(req.query, 'page')) {
    const pageVal = req.query.page;
    if (typeof pageVal === 'string' && /^\d+$/.test(pageVal)) {
      page = parseInt(pageVal, 10);
    }
  }
  let pageSize = 100;
  if (Object.prototype.hasOwnProperty.call(req.query, 'pageSize')) {
    const pageSizeVal = req.query.pageSize;
    if (typeof pageSizeVal === 'string' && /^\d+$/.test(pageSizeVal)) {
      pageSize = Math.min(parseInt(pageSizeVal, 10), 500);
    }
  }
  const skip = (page - 1) * pageSize;
  let search = null;
  if (Object.prototype.hasOwnProperty.call(req.query, 'search')) {
    const searchVal = req.query.search;
    if (typeof searchVal === 'string' && /^[\w\s-]{1,100}$/.test(searchVal)) {
      search = searchVal.trim();
    }
  }
  const where = search
    ? { display_name: { contains: search, mode: 'insensitive' } }
    : undefined;
  const players = await prisma.players.findMany({
    skip,
    take: pageSize,
    orderBy: { display_name: 'asc' },
    where
  });
  res.json(convertBigInts(players));
});

module.exports = router;
