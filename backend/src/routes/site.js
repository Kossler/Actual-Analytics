// Endpoints for the redesigned site: leaderboards, player pages, teams, games and models.
const express = require('express');
const prisma = require('../db');
const { searchPlayers } = require('../playerSearch');

const router = express.Router();

// BigInt -> Number (counts and seasons are small enough), recursively.
function plain(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = plain(v);
    return out;
  }
  return value;
}

const query = async (sql, ...params) => plain(await prisma.$queryRawUnsafe(sql, ...params));

function intParam(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Wraps an async handler so failures become a JSON 500 instead of a hung request.
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(`[site] ${req.method} ${req.originalUrl} failed:`, err.message);
    res.status(500).json({ error: 'Request failed' });
  }
};

async function currentSeasonAndWeek() {
  const [row] = await query(`
    SELECT s.season::INT AS season,
           COALESCE(MAX(s.week) FILTER (WHERE s.result IS NOT NULL AND s.game_type = 'REG'), 0)::INT AS week
    FROM schedules s
    WHERE s.season = (SELECT MAX(season) FROM player_stats WHERE season_type = 'REG')
    GROUP BY s.season
  `);
  return row || { season: null, week: 0 };
}

// ---------------------------------------------------------------------------------------------
// Meta & search
// ---------------------------------------------------------------------------------------------

router.get('/meta', handle(async (req, res) => {
  const [{ season, week }, seasons, teams] = await Promise.all([
    currentSeasonAndWeek(),
    query(`SELECT DISTINCT season::INT AS season FROM player_stats WHERE season_type = 'REG' ORDER BY season DESC`),
    query(`SELECT team_abbr AS abbr, team_name AS name, team_nick AS nick, team_conf AS conf,
                  team_division AS division, team_color AS color, team_color2 AS color2,
                  team_logo_espn AS logo
           FROM teams ORDER BY team_abbr`),
  ]);
  res.json({ season, week, seasons: seasons.map((s) => s.season), teams });
}));

