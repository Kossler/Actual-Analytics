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


// PlayerStats CRUD

// Optimized homepage stats endpoint (must be before /playerstats/:id)
router.get('/playerstats/home', async (req, res) => {
  try {
    console.log('[HOME] Fetching latest season from player_stats...');
    const latestSeason = await prisma.player_stats.findMany({
      orderBy: { season: 'desc' },
      take: 1,
      select: { season: true },
    });
    console.log('[HOME] Latest season query result:', latestSeason);
    let season = latestSeason[0]?.season;
    if (!season) {
      console.warn('[HOME] No season found in player_stats!');
      return res.status(404).json({ error: 'No season found' });
    }

    // Convert BigInt season to Number if needed
    if (typeof season === 'bigint') season = Number(season);
    console.log('[HOME] Using season:', season);

    // Helper to get top 12 for a position, converting BigInt fields to Number
    function convertBigInts(obj) {
      if (Array.isArray(obj)) {
        return obj.map(convertBigInts);
      } else if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
          if (typeof obj[key] === 'bigint') {
            newObj[key] = Number(obj[key]);
          } else {
            newObj[key] = obj[key];
          }
        }
        return newObj;
      }
      return obj;
    }



    async function getTop(position, orderByField) {
      console.log(`[HOME] Aggregating REGULAR season totals for position ${position} by ${orderByField} in season ${season}`);
      // Only regular season games
      const stats = await prisma.player_stats.findMany({
        where: { season, position, season_type: 'REG' },
        select: {
          player_id: true,
          player_display_name: true,
          team: true,
          position: true,
          completions: true,
          attempts: true,
          passing_yards: true,
          passing_tds: true,
          passing_interceptions: true,
          passing_epa: true,
          passing_cpoe: true,
          sacks_suffered: true,
          carries: true,
          rushing_yards: true,
          rushing_tds: true,
          rushing_epa: true,
          receptions: true,
          targets: true,
          receiving_yards: true,
          receiving_tds: true,
          receiving_epa: true,
          week: true,
        },
      });

      // DEBUG: Print all weekly CPOE values for Drake Maye (player_id = '00-0046944')
      if (position === 'QB' && Array.isArray(stats)) {
        const drakeMayeStats = stats.filter(s => s.player_id === '00-0039851');
        console.log('[DEBUG][Drake Maye] Weekly CPOE values:', drakeMayeStats.map(s => ({ week: s.week, cpoe: s.passing_cpoe })));
        // Print all QB player_ids and display names for the season
        console.log('[DEBUG][QB List] player_ids and names:', stats.map(s => ({ player_id: s.player_id, name: s.player_display_name })));
        // Print any QB with 'Drake' or 'Maye' in their name for the season
        const drakeCandidates = stats.filter(s => (s.player_display_name && (s.player_display_name.toLowerCase().includes('drake') || s.player_display_name.toLowerCase().includes('maye'))));
        console.log('[DEBUG][QB Drake Candidates] player_ids and names:', drakeCandidates.map(s => ({ player_id: s.player_id, name: s.player_display_name })));
      }

      // Aggregate by player_id
      const playerMap = new Map();
      for (const stat of stats) {
        const pid = stat.player_id;
        if (!playerMap.has(pid)) {
          playerMap.set(pid, {
            player_id: stat.player_id,
            player_display_name: stat.player_display_name,
            team: stat.team,
            position: stat.position,
            completions: stat.completions || 0n,
            attempts: stat.attempts || 0n,
            passing_yards: stat.passing_yards || 0n,
            passing_tds: stat.passing_tds || 0n,
            passing_interceptions: stat.passing_interceptions || 0n,
            passing_epa: stat.passing_epa || 0,
            passing_cpoe: stat.passing_cpoe || 0,
            sacks_suffered: stat.sacks_suffered || 0n,
            carries: stat.carries || 0n,
            rushing_yards: stat.rushing_yards || 0n,
            rushing_tds: stat.rushing_tds || 0n,
            rushing_epa: stat.rushing_epa || 0,
            receptions: stat.receptions || 0n,
            targets: stat.targets || 0n,
            receiving_yards: stat.receiving_yards || 0n,
            receiving_tds: stat.receiving_tds || 0n,
            receiving_epa: stat.receiving_epa || 0,
            weeks: new Set([stat.week]),
            games: 1,
            // For averages
            pass_cpoe_count: stat.passing_cpoe != null ? 1 : 0,
            pass_cpoe_sum: stat.passing_cpoe != null ? stat.passing_cpoe : 0,
            pass_epa_sum: stat.attempts && stat.attempts > 0n ? stat.passing_epa || 0 : 0,
            rush_carry_games: stat.carries && stat.carries > 0n ? 1 : 0,
            rush_epa_sum: stat.carries && stat.carries > 0n ? stat.rushing_epa || 0 : 0,
            rec_reception_games: stat.receptions && stat.receptions > 0n ? 1 : 0,
            rec_epa_sum: stat.receptions && stat.receptions > 0n ? stat.receiving_epa || 0 : 0,
          });
        } else {
          const agg = playerMap.get(pid);
          agg.completions += stat.completions || 0n;
          agg.attempts += stat.attempts || 0n;
          agg.passing_yards += stat.passing_yards || 0n;
          agg.passing_tds += stat.passing_tds || 0n;
          agg.passing_interceptions += stat.passing_interceptions || 0n;
          agg.passing_epa += stat.passing_epa || 0;
          agg.sacks_suffered += stat.sacks_suffered || 0n;
          agg.carries += stat.carries || 0n;
          agg.rushing_yards += stat.rushing_yards || 0n;
          agg.rushing_tds += stat.rushing_tds || 0n;
          agg.rushing_epa += stat.rushing_epa || 0;
          agg.receptions += stat.receptions || 0n;
          agg.targets += stat.targets || 0n;
          agg.receiving_yards += stat.receiving_yards || 0n;
          agg.receiving_tds += stat.receiving_tds || 0n;
          agg.receiving_epa += stat.receiving_epa || 0;
          agg.weeks.add(stat.week);
          agg.games += 1;
          // For averages
          if (stat.passing_cpoe != null) {
            agg.pass_cpoe_count += 1;
            agg.pass_cpoe_sum += stat.passing_cpoe;
          }
          if (stat.attempts && stat.attempts > 0n) {
            agg.pass_attempt_games += 1;
            agg.pass_epa_sum += stat.passing_epa || 0;
          }
          if (stat.carries && stat.carries > 0n) {
            agg.rush_carry_games += 1;
            agg.rush_epa_sum += stat.rushing_epa || 0;
          }
          if (stat.receptions && stat.receptions > 0n) {
            agg.rec_reception_games += 1;
            agg.rec_epa_sum += stat.receiving_epa || 0;
          }
        }
      }
      // Convert to array, add game_count, and calculate averages
      let players = Array.from(playerMap.values()).map(p => {
        const { weeks, pass_cpoe_count, pass_cpoe_sum, pass_attempt_games, pass_epa_sum, rush_carry_games, rush_epa_sum, rec_reception_games, rec_epa_sum, ...rest } = p;
        return {
          ...rest,
          game_count: weeks.size,
          passing_cpoe_avg: pass_cpoe_count > 0 ? pass_cpoe_sum / pass_cpoe_count : null,
          passing_epa_per_play: pass_attempt_games > 0 ? pass_epa_sum / pass_attempt_games : null,
          rushing_epa_per_play: rush_carry_games > 0 ? rush_epa_sum / rush_carry_games : null,
          receiving_epa_per_play: rec_reception_games > 0 ? rec_epa_sum / rec_reception_games : null,
        };
      });
      players = players.sort((a, b) => {
        const aVal = a[orderByField];
        const bVal = b[orderByField];
        return Number(bVal || 0) - Number(aVal || 0);
      }).slice(0, 12);
      return convertBigInts(players);
    }

    const [qbs, rbs, wrs, tes] = await Promise.all([
      getTop('QB', 'passing_yards'),
      getTop('RB', 'rushing_yards'),
      getTop('WR', 'receiving_yards'),
      getTop('TE', 'receiving_yards'),
    ]);

    console.log('[HOME] Returning home stats:', { season, qbsCount: qbs.length, rbsCount: rbs.length, wrsCount: wrs.length, tesCount: tes.length });
    res.json({ season, qbs, rbs, wrs, tes });
  } catch (err) {
    console.error('[HOME] Error in /playerstats/home:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
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
