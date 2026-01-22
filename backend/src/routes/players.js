const express = require('express');
const prisma = require('../db');
const router = express.Router();

// --- NON-PARAMETERIZED ROUTES FIRST ---

// Player search with join to teams for team_name, always return gsis_id
router.get('/search', async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!search) {
    console.log('[SEARCH] No search query provided');
    return res.json([]);
  }
  try {
    // Use raw SQL for fast join and trigram search
    const { Prisma } = require('@prisma/client');
    const query = `
      SELECT p.display_name, p.position, p.gsis_id, p.pfr_id, p.latest_team, t.team_name
      FROM players p
      LEFT JOIN teams t ON p.latest_team = t.team_abbr
      WHERE (
        p.display_name ILIKE $1
        OR p.display_name ILIKE $2
      )
      ORDER BY p.display_name ASC
      LIMIT 20
    `;
    // $1: prefix search, $2: substring search
    const prefix = search + '%';
    const substring = '%' + search + '%';
    console.log('[SEARCH] Query:', query);
    console.log('[SEARCH] Params:', prefix, substring);
    const results = await prisma.$queryRawUnsafe(query, prefix, substring);
    console.log('[SEARCH] Results:', results);
    res.json(convertBigInts(results));
  } catch (err) {
    console.error('[SEARCH] Error:', err);
    res.status(500).json({ error: 'Failed to search players' });
  }
});

// Get available years from the GameStat or PlayerStats table
router.get('/available-years', async (req, res) => {
  try {
    // Use raw SQL to fetch distinct seasons, ordered descending
    const query = `SELECT DISTINCT season FROM player_stats WHERE season IS NOT NULL ORDER BY season DESC`;
    const { Prisma } = require('@prisma/client');
    console.log('[AVAILABLE-YEARS] Query:', query);
    const years = await prisma.$queryRawUnsafe(query);
    console.log('[AVAILABLE-YEARS] Raw years:', years);
    // years will be array of objects: [{ season: 2025n }, ...]
    const availableYears = years.map(y => typeof y.season === 'bigint' ? Number(y.season) : y.season).filter(Boolean);
    console.log('[AVAILABLE-YEARS] Parsed years:', availableYears);
    res.json(availableYears);
  } catch (err) {
    console.error('[AvailableYears] error:', err);
    res.status(500).json({ error: 'Failed to fetch available years' });
  }
});

// --- PARAMETERIZED ROUTES BELOW ---

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
    console.error('[PlayerMeta] error:', err);
    res.status(500).json({ error: 'Failed to fetch player metadata' });
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
    console.error('[PlayerContracts] error:', err);
    res.status(500).json({ error: 'Failed to fetch player contract history' });
  }
});

// Get advanced metrics for a specific player (EPA, CPOE, success rates, etc.)
router.get('/:gsis_id/advanced', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  console.log('[API] /:gsis_id/advanced called with gsis_id:', gsis_id);
  if (!gsis_id) {
    console.warn('[API] Missing player GSIS ID in /:gsis_id/advanced');
    return res.status(400).json({ error: 'Missing player GSIS ID' });
  }
  try {
    const query = `
      WITH season_agg AS (
        SELECT
          ps.season,
          $1::TEXT AS "playerId",
          SUM(COALESCE(ps.passing_epa, 0)::FLOAT) AS passing_epa,
          SUM(COALESCE(ps.rushing_epa, 0)::FLOAT) AS rushing_epa,
          SUM(COALESCE(ps.receiving_epa, 0)::FLOAT) AS receiving_epa,
          AVG(ps.passing_cpoe::FLOAT) AS cpoe,
          SUM(COALESCE(ps.attempts, 0)::FLOAT) AS attempts,
          SUM(COALESCE(ps.carries, 0)::FLOAT) AS carries
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
        CASE WHEN attempts > 0 THEN (passing_epa / attempts) ELSE NULL END AS passing_epa_per_play,
        CASE WHEN carries > 0 THEN (rushing_epa / carries) ELSE NULL END AS rushing_epa_per_play
      FROM season_agg
      ORDER BY season DESC
    `;
    const { Prisma } = require('@prisma/client');
    const metrics = await prisma.$queryRawUnsafe(query, gsis_id);
    res.json(convertBigInts(metrics));
  } catch (err) {
    console.error('[AdvancedMetrics] error:', err);
    if (err && err.stack) {
      console.error('[AdvancedMetrics] stack:', err.stack);
    }
    res.status(500).json({ error: 'Failed to fetch advanced metrics', details: err && err.message ? err.message : err });
  }
});