router.get('/search', handle(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.json({ players: [], teams: [] });
  const [players, teams] = await Promise.all([
    searchPlayers(q),
    query(
      `SELECT team_abbr AS abbr, team_name AS name FROM teams
       WHERE team_name ILIKE $1 OR team_nick ILIKE $1 OR team_abbr ILIKE $2
       ORDER BY team_name LIMIT 5`,
      `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      q,
    ),
  ]);
  res.json({ players: plain(players).slice(0, 8), teams });
}));

// ---------------------------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------------------------

const POSITION_FILTER = { QB: ['QB'], RB: ['RB', 'FB'], WR: ['WR'], TE: ['TE'] };

// Per-player totals over a week range, with play-by-play and Next Gen Stats sums so the client
// can compute any rate for any column set.
const LEADERBOARD_SQL = `
  WITH weeks AS (
    SELECT * FROM player_stats
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN $2 AND $3
  ),
  players AS (
    SELECT
      w.player_id,
      (ARRAY_AGG(w.player_display_name ORDER BY w.week DESC))[1] AS name,
      (ARRAY_AGG(w.team ORDER BY w.week DESC))[1] AS team,
      (ARRAY_AGG(w.position ORDER BY w.week DESC))[1] AS position,
      (ARRAY_AGG(w.headshot_url ORDER BY w.week DESC))[1] AS headshot,
      COUNT(*)::INT AS games,
      SUM(w.completions)::FLOAT AS completions,
      SUM(w.attempts)::FLOAT AS attempts,
      SUM(w.passing_yards)::FLOAT AS passing_yards,
      SUM(w.passing_tds)::FLOAT AS passing_tds,
      SUM(w.passing_interceptions)::FLOAT AS interceptions,
      SUM(w.sacks_suffered)::FLOAT AS sacks,
      SUM(w.sack_yards_lost)::FLOAT AS sack_yards,
      SUM(w.passing_epa)::FLOAT AS passing_epa,
      SUM(w.passing_air_yards)::FLOAT AS passing_air_yards,
      SUM(w.passing_first_downs)::FLOAT AS passing_first_downs,
      SUM(w.carries)::FLOAT AS carries,
      SUM(w.rushing_yards)::FLOAT AS rushing_yards,
      SUM(w.rushing_tds)::FLOAT AS rushing_tds,
      SUM(w.rushing_epa)::FLOAT AS rushing_epa,
      SUM(w.rushing_first_downs)::FLOAT AS rushing_first_downs,
      SUM(COALESCE(w.rushing_fumbles_lost, 0) + COALESCE(w.receiving_fumbles_lost, 0) + COALESCE(w.sack_fumbles_lost, 0))::FLOAT AS fumbles_lost,
      SUM(w.targets)::FLOAT AS targets,
      SUM(w.receptions)::FLOAT AS receptions,
      SUM(w.receiving_yards)::FLOAT AS receiving_yards,
      SUM(w.receiving_tds)::FLOAT AS receiving_tds,
      SUM(w.receiving_epa)::FLOAT AS receiving_epa,
      SUM(w.receiving_air_yards)::FLOAT AS receiving_air_yards,
      SUM(w.receiving_yards_after_catch)::FLOAT AS receiving_yac,
      SUM(w.receiving_first_downs)::FLOAT AS receiving_first_downs,
      AVG(w.target_share)::FLOAT AS target_share,
      AVG(w.air_yards_share)::FLOAT AS air_yards_share,
      AVG(w.wopr)::FLOAT AS wopr,
      SUM(w.fantasy_points_ppr)::FLOAT AS fantasy_points_ppr
    FROM weeks w
    GROUP BY w.player_id
  ),
  pbp AS (
    SELECT player_id,
      SUM(dropbacks)::FLOAT AS dropbacks, SUM(dropback_epa) AS dropback_epa,
      SUM(dropback_success) AS dropback_success, SUM(cpoe_sum) AS cpoe_sum, SUM(cpoe_n)::FLOAT AS cpoe_n,
      SUM(carries)::FLOAT AS pbp_carries, SUM(rush_epa) AS pbp_rush_epa, SUM(rush_success) AS rush_success,
      SUM(targets)::FLOAT AS pbp_targets, SUM(target_epa) AS target_epa, SUM(target_success) AS target_success
    FROM player_week_pbp
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN $2 AND $3
    GROUP BY player_id
  ),
  ngs_pass AS (
    SELECT player_gsis_id AS player_id,
      SUM(avg_time_to_throw * attempts) / NULLIF(SUM(attempts), 0) AS time_to_throw,
      SUM(aggressiveness * attempts) / NULLIF(SUM(attempts), 0) AS aggressiveness,
      SUM(avg_intended_air_yards * attempts) / NULLIF(SUM(attempts), 0) AS intended_air_yards
    FROM nextgen_stats
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN GREATEST($2, 1) AND $3
    GROUP BY player_gsis_id
  ),
  ngs_rush AS (
    SELECT player_gsis_id AS player_id,
      SUM(rush_yards_over_expected)::FLOAT AS ryoe, SUM(rush_attempts)::FLOAT AS ngs_rush_attempts,
      SUM(percent_attempts_gte_eight_defenders * rush_attempts) / NULLIF(SUM(rush_attempts), 0) AS stacked_box_pct
    FROM nextgen_rushing
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN GREATEST($2, 1) AND $3
    GROUP BY player_gsis_id
  ),
  ngs_rec AS (
    SELECT player_gsis_id AS player_id,
      SUM(avg_separation * targets) / NULLIF(SUM(targets), 0) AS separation,
      SUM(avg_cushion * targets) / NULLIF(SUM(targets), 0) AS cushion,
      SUM(avg_yac_above_expectation * receptions) / NULLIF(SUM(receptions), 0) AS yac_over_expected
    FROM nextgen_receiving
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN GREATEST($2, 1) AND $3
    GROUP BY player_gsis_id
  )
  SELECT p.*, pbp.dropbacks, pbp.dropback_epa, pbp.dropback_success, pbp.cpoe_sum, pbp.cpoe_n,
         pbp.pbp_carries, pbp.pbp_rush_epa, pbp.rush_success, pbp.pbp_targets, pbp.target_epa,
         pbp.target_success, np.time_to_throw, np.aggressiveness, np.intended_air_yards,
         nr.ryoe, nr.ngs_rush_attempts, nr.stacked_box_pct,
         nc.separation, nc.cushion, nc.yac_over_expected
  FROM players p
  LEFT JOIN pbp ON pbp.player_id = p.player_id
  LEFT JOIN ngs_pass np ON np.player_id = p.player_id
  LEFT JOIN ngs_rush nr ON nr.player_id = p.player_id
  LEFT JOIN ngs_rec nc ON nc.player_id = p.player_id
  WHERE p.position = ANY($4)
`;

router.get('/leaderboard/:pos', handle(async (req, res) => {
  const pos = String(req.params.pos).toUpperCase();
  if (!POSITION_FILTER[pos]) return res.status(400).json({ error: 'Unknown position' });
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  const [{ max_week: maxWeek }] = await query(
    `SELECT COALESCE(MAX(week), 0)::INT AS max_week FROM player_stats WHERE season = $1 AND season_type = 'REG'`,
    season,
  );
  const from = Math.max(1, intParam(req.query.from, 1));
  const to = Math.min(maxWeek || 18, intParam(req.query.to, maxWeek || 18));
  const rows = await query(LEADERBOARD_SQL, season, from, to, POSITION_FILTER[pos]);
  res.json({ season, position: pos, from, to, maxWeek, players: rows });
}));

// ---------------------------------------------------------------------------------------------
// Player page
// ---------------------------------------------------------------------------------------------

const PLAYER_GAMES_SQL = `
  SELECT
    ps.season::INT AS season, ps.week::INT AS week, ps.season_type, ps.team, ps.opponent_team AS opponent,
    ps.position,
    ps.completions::FLOAT AS completions, ps.attempts::FLOAT AS attempts,
    ps.passing_yards::FLOAT AS passing_yards, ps.passing_tds::FLOAT AS passing_tds,
    ps.passing_interceptions::FLOAT AS interceptions, ps.sacks_suffered::FLOAT AS sacks,
    ps.sack_yards_lost::FLOAT AS sack_yards, ps.passing_epa::FLOAT AS passing_epa,
    ps.passing_cpoe::FLOAT AS passing_cpoe, ps.passing_air_yards::FLOAT AS passing_air_yards,
    ps.carries::FLOAT AS carries, ps.rushing_yards::FLOAT AS rushing_yards,
    ps.rushing_tds::FLOAT AS rushing_tds, ps.rushing_epa::FLOAT AS rushing_epa,
    ps.targets::FLOAT AS targets, ps.receptions::FLOAT AS receptions,
    ps.receiving_yards::FLOAT AS receiving_yards, ps.receiving_tds::FLOAT AS receiving_tds,
    ps.receiving_epa::FLOAT AS receiving_epa, ps.receiving_air_yards::FLOAT AS receiving_air_yards,
    ps.receiving_yards_after_catch::FLOAT AS receiving_yac, ps.target_share::FLOAT AS target_share,
    ps.wopr::FLOAT AS wopr, ps.fantasy_points_ppr::FLOAT AS fantasy_points_ppr,
    (COALESCE(ps.rushing_fumbles_lost, 0) + COALESCE(ps.receiving_fumbles_lost, 0) + COALESCE(ps.sack_fumbles_lost, 0))::FLOAT AS fumbles_lost,
    ps.def_tackles_solo::FLOAT AS def_tackles_solo, ps.def_tackle_assists::FLOAT AS def_tackle_assists,
    ps.def_tackles_for_loss::FLOAT AS def_tackles_for_loss, ps.def_sacks::FLOAT AS def_sacks,
    ps.def_qb_hits::FLOAT AS def_qb_hits, ps.def_interceptions::FLOAT AS def_interceptions,
    ps.def_pass_defended::FLOAT AS def_pass_defended, ps.def_fumbles_forced::FLOAT AS def_fumbles_forced,
    ps.def_tds::FLOAT AS def_tds,
    ps.fg_made::FLOAT AS fg_made, ps.fg_att::FLOAT AS fg_att, ps.fg_long::FLOAT AS fg_long,
    ps.pat_made::FLOAT AS pat_made, ps.pat_att::FLOAT AS pat_att,
    pw.dropbacks::FLOAT AS dropbacks, pw.dropback_epa, pw.dropback_success, pw.cpoe_sum,
    pw.cpoe_n::FLOAT AS cpoe_n, pw.carries::FLOAT AS pbp_carries, pw.rush_epa AS pbp_rush_epa,
    pw.rush_success, pw.targets::FLOAT AS pbp_targets, pw.target_epa, pw.target_success,
    s.game_id, s.home_team, s.away_team, s.home_score::FLOAT AS home_score,
    s.away_score::FLOAT AS away_score, s.gameday, s.roof, s.game_type
  FROM player_stats ps
  LEFT JOIN player_week_pbp pw
    ON pw.player_id = ps.player_id AND pw.season = ps.season AND pw.week = ps.week
  LEFT JOIN schedules s
    ON s.season = ps.season AND s.week = ps.week AND (s.home_team = ps.team OR s.away_team = ps.team)
  WHERE ps.player_id = $1
  ORDER BY ps.season, ps.week
`;

const PLAYER_NGS_SQL = `
  SELECT 'passing' AS kind, season::INT AS season, week::INT AS week,
         avg_time_to_throw AS time_to_throw, aggressiveness, avg_intended_air_yards AS intended_air_yards,
         avg_completed_air_yards AS completed_air_yards,
         completion_percentage_above_expectation AS cpoe_ngs, attempts::FLOAT AS volume,
         NULL::FLOAT AS ryoe, NULL::FLOAT AS ryoe_per_att, NULL::FLOAT AS stacked_box_pct,
         NULL::FLOAT AS separation, NULL::FLOAT AS cushion, NULL::FLOAT AS yac_over_expected
  FROM nextgen_stats WHERE player_gsis_id = $1
  UNION ALL
  SELECT 'rushing', season::INT, week::INT, NULL, NULL, NULL, NULL, NULL, rush_attempts::FLOAT,
         rush_yards_over_expected, rush_yards_over_expected_per_att, percent_attempts_gte_eight_defenders,
         NULL, NULL, NULL
  FROM nextgen_rushing WHERE player_gsis_id = $1
  UNION ALL
  SELECT 'receiving', season::INT, week::INT, NULL, NULL, avg_intended_air_yards, NULL, NULL,
         targets::FLOAT, NULL, NULL, NULL, avg_separation, avg_cushion, avg_yac_above_expectation
  FROM nextgen_receiving WHERE player_gsis_id = $1
  ORDER BY 2, 3
`;

router.get('/players/:id/page', handle(async (req, res) => {
  const id = req.params.id;
  const [players, games, ngs, contracts] = await Promise.all([
    query(`SELECT gsis_id, display_name, first_name, last_name, position, position_group, latest_team,
                  jersey_number, height::FLOAT AS height, weight::FLOAT AS weight, college_name, headshot,
                  birth_date, years_of_experience, rookie_season, draft_year, draft_round, draft_pick,
                  draft_team, status, pfr_id, otc_id
           FROM players WHERE gsis_id = $1`, id),
    query(PLAYER_GAMES_SQL, id),
    query(PLAYER_NGS_SQL, id),
    query(`SELECT c.year_signed::INT AS year_signed, c.years::INT AS years, c.value, c.apy, c.guaranteed,
                  c.apy_cap_pct, c.team, c.is_active
           FROM contracts c
           WHERE c.gsis_id = $1
              OR c.otc_id = (SELECT otc_id FROM players WHERE gsis_id = $1 AND otc_id IS NOT NULL LIMIT 1)
           ORDER BY c.year_signed DESC NULLS LAST`, id),
  ]);
  if (!players.length) return res.status(404).json({ error: 'Player not found' });
  res.json({ player: players[0], games, ngs, contracts });
}));

// ---------------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------------

const SITUATIONS = ['all', 'early_downs', 'late_downs', 'red_zone', 'neutral'];

async function teamSeason(season, situation) {
  const [epa, results, odds, teams] = await Promise.all([
    query(`
      SELECT team, side, SUM(plays)::FLOAT AS plays, SUM(epa) AS epa, SUM(success) AS success,
             SUM(pass_plays)::FLOAT AS pass_plays, SUM(pass_epa) AS pass_epa,
             SUM(rush_plays)::FLOAT AS rush_plays, SUM(rush_epa) AS rush_epa,
             SUM(yards) AS yards, SUM(turnovers)::FLOAT AS turnovers, COUNT(*)::INT AS games
      FROM team_game_pbp
      WHERE season = $1 AND season_type = 'REG' AND situation = $2
      GROUP BY team, side`, season, situation),
    query(`
      SELECT team,
             COUNT(*) FILTER (WHERE pf > pa)::INT AS wins,
             COUNT(*) FILTER (WHERE pf < pa)::INT AS losses,
             COUNT(*) FILTER (WHERE pf = pa)::INT AS ties,
             SUM(pf)::FLOAT AS points_for, SUM(pa)::FLOAT AS points_against
      FROM (
        SELECT home_team AS team, home_score AS pf, away_score AS pa FROM schedules
        WHERE season = $1 AND game_type = 'REG' AND result IS NOT NULL
        UNION ALL
        SELECT away_team, away_score, home_score FROM schedules
        WHERE season = $1 AND game_type = 'REG' AND result IS NOT NULL
      ) g
      GROUP BY team`, season),
    query(`SELECT team, playoff_pct, division_pct, top_seed_pct, proj_wins, proj_losses, through_week
           FROM playoff_odds WHERE season = $1`, season),
    query(`SELECT team_abbr AS abbr, team_name AS name, team_nick AS nick, team_conf AS conf,
                  team_division AS division, team_color AS color, team_color2 AS color2,
                  team_logo_espn AS logo
           FROM teams`),
  ]);
  const byTeam = new Map(teams.map((t) => [t.abbr, { ...t, wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 }]));
  for (const r of results) if (byTeam.has(r.team)) Object.assign(byTeam.get(r.team), r);
  for (const o of odds) if (byTeam.has(o.team)) byTeam.get(o.team).odds = o;
  for (const e of epa) {
    const t = byTeam.get(e.team);
    if (t) t[e.side === 'off' ? 'offense' : 'defense'] = e;
  }
  return [...byTeam.values()];
}

router.get('/teams', handle(async (req, res) => {
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  const situation = SITUATIONS.includes(req.query.situation) ? req.query.situation : 'all';
  res.json({ season, situation, teams: await teamSeason(season, situation) });
}));

router.get('/teams/:abbr', handle(async (req, res) => {
  const abbr = String(req.params.abbr).toUpperCase();
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  const [teams, games, gameEpa, quarterbacks, leaders] = await Promise.all([
    teamSeason(season, 'all'),
    query(`
      SELECT s.game_id, s.week::INT AS week, s.game_type, s.gameday, s.home_team, s.away_team,
             s.home_score::FLOAT AS home_score, s.away_score::FLOAT AS away_score,
             gp.home_wp, gp.home_proj, gp.away_proj
      FROM schedules s
      LEFT JOIN game_predictions gp ON gp.game_id = s.game_id
      WHERE s.season = $1 AND (s.home_team = $2 OR s.away_team = $2)
      ORDER BY s.week`, season, abbr),
    query(`SELECT game_id, side, plays::FLOAT AS plays, epa FROM team_game_pbp
           WHERE season = $1 AND team = $2 AND situation = 'all'`, season, abbr),
    // The team's main passer in each game (most dropbacks).
    query(`
      SELECT DISTINCT ON (pw.week) pw.week, pw.player_id, pl.display_name AS name,
             pw.dropbacks::FLOAT AS dropbacks, pw.dropback_epa
      FROM player_week_pbp pw
      LEFT JOIN players pl ON pl.gsis_id = pw.player_id
      WHERE pw.season = $1 AND pw.team = $2 AND pw.dropbacks > 0
      ORDER BY pw.week, pw.dropbacks DESC`, season, abbr),
    query(`
      WITH totals AS (
        SELECT ps.player_id, MAX(ps.player_display_name) AS name, MAX(ps.position) AS position,
               SUM(ps.passing_yards)::FLOAT AS passing_yards, SUM(ps.passing_tds)::FLOAT AS passing_tds,
               SUM(ps.passing_interceptions)::FLOAT AS interceptions, SUM(ps.attempts)::FLOAT AS attempts,
               SUM(ps.rushing_yards)::FLOAT AS rushing_yards, SUM(ps.carries)::FLOAT AS carries,
               SUM(ps.rushing_tds)::FLOAT AS rushing_tds,
               SUM(ps.receiving_yards)::FLOAT AS receiving_yards, SUM(ps.receptions)::FLOAT AS receptions,
               SUM(ps.receiving_tds)::FLOAT AS receiving_tds, SUM(ps.targets)::FLOAT AS targets
        FROM player_stats ps
        WHERE ps.season = $1 AND ps.season_type = 'REG' AND ps.team = $2
        GROUP BY ps.player_id
      ),
      pbp AS (
        SELECT player_id, SUM(dropbacks)::FLOAT AS dropbacks, SUM(dropback_epa) AS dropback_epa,
               SUM(carries)::FLOAT AS pbp_carries, SUM(rush_epa) AS pbp_rush_epa,
               SUM(targets)::FLOAT AS pbp_targets, SUM(target_epa) AS target_epa
        FROM player_week_pbp WHERE season = $1 AND team = $2 AND season_type = 'REG'
        GROUP BY player_id
      )
      SELECT t.*, pbp.dropbacks, pbp.dropback_epa, pbp.pbp_carries, pbp.pbp_rush_epa, pbp.pbp_targets, pbp.target_epa
      FROM totals t LEFT JOIN pbp USING (player_id)`, season, abbr),
  ]);
  const team = teams.find((t) => t.abbr === abbr);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const epaByGame = new Map();
  for (const g of gameEpa) {
    const entry = epaByGame.get(g.game_id) || {};
    entry[g.side] = g.plays ? g.epa / g.plays : null;
    epaByGame.set(g.game_id, entry);
  }
  const qbByWeek = new Map(quarterbacks.map((q) => [q.week, q]));
  const schedule = games.map((g) => {
    const home = g.home_team === abbr;
    const qb = qbByWeek.get(g.week);
    return {
      game_id: g.game_id, week: g.week, game_type: g.game_type, gameday: g.gameday, home,
      opponent: home ? g.away_team : g.home_team,
      points_for: home ? g.home_score : g.away_score,
      points_against: home ? g.away_score : g.home_score,
      win_prob: g.home_wp == null ? null : home ? g.home_wp : 1 - g.home_wp,
      proj_for: g.home_wp == null ? null : home ? g.home_proj : g.away_proj,
      proj_against: g.home_wp == null ? null : home ? g.away_proj : g.home_proj,
      off_epa: epaByGame.get(g.game_id)?.off ?? null,
      def_epa: epaByGame.get(g.game_id)?.def ?? null,
      qb: qb ? { player_id: qb.player_id, name: qb.name, epa_per_play: qb.dropback_epa / qb.dropbacks } : null,
    };
  });
  const top = (key) => leaders.filter((l) => l[key] > 0).sort((a, b) => b[key] - a[key])[0] || null;
  res.json({
    season, team, teams,
    leaders: { passing: top('passing_yards'), rushing: top('rushing_yards'), receiving: top('receiving_yards') },
    schedule,
  });
}));

// ---------------------------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------------------------

router.get('/games', handle(async (req, res) => {
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  const weeks = await query(`
    SELECT week::INT AS week, MIN(game_type) AS game_type,
           COUNT(*)::INT AS games, COUNT(result)::INT AS completed
    FROM schedules WHERE season = $1 GROUP BY week ORDER BY week`, season);
  // Default to the latest week with a completed game, or the first week of the season.
  const latestPlayed = [...weeks].reverse().find((w) => w.completed > 0);
  const week = intParam(req.query.week, latestPlayed ? latestPlayed.week : weeks[0]?.week || 1);
  const games = await query(`
    SELECT s.game_id, s.week::INT AS week, s.game_type, s.gameday, s.gametime, s.home_team, s.away_team,
           s.home_score::FLOAT AS home_score, s.away_score::FLOAT AS away_score, s.location,
           gp.home_wp, gp.home_proj, gp.away_proj, gp.proj_margin
    FROM schedules s
    LEFT JOIN game_predictions gp ON gp.game_id = s.game_id
    WHERE s.season = $1 AND s.week = $2
    ORDER BY s.gameday, s.gametime, s.game_id`, season, week);
  res.json({ season, week, weeks, games });
}));

router.get('/games/:gameId', handle(async (req, res) => {
  const gameId = req.params.gameId;
  const [[game], plays, sides] = await Promise.all([
    query(`
      SELECT s.game_id, s.season::INT AS season, s.week::INT AS week, s.game_type, s.gameday,
             s.home_team, s.away_team, s.home_score::FLOAT AS home_score, s.away_score::FLOAT AS away_score,
             gp.home_wp AS pregame_home_wp, gp.home_proj, gp.away_proj
      FROM schedules s LEFT JOIN game_predictions gp ON gp.game_id = s.game_id
      WHERE s.game_id = $1`, gameId),
    query(`
      SELECT qtr::INT AS qtr, game_seconds_remaining AS seconds_left, home_wp,
             total_home_score::INT AS home_score, total_away_score::INT AS away_score
      FROM pbp
      WHERE game_id = $1 AND home_wp IS NOT NULL AND game_seconds_remaining IS NOT NULL
      ORDER BY play_id`, gameId),
    query(`SELECT team, plays::FLOAT AS plays, epa, success, yards, turnovers::FLOAT AS turnovers
           FROM team_game_pbp WHERE game_id = $1 AND side = 'off' AND situation = 'all'`, gameId),
  ]);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  // Thin the series to at most ~240 points; the chart doesn't need every play.
  const step = Math.max(1, Math.ceil(plays.length / 240));
  const series = plays.filter((_, i) => i % step === 0 || i === plays.length - 1);
  res.json({ game, series, teams: sides });
}));

// ---------------------------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------------------------

function calibrationBins(rows) {
  // Favourite's predicted probability vs how often the favourite won.
  const bins = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0001]];
  return bins.map(([lo, hi]) => {
    const inBin = rows.filter((r) => r.fav_prob >= lo && r.fav_prob < hi);
    return {
      from: lo, to: Math.min(hi, 1), games: inBin.length,
      predicted: inBin.length ? inBin.reduce((s, r) => s + r.fav_prob, 0) / inBin.length : null,
      actual: inBin.length ? inBin.filter((r) => r.fav_won).length / inBin.length : null,
    };
  });
}

router.get('/models/win-probability', handle(async (req, res) => {
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  const [games, [run]] = await Promise.all([
    query(`
      SELECT s.game_id, s.week::INT AS week, s.game_type, s.gameday, s.home_team, s.away_team,
             s.home_score::FLOAT AS home_score, s.away_score::FLOAT AS away_score,
             gp.home_wp, gp.home_proj, gp.away_proj, gp.proj_margin
      FROM schedules s JOIN game_predictions gp ON gp.game_id = s.game_id
      WHERE s.season = $1
      ORDER BY s.week, s.gameday, s.gametime, s.game_id`, season),
    query(`SELECT metrics, created_at FROM model_runs WHERE model = 'game' ORDER BY id DESC LIMIT 1`),
  ]);
  const completed = games.filter((g) => g.home_score != null && g.home_score !== g.away_score);
  const scored = completed.map((g) => {
    const homeWon = g.home_score > g.away_score;
    const p = Math.min(Math.max(g.home_wp, 1e-6), 1 - 1e-6);
    return {
      correct: (g.home_wp > 0.5) === homeWon,
      brier: (g.home_wp - (homeWon ? 1 : 0)) ** 2,
      logLoss: -Math.log(homeWon ? p : 1 - p),
      fav_prob: Math.max(g.home_wp, 1 - g.home_wp),
      fav_won: (g.home_wp >= 0.5) === homeWon,
    };
  });
  const mean = (key) => (scored.length ? scored.reduce((s, r) => s + r[key], 0) / scored.length : null);
  const upcoming = games.filter((g) => g.home_score == null);
  const nextWeek = upcoming.length ? upcoming[0].week : null;
  res.json({
    season,
    week: nextWeek,
    upcoming: upcoming.filter((g) => g.week === nextWeek),
    performance: {
      games: scored.length,
      correct: scored.filter((r) => r.correct).length,
      brier: mean('brier'),
      logLoss: mean('logLoss'),
      calibration: calibrationBins(scored),
    },
    validation: run ? { ...run.metrics, trained_at: run.created_at } : null,
  });
}));

router.get('/models/projections', handle(async (req, res) => {
  const [rows, [run]] = await Promise.all([
    query(`SELECT season, week, player_id, player_name, position, team, opponent, home, game_id, stats
           FROM player_projections
           WHERE season = (SELECT MAX(season) FROM player_projections)
           ORDER BY position, player_name`),
    query(`SELECT metrics, created_at FROM model_runs WHERE model = 'player_projections' ORDER BY id DESC LIMIT 1`),
  ]);
  res.json({
    season: rows[0]?.season ?? null,
    week: rows[0]?.week ?? null,
    projections: rows,
    backtest: run ? run.metrics.backtest : null,
    trained_at: run?.created_at ?? null,
  });
}));

// Team-seasons split into the first half (weeks 1-9) and the rest of the regular season, for
// testing which first-half metrics predict second-half results.
router.get('/models/regression-lab', handle(async (req, res) => {
  const [epa, results] = await Promise.all([
    query(`
      SELECT season::INT AS season, team, CASE WHEN week <= 9 THEN 1 ELSE 2 END AS half, side,
             SUM(plays)::FLOAT AS plays, SUM(epa) AS epa, SUM(success) AS success,
             SUM(pass_plays)::FLOAT AS pass_plays, SUM(pass_epa) AS pass_epa,
             SUM(rush_plays)::FLOAT AS rush_plays, SUM(rush_epa) AS rush_epa,
             SUM(turnovers)::FLOAT AS turnovers
      FROM team_game_pbp
      WHERE situation = 'all' AND season_type = 'REG' AND season >= 2006
      GROUP BY 1, 2, 3, 4`),
    query(`
      SELECT season::INT AS season, team, CASE WHEN week <= 9 THEN 1 ELSE 2 END AS half,
             COUNT(*)::INT AS games, SUM(pf - pa)::FLOAT AS point_diff,
             SUM(CASE WHEN pf > pa THEN 1 WHEN pf = pa THEN 0.5 ELSE 0 END)::FLOAT AS wins
      FROM (
        SELECT season, week, home_team AS team, home_score AS pf, away_score AS pa FROM schedules
        WHERE game_type = 'REG' AND result IS NOT NULL AND season >= 2006
        UNION ALL
        SELECT season, week, away_team, away_score, home_score FROM schedules
        WHERE game_type = 'REG' AND result IS NOT NULL AND season >= 2006
      ) g
      GROUP BY 1, 2, 3`),
  ]);
  const key = (r) => `${r.season}|${r.team}`;
  const rows = new Map();
  const row = (r) => {
    if (!rows.has(key(r))) rows.set(key(r), { season: r.season, team: r.team, halves: { 1: {}, 2: {} } });
    return rows.get(key(r));
  };
  for (const r of epa) row(r).halves[r.half][r.side] = r;
  for (const r of results) row(r).halves[r.half].results = r;
  const out = [];
  for (const r of rows.values()) {
    const h1 = r.halves[1];
    const h2 = r.halves[2];
    if (!h1.off || !h1.def || !h1.results || !h2.results) continue;
    out.push({
      season: r.season,
      team: r.team,
      first: {
        off_epa: h1.off.epa / h1.off.plays,
        def_epa: h1.def.epa / h1.def.plays,
        net_epa: h1.off.epa / h1.off.plays - h1.def.epa / h1.def.plays,
        pass_off_epa: h1.off.pass_epa / h1.off.pass_plays,
        rush_off_epa: h1.off.rush_epa / h1.off.rush_plays,
        pass_def_epa: h1.def.pass_epa / h1.def.pass_plays,
        rush_def_epa: h1.def.rush_epa / h1.def.rush_plays,
        off_success: h1.off.success / h1.off.plays,
        turnover_diff: (h1.def.turnovers - h1.off.turnovers) / h1.results.games,
        point_diff: h1.results.point_diff / h1.results.games,
        win_pct: h1.results.wins / h1.results.games,
      },
      second: {
        point_diff: h2.results.point_diff / h2.results.games,
        win_pct: h2.results.wins / h2.results.games,
      },
    });
  }
  res.json({ rows: out });
}));

module.exports = router;