// Get all weekly stats for a specific player (across all seasons)
router.get('/:gsis_id/all-weekly', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  if (!gsis_id) {
    return res.status(400).json({ error: 'Missing player GSIS ID' });
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
    const { Prisma } = require('@prisma/client');
    const stats = await prisma.$queryRawUnsafe(query, gsis_id);
    res.json(convertBigInts(stats));
  } catch (err) {
    console.error('[AllWeeklyStats] error:', err);
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
    console.error('[WeeklyStats] error:', err);
    res.status(500).json({ error: 'Failed to fetch player weekly stats' });
  }
});

// Get yearly stats for a specific player
router.get('/:gsis_id/stats', async (req, res) => {
  const gsis_id = req.params.gsis_id;
  console.log('[API] /:gsis_id/stats called with gsis_id:', gsis_id);
  if (!gsis_id) {
    console.warn('[API] Missing player GSIS ID in /:gsis_id/stats');
    return res.status(400).json({ error: 'Missing player GSIS ID' });
  }
  try {
    const query = `
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
    const { Prisma } = require('@prisma/client');
    const stats = await prisma.$queryRawUnsafe(query, gsis_id);
    res.json(convertBigInts(stats));
  } catch (err) {
    console.error('[YearlyStats] error:', err);
    res.status(500).json({ error: 'Failed to fetch player yearly stats' });
  }
});

// Player search with join to teams for team_name, always return gsis_id
router.get('/search', async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!search) {
    console.log('[SEARCH] No search query provided');
    return res.json([]);
  }
  try {
    // Use raw SQL for fast join and trigram search
    const { Prisma } = require('@prisma/client');
    const query = `
      SELECT p.display_name, p.position, p.gsis_id, p.pfr_id, p.latest_team, t.team_name
      FROM players p
      LEFT JOIN teams t ON p.latest_team = t.team_abbr
      WHERE (
        p.display_name ILIKE $1
        OR p.display_name ILIKE $2
      )
      ORDER BY p.display_name ASC
      LIMIT 20
    `;
    // $1: prefix search, $2: substring search
    const prefix = search + '%';
    const substring = '%' + search + '%';
    console.log('[SEARCH] Query:', query);
    console.log('[SEARCH] Params:', prefix, substring);
    const results = await prisma.$queryRawUnsafe(query, prefix, substring);
    console.log('[SEARCH] Results:', results);
    res.json(convertBigInts(results));
  } catch (err) {
    console.error('[SEARCH] Error:', err);
    res.status(500).json({ error: 'Failed to search players' });
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
  // Aggregate stats by player for the season
  try {
    const query = `
      SELECT
        ps.player_id,
        MAX(ps.player_display_name) AS player_display_name,
        MAX(ps.position) AS position,
        MAX(ps.season) AS season,
        MAX(ps.team) AS team,
        SUM(ps.completions::FLOAT) AS completions,
        SUM(ps.attempts::FLOAT) AS attempts,
        SUM(ps.passing_yards::FLOAT) AS passing_yards,
        SUM(ps.passing_tds::FLOAT) AS passing_tds,
        SUM(ps.passing_interceptions::FLOAT) AS passing_interceptions,
        SUM(ps.sacks_suffered::FLOAT) AS sacks_suffered,
        SUM(ps.passing_epa::FLOAT) AS passing_epa,
        AVG(ps.passing_cpoe::FLOAT) AS passing_cpoe,
        SUM(ps.carries::FLOAT) AS carries,
        SUM(ps.rushing_yards::FLOAT) AS rushing_yards,
        SUM(ps.rushing_tds::FLOAT) AS rushing_tds,
        SUM(ps.rushing_epa::FLOAT) AS rushing_epa,
        SUM(ps.receptions::FLOAT) AS receptions,
        SUM(ps.targets::FLOAT) AS targets,
        SUM(ps.receiving_yards::FLOAT) AS receiving_yards,
        SUM(ps.receiving_tds::FLOAT) AS receiving_tds,
        SUM(ps.receiving_epa::FLOAT) AS receiving_epa,
        SUM(ps.target_share::FLOAT) AS target_share,
        SUM(ps.def_tackles_solo::FLOAT) AS def_tackles_solo,
        SUM(ps.def_tackle_assists::FLOAT) AS def_tackle_assists,
        SUM(ps.def_sacks::FLOAT) AS def_sacks,
        SUM(ps.def_interceptions::FLOAT) AS def_interceptions,
        SUM(ps.def_pass_defended::FLOAT) AS def_pass_defended,
        SUM(ps.def_qb_hits::FLOAT) AS def_qb_hits,
        SUM(ps.def_tackles_for_loss::FLOAT) AS def_tackles_for_loss,
        SUM(ps.def_fumbles_forced::FLOAT) AS def_fumbles_forced,
        SUM(ps.def_tds::FLOAT) AS def_tds,
        SUM(ps.penalties::FLOAT) AS penalties,
        SUM(ps.penalty_yards::FLOAT) AS penalty_yards,
        SUM(ps.punt_returns::FLOAT) AS punt_returns,
        SUM(ps.punt_return_yards::FLOAT) AS punt_return_yards,
        SUM(ps.kickoff_returns::FLOAT) AS kickoff_returns,
        SUM(ps.kickoff_return_yards::FLOAT) AS kickoff_return_yards,
        SUM(ps.fumble_recovery_own::FLOAT) AS fumble_recovery_own,
        SUM(ps.fumble_recovery_yards_own::FLOAT) AS fumble_recovery_yards_own,
        SUM(ps.fumble_recovery_opp::FLOAT) AS fumble_recovery_opp,
        SUM(ps.fumble_recovery_yards_opp::FLOAT) AS fumble_recovery_yards_opp,
        SUM(ps.fumble_recovery_tds::FLOAT) AS fumble_recovery_tds,
        COALESCE(SUM(sc.defense_snaps), 0) AS defense_snaps,
        COUNT(DISTINCT ps.week) AS game_count
      FROM player_stats ps
      LEFT JOIN (
        SELECT
          gsis_id,
          MAX(pfr_id) AS pfr_id
        FROM players
        GROUP BY gsis_id
      ) p ON p.gsis_id = ps.player_id
      LEFT JOIN (
        SELECT
          pfr_player_id,
          season,
          week,
          game_type,
          SUM(defense_snaps::FLOAT) AS defense_snaps
        FROM snap_counts
        GROUP BY pfr_player_id, season, week, game_type
      ) sc ON sc.pfr_player_id = p.pfr_id
        AND sc.season = ps.season
        AND sc.week = ps.week
        AND sc.game_type = 'REG'
      WHERE ps.season = $1 AND ps.season_type = 'REG'
      GROUP BY ps.player_id
      ORDER BY ps.player_id ASC
    `;
    const { Prisma } = require('@prisma/client');
    const stats = await prisma.$queryRawUnsafe(query, season);
    res.json(convertBigInts(stats));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player stats' });
  }
});

// Get available years from the GameStat or PlayerStats table
router.get('/available-years', async (req, res) => {
  try {
    // Use raw SQL to fetch distinct seasons, ordered descending
    const query = `SELECT DISTINCT season FROM player_stats WHERE season IS NOT NULL ORDER BY season DESC`;
    const { Prisma } = require('@prisma/client');
    console.log('[AVAILABLE-YEARS] Query:', query);
    const years = await prisma.$queryRawUnsafe(query);
    console.log('[AVAILABLE-YEARS] Raw years:', years);
    // years will be array of objects: [{ season: 2025n }, ...]
    const availableYears = years.map(y => typeof y.season === 'bigint' ? Number(y.season) : y.season).filter(Boolean);
    console.log('[AVAILABLE-YEARS] Parsed years:', availableYears);
    res.json(availableYears);
  } catch (err) {
    console.error('[AvailableYears] error:', err);
    res.status(500).json({ error: 'Failed to fetch available years' });
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
