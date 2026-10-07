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

// The week the win probability model is forecasting: the earliest with a predicted game not yet
// played. It moves on once the last game of a week is final. The games page opens on it too.
async function forecastWeek(season) {
  const [row] = await query(`
    SELECT MIN(s.week)::INT AS week
    FROM schedules s JOIN game_predictions gp ON gp.game_id = s.game_id
    WHERE s.season = $1 AND s.home_score IS NULL`, season);
  return row?.week ?? null;
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

const POSITION_FILTER = { QB: ['QB'], RB: ['RB', 'FB'], WR: ['WR'], TE: ['TE'], K: ['K'] };
// nflverse labels: SAF for safeties since 2025 (S/FS/SS before), DB for unspecified defensive backs.
const DEFENSE_FILTER = {
  DL: ['DE', 'DT', 'NT', 'DL', 'EDGE'], LB: ['LB', 'ILB', 'OLB', 'MLB'], CB: ['CB', 'DB'], S: ['SAF', 'S', 'FS', 'SS'],
};

// Pro Football Reference advanced stats, summed per player. pfr_* aliases keep them apart from the
// nflverse columns with similar names (e.g. carries).
const PFR_FIELDS = {
  pass: ['passing_bad_throws AS pfr_bad_throws', 'times_pressured AS pfr_pressured', 'times_blitzed AS pfr_blitzed',
    'times_hurried AS pfr_hurried', 'times_hit AS pfr_hit', 'passing_drops AS pfr_drops_thrown'],
  rush: ['carries AS pfr_carries', 'rushing_yards_before_contact AS pfr_ybc', 'rushing_yards_after_contact AS pfr_yac_rush',
    'rushing_broken_tackles AS pfr_rush_broken'],
  rec: ['receiving_drop AS pfr_rec_drops', 'receiving_broken_tackles AS pfr_rec_broken', 'receiving_int AS pfr_rec_int'],
  def: ['def_targets AS pfr_def_targets', 'def_completions_allowed AS pfr_def_completions', 'def_yards_allowed AS pfr_def_yards',
    'def_receiving_td_allowed AS pfr_def_td', 'def_ints AS pfr_def_ints', 'def_pressures AS pfr_def_pressures',
    'def_times_hurried AS pfr_def_hurries', 'def_times_blitzed AS pfr_def_blitzes', 'def_missed_tackles AS pfr_def_missed',
    'def_tackles_combined AS pfr_def_tackles', 'def_yards_after_catch AS pfr_def_yac'],
};
const PFR_KINDS = ['pass', 'rush', 'rec', 'def'];

// Box-score defense from player_stats, summed per player.
const DEF_BOX_SUMS = ['def_tackles_solo', 'def_tackle_assists', 'def_tackles_for_loss', 'def_sacks', 'def_qb_hits',
  'def_interceptions', 'def_interception_yards', 'def_pass_defended', 'def_fumbles_forced', 'def_fumbles', 'def_tds',
  'def_safeties'].map((f) => `COALESCE(SUM(w.${f}), 0)::FLOAT AS ${f}`).join(',\n      ');
// Columns of player_week_adv.
// Schedules list relocated franchises under the code of the season (OAK, SD, STL); play-by-play
// and the teams table use today's. Joins compare today's codes.
const currentTeam = (col) => `CASE ${col} WHEN 'OAK' THEN 'LV' WHEN 'SD' THEN 'LAC' WHEN 'STL' THEN 'LA' ELSE ${col} END`;

const ADV_FIELDS = ['pass_wpa', 'rush_wpa', 'rec_wpa', 'deep_att', 'deep_epa', 'deep_comp', 'scrambles', 'scramble_epa',
  'charted_dropbacks', 'int_worthy', 'explosive_runs', 'stuffed_runs', 'goal_line_carries', 'goal_line_tds',
  'explosive_catches', 'rz_targets', 'ez_targets', 'yac_tracked', 'xyac', 'xyac_n'];
// Expected fantasy points and touchdowns from ff_opportunity (PPR scoring).
const FFO_FIELDS = ['total_fantasy_points', 'total_fantasy_points_exp', 'total_touchdown', 'total_touchdown_exp'];
// Columns of player_week_ol (offensive linemen): snaps and penalties, plus the line's results
// while the player was on the field. snaps / team_snaps are returned as off_snaps / team_off_snaps.
// ex_* count the plays he was actually on the field for (participation, 2016-2025); on_charted_* and
// on_qb_fault_sacks are FTN's charting (2023 on), credited by snap share.
const OL_FIELDS = ['holding', 'false_starts', 'penalties', 'on_dropbacks', 'on_sacks', 'on_qb_hits', 'on_pass_epa',
  'on_pressures', 'on_pressure_dropbacks', 'on_rushes', 'on_rush_epa', 'on_rush_success', 'on_stuffed', 'on_ybc',
  'on_charted_dropbacks', 'on_charted_sacks', 'on_qb_fault_sacks', 'ex_dropbacks', 'ex_sacks', 'ex_pressure_plays',
  'ex_pressures', 'ex_std_plays', 'ex_std_pressures',
  'on_pfr_carries'];
// Columns of player_week_kicking.
const KICK_FIELDS = ['fg_attempts', 'fg_makes', 'fg_expected', 'fg_50_attempts', 'fg_50_makes'];
// Columns of player_week_def_pbp.
const DEF_PBP_FIELDS = ['tackle_plays', 'stops', 'run_tackles', 'run_stops', 'run_tackle_yards', 'rec_tackles', 'rec_tackle_yards'];
// Zero instead of missing when the player was on the field on defense: the play-by-play and PFR
// tables only have rows for players who recorded something (PFR's defensive data starts in 2018).
const ON_DEFENSE = 'CASE WHEN sc.defense_snaps > 0 THEN 0 END';
const PFR_FIRST_SEASON = 2018;
const PFR_DEF_COUNTS = ['pfr_def_targets', 'pfr_def_completions', 'pfr_def_ints', 'pfr_def_pressures', 'pfr_def_hurries',
  'pfr_def_blitzes', 'pfr_def_missed', 'pfr_def_tackles'];
const pfrColumn = (f) => f.split(' AS ')[0];
const pfrAlias = (f) => f.split(' AS ')[1];

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
      SUM(w.passing_yards_after_catch)::FLOAT AS passing_yac,
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
      SUM(w.fantasy_points_ppr)::FLOAT AS fantasy_points_ppr,
      SUM(w.fg_made)::FLOAT AS fg_made, SUM(w.fg_att)::FLOAT AS fg_att, MAX(w.fg_long)::FLOAT AS fg_long,
      SUM(w.pat_made)::FLOAT AS pat_made, SUM(w.pat_att)::FLOAT AS pat_att
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
  kicking AS (
    SELECT player_id, ${KICK_FIELDS.map((f) => `SUM(${f})::FLOAT AS ${f}`).join(', ')}
    FROM player_week_kicking
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN $2 AND $3
    GROUP BY player_id
  ),
  -- Expected fantasy points (ffverse's ffopportunity model; season is stored as text there).
  ffo AS (
    SELECT player_id, ${FFO_FIELDS.map((f) => `SUM(${f})::FLOAT AS ${f}`).join(', ')}
    FROM ff_opportunity
    WHERE season = $1::TEXT AND week BETWEEN $2 AND $3
    GROUP BY player_id
  ),
  adv AS (
    SELECT player_id, ${ADV_FIELDS.map((f) => `SUM(${f})::FLOAT AS ${f}`).join(', ')}
    FROM player_week_adv
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN $2 AND $3
    GROUP BY player_id
  ),
  ngs_pass AS (
    SELECT player_gsis_id AS player_id,
      SUM(avg_time_to_throw * attempts) / NULLIF(SUM(attempts), 0) AS time_to_throw,
      SUM(aggressiveness * attempts) / NULLIF(SUM(attempts), 0) AS aggressiveness,
      SUM(avg_intended_air_yards * attempts) / NULLIF(SUM(attempts), 0) AS intended_air_yards,
      SUM(avg_air_yards_to_sticks * attempts) / NULLIF(SUM(attempts), 0) AS air_yards_to_sticks,
      SUM(expected_completion_percentage * attempts) / NULLIF(SUM(attempts), 0) AS xcomp_pct
    FROM nextgen_stats
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN GREATEST($2, 1) AND $3
    GROUP BY player_gsis_id
  ),
  ngs_rush AS (
    SELECT player_gsis_id AS player_id,
      SUM(rush_yards_over_expected)::FLOAT AS ryoe, SUM(rush_attempts)::FLOAT AS ngs_rush_attempts,
      SUM(percent_attempts_gte_eight_defenders * rush_attempts) / NULLIF(SUM(rush_attempts), 0) AS stacked_box_pct,
      SUM(rush_pct_over_expected * rush_attempts) / NULLIF(SUM(rush_attempts), 0) AS rush_beat_pct,
      SUM(efficiency * rush_attempts) / NULLIF(SUM(rush_attempts), 0) AS rush_efficiency,
      SUM(avg_time_to_los * rush_attempts) / NULLIF(SUM(rush_attempts), 0) AS time_to_los,
      SUM(expected_rush_yards) / NULLIF(SUM(rush_attempts), 0) AS expected_ypc
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
  ,
  pfr_pass AS (
    SELECT pl.gsis_id AS player_id, ${PFR_FIELDS.pass.map((f) => `SUM(t.${pfrColumn(f)})::FLOAT AS ${pfrAlias(f)}`).join(', ')}
    FROM pfr_advstats_pass t JOIN public.players pl ON pl.pfr_id = t.pfr_player_id
    WHERE t.season = $1 AND t.game_type = 'REG' AND t.week BETWEEN $2 AND $3
    GROUP BY pl.gsis_id
  )
  ,
  pfr_rush AS (
    SELECT pl.gsis_id AS player_id, ${PFR_FIELDS.rush.map((f) => `SUM(t.${pfrColumn(f)})::FLOAT AS ${pfrAlias(f)}`).join(', ')}
    FROM pfr_advstats_rush t JOIN public.players pl ON pl.pfr_id = t.pfr_player_id
    WHERE t.season = $1 AND t.game_type = 'REG' AND t.week BETWEEN $2 AND $3
    GROUP BY pl.gsis_id
  )
  ,
  pfr_rec AS (
    SELECT pl.gsis_id AS player_id, ${PFR_FIELDS.rec.map((f) => `SUM(t.${pfrColumn(f)})::FLOAT AS ${pfrAlias(f)}`).join(', ')}
    FROM pfr_advstats_rec t JOIN public.players pl ON pl.pfr_id = t.pfr_player_id
    WHERE t.season = $1 AND t.game_type = 'REG' AND t.week BETWEEN $2 AND $3
    GROUP BY pl.gsis_id
  )
  ,
  pfr_def AS (
    SELECT pl.gsis_id AS player_id, ${PFR_FIELDS.def.map((f) => `SUM(t.${pfrColumn(f)})::FLOAT AS ${pfrAlias(f)}`).join(', ')}
    FROM pfr_advstats_def t JOIN public.players pl ON pl.pfr_id = t.pfr_player_id
    WHERE t.season = $1 AND t.game_type = 'REG' AND t.week BETWEEN $2 AND $3
    GROUP BY pl.gsis_id
  )
  SELECT p.*, pbp.dropbacks, pbp.dropback_epa, pbp.dropback_success, pbp.cpoe_sum, pbp.cpoe_n,
         pbp.pbp_carries, pbp.pbp_rush_epa, pbp.rush_success, pbp.pbp_targets, pbp.target_epa,
         pbp.target_success, np.time_to_throw, np.aggressiveness, np.intended_air_yards,
         np.air_yards_to_sticks, np.xcomp_pct,
         nr.ryoe, nr.ngs_rush_attempts, nr.stacked_box_pct, nr.rush_beat_pct, nr.rush_efficiency, nr.time_to_los,
         nr.expected_ypc,
         nc.separation, nc.cushion, nc.yac_over_expected,
         ${ADV_FIELDS.map((f) => `adv.${f}`).join(', ')},
         ${FFO_FIELDS.map((f) => `ffo.${f}`).join(', ')},
         ${KICK_FIELDS.map((f) => `kicking.${f}`).join(', ')},
         ${PFR_KINDS.map((k) => PFR_FIELDS[k].map((f) => `pfr_${k}.${pfrAlias(f)}`).join(', ')).join(',\n         ')}
  FROM players p
  LEFT JOIN pbp ON pbp.player_id = p.player_id
  LEFT JOIN adv ON adv.player_id = p.player_id
  LEFT JOIN ffo ON ffo.player_id = p.player_id
  LEFT JOIN kicking ON kicking.player_id = p.player_id
  LEFT JOIN ngs_pass np ON np.player_id = p.player_id
  LEFT JOIN ngs_rush nr ON nr.player_id = p.player_id
  LEFT JOIN ngs_rec nc ON nc.player_id = p.player_id
  ${PFR_KINDS.map((k) => `LEFT JOIN pfr_${k} ON pfr_${k}.player_id = p.player_id`).join('\n  ')}
  WHERE p.position = ANY($4)
`;

// Defenders: box-score defense, snap counts, play-by-play tackles and PFR pressure/coverage stats.
// Snap counts are keyed by PFR id; team_def_snaps (snaps / snap share) lets the client compute a
// snap share over any range.
const DEFENSE_LEADERBOARD_SQL = `
  WITH weeks AS (
    SELECT * FROM player_stats
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN $2 AND $3
  ),
  -- Games with a stat row, plus games the player was on the field without recording a stat.
  appearances AS (
    SELECT player_id, week, team, position, player_display_name AS name, headshot_url AS headshot FROM weeks
    UNION ALL
    SELECT pl.gsis_id, sc.week, sc.team, sc.position, pl.display_name, pl.headshot
    FROM snap_counts sc JOIN public.players pl ON pl.pfr_id = sc.pfr_player_id
    WHERE sc.season = $1 AND sc.game_type = 'REG' AND sc.week BETWEEN $2 AND $3 AND sc.defense_snaps > 0
      AND NOT EXISTS (SELECT 1 FROM weeks x WHERE x.player_id = pl.gsis_id AND x.week = sc.week)
  ),
  players AS (
    SELECT
      a.player_id,
      (ARRAY_AGG(a.name ORDER BY a.week DESC))[1] AS name,
      (ARRAY_AGG(a.team ORDER BY a.week DESC))[1] AS team,
      (ARRAY_AGG(a.position ORDER BY a.week DESC))[1] AS position,
      (ARRAY_AGG(a.headshot ORDER BY a.week DESC))[1] AS headshot,
      COUNT(*)::INT AS games,
      ${DEF_BOX_SUMS}
    FROM appearances a
    LEFT JOIN weeks w ON w.player_id = a.player_id AND w.week = a.week
    GROUP BY a.player_id
  ),
  snaps AS (
    SELECT pl.gsis_id AS player_id, SUM(sc.defense_snaps)::FLOAT AS def_snaps,
           SUM(ROUND(sc.defense_snaps / NULLIF(sc.defense_pct, 0)))::FLOAT AS team_def_snaps
    FROM snap_counts sc JOIN public.players pl ON pl.pfr_id = sc.pfr_player_id
    WHERE sc.season = $1 AND sc.game_type = 'REG' AND sc.week BETWEEN $2 AND $3 AND sc.defense_snaps > 0
    GROUP BY pl.gsis_id
  ),
  dpbp AS (
    SELECT player_id, ${DEF_PBP_FIELDS.map((f) => `SUM(${f})::FLOAT AS ${f}`).join(', ')}
    FROM player_week_def_pbp
    WHERE season = $1 AND season_type = 'REG' AND week BETWEEN $2 AND $3
    GROUP BY player_id
  ),
  pfr_def AS (
    SELECT pl.gsis_id AS player_id, ${PFR_FIELDS.def.map((f) => `SUM(t.${pfrColumn(f)})::FLOAT AS ${pfrAlias(f)}`).join(', ')}
    FROM pfr_advstats_def t JOIN public.players pl ON pl.pfr_id = t.pfr_player_id
    WHERE t.season = $1 AND t.game_type = 'REG' AND t.week BETWEEN $2 AND $3
    GROUP BY pl.gsis_id
  )
  SELECT p.*, snaps.def_snaps, snaps.team_def_snaps,
         ${DEF_PBP_FIELDS.map((f) => `COALESCE(dpbp.${f}, CASE WHEN snaps.def_snaps > 0 THEN 0 END) AS ${f}`).join(', ')},
         ${PFR_FIELDS.def.map((f) => (PFR_DEF_COUNTS.includes(pfrAlias(f))
    ? `COALESCE(pfr_def.${pfrAlias(f)}, CASE WHEN snaps.def_snaps > 0 AND $1 >= ${PFR_FIRST_SEASON} THEN 0 END) AS ${pfrAlias(f)}`
    : `pfr_def.${pfrAlias(f)}`)).join(', ')}
  FROM players p
  LEFT JOIN snaps ON snaps.player_id = p.player_id
  LEFT JOIN dpbp ON dpbp.player_id = p.player_id
  LEFT JOIN pfr_def ON pfr_def.player_id = p.player_id
  WHERE p.position = ANY($4)
`;

// Offensive linemen have no box-score rows: everything comes from player_week_ol.
const LINE_LEADERBOARD_SQL = `
  SELECT o.player_id,
         pl.display_name AS name, pl.headshot,
         (ARRAY_AGG(o.team ORDER BY o.week DESC))[1] AS team,
         (ARRAY_AGG(o.position ORDER BY o.week DESC))[1] AS position,
         COUNT(*)::INT AS games,
         SUM(o.snaps)::FLOAT AS off_snaps, SUM(o.team_snaps)::FLOAT AS team_off_snaps,
         ${OL_FIELDS.map((f) => `SUM(o.${f})::FLOAT AS ${f}`).join(', ')}
  FROM player_week_ol o
  JOIN public.players pl ON pl.gsis_id = o.player_id
  WHERE o.season = $1 AND o.game_type = 'REG' AND o.week BETWEEN $2 AND $3
  GROUP BY o.player_id, pl.display_name, pl.headshot
`;

router.get('/leaderboard/:pos', handle(async (req, res) => {
  const pos = String(req.params.pos).toUpperCase();
  const defense = DEFENSE_FILTER[pos];
  const line = pos === 'OL';
  if (!POSITION_FILTER[pos] && !defense && !line) return res.status(400).json({ error: 'Unknown position' });
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  const [{ max_week: maxWeek }] = await query(
    `SELECT COALESCE(MAX(week), 0)::INT AS max_week FROM player_stats WHERE season = $1 AND season_type = 'REG'`,
    season,
  );
  const from = Math.max(1, intParam(req.query.from, 1));
  const to = Math.min(maxWeek || 18, intParam(req.query.to, maxWeek || 18));
  const rows = line
    ? await query(LINE_LEADERBOARD_SQL, season, from, to)
    : defense
      ? await query(DEFENSE_LEADERBOARD_SQL, season, from, to, defense)
      : await query(LEADERBOARD_SQL, season, from, to, POSITION_FILTER[pos]);
  res.json({ season, position: pos, from, to, maxWeek, players: rows });
}));

// ---------------------------------------------------------------------------------------------
// Player page
// ---------------------------------------------------------------------------------------------

// Games come from the weekly stats plus snap counts: nflverse writes a stat row only when a player
// records a stat, so a defender who plays without one (no tackle, no pass breakup) would otherwise
// have no game at all.
const PLAYER_GAMES_SQL = `
  WITH appearances AS (
    SELECT season, week, season_type, team, opponent_team AS opponent, position
    FROM player_stats WHERE player_id = $1
    UNION ALL
    SELECT sc.season, sc.week, CASE WHEN sc.game_type = 'REG' THEN 'REG' ELSE 'POST' END, sc.team, sc.opponent, sc.position
    FROM snap_counts sc JOIN players p ON p.pfr_id = sc.pfr_player_id
    WHERE p.gsis_id = $1 AND (sc.offense_snaps > 0 OR sc.defense_snaps > 0)
      AND NOT EXISTS (SELECT 1 FROM player_stats x WHERE x.player_id = $1 AND x.season = sc.season AND x.week = sc.week)
  )
  SELECT
    g.season::INT AS season, g.week::INT AS week, g.season_type,
    ${currentTeam('g.team')} AS team, ${currentTeam('g.opponent')} AS opponent, g.position,
    ps.completions::FLOAT AS completions, ps.attempts::FLOAT AS attempts,
    ps.passing_yards::FLOAT AS passing_yards, ps.passing_tds::FLOAT AS passing_tds,
    ps.passing_interceptions::FLOAT AS interceptions, ps.sacks_suffered::FLOAT AS sacks,
    ps.sack_yards_lost::FLOAT AS sack_yards, ps.passing_epa::FLOAT AS passing_epa,
    ps.passing_cpoe::FLOAT AS passing_cpoe, ps.passing_air_yards::FLOAT AS passing_air_yards,
    ps.passing_yards_after_catch::FLOAT AS passing_yac, ps.passing_first_downs::FLOAT AS passing_first_downs,
    ps.rushing_first_downs::FLOAT AS rushing_first_downs, ps.receiving_first_downs::FLOAT AS receiving_first_downs,
    ${ADV_FIELDS.map((f) => `pa.${f}::FLOAT AS ${f}`).join(', ')},
    ${FFO_FIELDS.map((f) => `fo.${f}::FLOAT AS ${f}`).join(', ')},
    ${KICK_FIELDS.map((f) => `pk.${f}::FLOAT AS ${f}`).join(', ')},
    ol.snaps::FLOAT AS off_snaps, ol.team_snaps::FLOAT AS team_off_snaps,
    ${OL_FIELDS.map((f) => `ol.${f}::FLOAT AS ${f}`).join(', ')},
    ps.carries::FLOAT AS carries, ps.rushing_yards::FLOAT AS rushing_yards,
    ps.rushing_tds::FLOAT AS rushing_tds, ps.rushing_epa::FLOAT AS rushing_epa,
    ps.targets::FLOAT AS targets, ps.receptions::FLOAT AS receptions,
    ps.receiving_yards::FLOAT AS receiving_yards, ps.receiving_tds::FLOAT AS receiving_tds,
    ps.receiving_epa::FLOAT AS receiving_epa, ps.receiving_air_yards::FLOAT AS receiving_air_yards,
    ps.receiving_yards_after_catch::FLOAT AS receiving_yac, ps.target_share::FLOAT AS target_share,
    ps.wopr::FLOAT AS wopr, ps.fantasy_points_ppr::FLOAT AS fantasy_points_ppr,
    (COALESCE(ps.rushing_fumbles_lost, 0) + COALESCE(ps.receiving_fumbles_lost, 0) + COALESCE(ps.sack_fumbles_lost, 0))::FLOAT AS fumbles_lost,
    COALESCE(ps.def_tackles_solo, 0)::FLOAT AS def_tackles_solo, COALESCE(ps.def_tackle_assists, 0)::FLOAT AS def_tackle_assists,
    COALESCE(ps.def_tackles_for_loss, 0)::FLOAT AS def_tackles_for_loss, COALESCE(ps.def_sacks, 0)::FLOAT AS def_sacks,
    COALESCE(ps.def_qb_hits, 0)::FLOAT AS def_qb_hits, COALESCE(ps.def_interceptions, 0)::FLOAT AS def_interceptions,
    COALESCE(ps.def_pass_defended, 0)::FLOAT AS def_pass_defended, COALESCE(ps.def_fumbles_forced, 0)::FLOAT AS def_fumbles_forced,
    COALESCE(ps.def_tds, 0)::FLOAT AS def_tds, COALESCE(ps.def_interception_yards, 0)::FLOAT AS def_interception_yards,
    COALESCE(ps.def_fumbles, 0)::FLOAT AS def_fumbles, COALESCE(ps.def_safeties, 0)::FLOAT AS def_safeties,
    sc.defense_snaps::FLOAT AS def_snaps,
    ROUND(sc.defense_snaps / NULLIF(sc.defense_pct, 0))::FLOAT AS team_def_snaps,
    ${DEF_PBP_FIELDS.map((f) => `COALESCE(dw.${f}, ${ON_DEFENSE})::FLOAT AS ${f}`).join(', ')},
    ps.fg_made::FLOAT AS fg_made, ps.fg_att::FLOAT AS fg_att, ps.fg_long::FLOAT AS fg_long,
    ps.pat_made::FLOAT AS pat_made, ps.pat_att::FLOAT AS pat_att,
    pw.dropbacks::FLOAT AS dropbacks, pw.dropback_epa, pw.dropback_success, pw.cpoe_sum,
    pw.cpoe_n::FLOAT AS cpoe_n, pw.carries::FLOAT AS pbp_carries, pw.rush_epa AS pbp_rush_epa,
    pw.rush_success, pw.targets::FLOAT AS pbp_targets, pw.target_epa, pw.target_success,
    s.game_id, ${currentTeam('s.home_team')} AS home_team, ${currentTeam('s.away_team')} AS away_team,
    s.home_score::FLOAT AS home_score,
    s.away_score::FLOAT AS away_score, s.gameday, s.roof, s.game_type,
    ${PFR_KINDS.map((k) => PFR_FIELDS[k].map((f) => (k === 'def' && PFR_DEF_COUNTS.includes(pfrAlias(f))
    ? `COALESCE(pfr_def.${pfrColumn(f)}, CASE WHEN g.season >= ${PFR_FIRST_SEASON} THEN ${ON_DEFENSE} END)::FLOAT AS ${pfrAlias(f)}`
    : `pfr_${k}.${pfrColumn(f)}::FLOAT AS ${pfrAlias(f)}`)).join(', ')).join(',\n    ')}
  FROM appearances g
  LEFT JOIN player_stats ps ON ps.player_id = $1 AND ps.season = g.season AND ps.week = g.week
  LEFT JOIN player_week_pbp pw
    ON pw.player_id = $1 AND pw.season = g.season AND pw.week = g.week
  LEFT JOIN player_week_adv pa
    ON pa.player_id = $1 AND pa.season = g.season AND pa.week = g.week
  LEFT JOIN player_week_kicking pk ON pk.player_id = $1 AND pk.season = g.season AND pk.week = g.week
  LEFT JOIN player_week_ol ol ON ol.player_id = $1 AND ol.season = g.season AND ol.week = g.week
  LEFT JOIN schedules s
    ON s.season = g.season AND s.week = g.week
       AND ${currentTeam('g.team')} IN (${currentTeam('s.home_team')}, ${currentTeam('s.away_team')})
  LEFT JOIN players pl ON pl.gsis_id = $1
  LEFT JOIN ff_opportunity fo ON fo.player_id = $1 AND fo.game_id = s.game_id
  LEFT JOIN player_week_def_pbp dw
    ON dw.player_id = $1 AND dw.season = g.season AND dw.week = g.week
  LEFT JOIN snap_counts sc ON sc.game_id = s.game_id AND sc.pfr_player_id = pl.pfr_id AND sc.defense_snaps > 0
  ${PFR_KINDS.map((k) => `LEFT JOIN pfr_advstats_${k} pfr_${k} ON pfr_${k}.game_id = s.game_id AND pfr_${k}.pfr_player_id = pl.pfr_id`).join('\n  ')}
  ORDER BY g.season, g.week
`;

const PLAYER_NGS_SQL = `
  SELECT 'passing' AS kind, season::INT AS season, week::INT AS week,
         avg_time_to_throw AS time_to_throw, aggressiveness, avg_intended_air_yards AS intended_air_yards,
         avg_completed_air_yards AS completed_air_yards,
         completion_percentage_above_expectation AS cpoe_ngs, attempts::FLOAT AS volume,
         avg_air_yards_to_sticks AS air_yards_to_sticks, expected_completion_percentage AS xcomp_pct,
         max_completed_air_distance AS max_completed_air,
         NULL::FLOAT AS ryoe, NULL::FLOAT AS ryoe_per_att, NULL::FLOAT AS stacked_box_pct,
         NULL::FLOAT AS rush_beat_pct, NULL::FLOAT AS rush_efficiency, NULL::FLOAT AS time_to_los,
         NULL::FLOAT AS expected_ypc,
         NULL::FLOAT AS separation, NULL::FLOAT AS cushion, NULL::FLOAT AS yac_over_expected
  FROM nextgen_stats WHERE player_gsis_id = $1
  UNION ALL
  SELECT 'rushing', season::INT, week::INT, NULL, NULL, NULL, NULL, NULL, rush_attempts::FLOAT,
         NULL, NULL, NULL,
         rush_yards_over_expected, rush_yards_over_expected_per_att, percent_attempts_gte_eight_defenders,
         rush_pct_over_expected, efficiency, avg_time_to_los, expected_rush_yards / NULLIF(rush_attempts, 0),
         NULL, NULL, NULL
  FROM nextgen_rushing WHERE player_gsis_id = $1
  UNION ALL
  SELECT 'receiving', season::INT, week::INT, NULL, NULL, avg_intended_air_yards, NULL, NULL,
         targets::FLOAT, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         avg_separation, avg_cushion, avg_yac_above_expectation
  FROM nextgen_receiving WHERE player_gsis_id = $1
  ORDER BY 2, 3
`;

router.get('/players/:id/page', handle(async (req, res) => {
  const id = req.params.id;
  const [players, games, ngs, contracts, injuries, depth] = await Promise.all([
    query(`SELECT gsis_id, display_name, first_name, last_name, position, position_group, latest_team,
                  jersey_number, height::FLOAT AS height, weight::FLOAT AS weight, college_name, headshot,
                  birth_date, years_of_experience, rookie_season, draft_year, draft_round, draft_pick,
                  draft_team, status, pfr_id, otc_id
           FROM players WHERE gsis_id = $1`, id),
    query(PLAYER_GAMES_SQL, id),
    query(PLAYER_NGS_SQL, id),
    query(`SELECT c.year_signed::INT AS year_signed, c.years::INT AS years, c.value, c.apy, c.guaranteed,
                  c.apy_cap_pct, c.team, c.is_active, c.season_history
           FROM contracts c
           WHERE c.gsis_id = $1
              OR c.otc_id = (SELECT otc_id FROM players WHERE gsis_id = $1 AND otc_id IS NOT NULL LIMIT 1)
           ORDER BY c.is_active DESC NULLS LAST, c.year_signed DESC NULLS LAST, c.value DESC NULLS LAST`, id),
    // Latest injury report entry (each week's report covers that week's game).
    query(`SELECT season::INT AS season, week::INT AS week, game_type, team, report_status, report_primary_injury,
                  practice_status, practice_primary_injury
           FROM injuries WHERE gsis_id = $1
           ORDER BY season DESC, week DESC LIMIT 1`, id),
    query(`SELECT team, pos_abb, pos_name, pos_rank, dt, source FROM depth_chart
           WHERE gsis_id = $1 ORDER BY pos_rank, pos_slot`, id),
  ]);
  if (!players.length) return res.status(404).json({ error: 'Player not found' });
  res.json({ player: players[0], games, ngs, contracts, injury: injuries[0] || null, depth });
}));

// FTN charting splits (2022+): play-action, blitzes, pocket, box counts, catchable/contested targets.
const CHARTED_PLAYS = `
  FROM pbp p
  JOIN ftn_charting f ON f.nflverse_game_id = p.game_id AND f.nflverse_play_id = p.play_id`;
const SPLIT_SUMS = `
  COUNT(*)::INT AS plays, SUM(p.epa) AS epa, SUM(p.success) AS success,
  SUM(COALESCE(p.complete_pass, 0))::FLOAT AS completions,
  SUM(CASE WHEN p.pass_attempt = 1 AND COALESCE(p.sack, 0) = 0 THEN 1 ELSE 0 END)::FLOAT AS attempts,
  SUM(COALESCE(p.yards_gained, 0))::FLOAT AS yards, SUM(COALESCE(p.sack, 0))::FLOAT AS sacks,
  SUM(COALESCE(p.interception, 0))::FLOAT AS interceptions`;

router.get('/players/:id/charting', handle(async (req, res) => {
  const id = req.params.id;
  const seasons = await query(`
    SELECT DISTINCT p.season::INT AS season ${CHARTED_PLAYS}
    WHERE p.passer_player_id = $1 OR p.receiver_player_id = $1 OR p.rusher_player_id = $1
    ORDER BY 1 DESC`, id);
  if (!seasons.length) return res.json({ seasons: [], season: null, passing: [], receiving: null, rushing: [] });
  const season = intParam(req.query.season, seasons[0].season);
  const where = `WHERE p.season = $2 AND p.season_type = 'REG' AND p.epa IS NOT NULL`;
  const [passing, receiving, rushing] = await Promise.all([
    query(`
      SELECT s.split, s.ord, ${SPLIT_SUMS},
             SUM(CASE WHEN f.is_interception_worthy THEN 1 ELSE 0 END)::FLOAT AS int_worthy,
             SUM(CASE WHEN f.is_throw_away THEN 1 ELSE 0 END)::FLOAT AS throwaways
      ${CHARTED_PLAYS}
      CROSS JOIN LATERAL (VALUES
        ('All dropbacks', 0, TRUE),
        ('Play-action', 1, f.is_play_action), ('No play-action', 2, NOT f.is_play_action),
        ('Blitzed', 3, f.n_blitzers > 0), ('Not blitzed', 4, f.n_blitzers = 0),
        ('In pocket', 5, NOT f.is_qb_out_of_pocket), ('Out of pocket', 6, f.is_qb_out_of_pocket),
        ('Screens', 7, f.is_screen_pass), ('RPO', 8, f.is_rpo)
      ) AS s(split, ord, included)
      ${where} AND p.passer_player_id = $1 AND p.qb_dropback = 1 AND s.included
      GROUP BY s.split, s.ord ORDER BY s.ord`, id, season),
    query(`
      SELECT
        COUNT(*)::INT AS targets,
        SUM(COALESCE(p.complete_pass, 0))::FLOAT AS receptions,
        SUM(CASE WHEN f.is_catchable_ball THEN 1 ELSE 0 END)::FLOAT AS catchable,
        SUM(CASE WHEN f.is_catchable_ball AND p.complete_pass = 1 THEN 1 ELSE 0 END)::FLOAT AS catchable_caught,
        SUM(CASE WHEN f.is_contested_ball THEN 1 ELSE 0 END)::FLOAT AS contested,
        SUM(CASE WHEN f.is_contested_ball AND p.complete_pass = 1 THEN 1 ELSE 0 END)::FLOAT AS contested_caught,
        SUM(CASE WHEN f.is_drop THEN 1 ELSE 0 END)::FLOAT AS drops,
        SUM(CASE WHEN f.is_created_reception THEN 1 ELSE 0 END)::FLOAT AS created,
        SUM(CASE WHEN f.is_play_action THEN 1 ELSE 0 END)::FLOAT AS play_action_targets,
        SUM(CASE WHEN f.is_screen_pass THEN 1 ELSE 0 END)::FLOAT AS screen_targets,
        SUM(p.epa) AS epa
      ${CHARTED_PLAYS}
      ${where} AND p.receiver_player_id = $1 AND p.pass_attempt = 1 AND COALESCE(p.sack, 0) = 0`, id, season),
    query(`
      SELECT s.split, s.ord, ${SPLIT_SUMS}
      ${CHARTED_PLAYS}
      CROSS JOIN LATERAL (VALUES
        ('All carries', 0, TRUE),
        ('Light box (6 or fewer)', 1, f.n_defense_box <= 6), ('7 in the box', 2, f.n_defense_box = 7),
        ('Stacked box (8+)', 3, f.n_defense_box >= 8)
      ) AS s(split, ord, included)
      ${where} AND p.rusher_player_id = $1 AND p.rush_attempt = 1 AND COALESCE(p.qb_scramble, 0) = 0 AND s.included
      GROUP BY s.split, s.ord ORDER BY s.ord`, id, season),
  ]);
  res.json({
    seasons: seasons.map((r) => r.season),
    season,
    passing,
    receiving: receiving[0]?.targets ? receiving[0] : null,
    rushing,
  });
}));

// Situational splits from play-by-play (every season): how a player did by down, field position,
// clock and score. One table per role; RBs also get carries by run direction.
const SITUATIONS_SQL = `
  CROSS JOIN LATERAL (VALUES
    ('All plays', 0, TRUE),
    ('1st & 2nd down', 1, p.down <= 2),
    ('3rd & 4th down', 2, p.down >= 3),
    ('3rd & 7 or more', 3, p.down = 3 AND p.ydstogo >= 7),
    ('Red zone', 4, p.yardline_100 <= 20),
    ('Two-minute drill', 5, p.half_seconds_remaining <= 120),
    ('Trailing', 6, p.score_differential < 0),
    ('Tied or leading', 7, p.score_differential >= 0)
  ) AS s(split, ord, included)`;
const SITUATION_SUMS = `
  COUNT(*)::INT AS plays, SUM(p.epa) AS epa, SUM(p.success) AS success,
  SUM(COALESCE(p.yards_gained, 0))::FLOAT AS yards,
  -- First down or touchdown, counted once per play.
  SUM(CASE WHEN p.first_down = 1 OR p.pass_touchdown = 1 OR p.rush_touchdown = 1 THEN 1 ELSE 0 END)::FLOAT AS first_downs,
  -- Offensive touchdowns only (a pick-six also sets the touchdown flag).
  SUM(COALESCE(p.pass_touchdown, 0) + COALESCE(p.rush_touchdown, 0))::FLOAT AS touchdowns,
  SUM(COALESCE(p.complete_pass, 0))::FLOAT AS completions,
  SUM(CASE WHEN p.pass_attempt = 1 AND COALESCE(p.sack, 0) = 0 THEN 1 ELSE 0 END)::FLOAT AS attempts,
  SUM(COALESCE(p.interception, 0))::FLOAT AS interceptions, SUM(COALESCE(p.sack, 0))::FLOAT AS sacks`;

router.get('/players/:id/situations', handle(async (req, res) => {
  const id = req.params.id;
  const season = intParam(req.query.season, null);
  if (!season) return res.status(400).json({ error: 'season is required' });
  const where = `WHERE p.season = $2 AND p.season_type = 'REG' AND p.epa IS NOT NULL AND (p.pass = 1 OR p.rush = 1)
                 AND COALESCE(p.two_point_attempt, 0) = 0 AND s.included`;
  const [passing, rushing, receiving, directions] = await Promise.all([
    query(`SELECT s.split, s.ord, ${SITUATION_SUMS} FROM pbp p ${SITUATIONS_SQL}
           ${where} AND p.passer_player_id = $1 AND p.qb_dropback = 1
           GROUP BY s.split, s.ord ORDER BY s.ord`, id, season),
    query(`SELECT s.split, s.ord, ${SITUATION_SUMS} FROM pbp p ${SITUATIONS_SQL}
           ${where} AND p.rusher_player_id = $1 AND p.rush_attempt = 1 AND COALESCE(p.qb_scramble, 0) = 0
           GROUP BY s.split, s.ord ORDER BY s.ord`, id, season),
    query(`SELECT s.split, s.ord, ${SITUATION_SUMS} FROM pbp p ${SITUATIONS_SQL}
           ${where} AND p.receiver_player_id = $1 AND p.pass_attempt = 1 AND COALESCE(p.sack, 0) = 0
           GROUP BY s.split, s.ord ORDER BY s.ord`, id, season),
    query(`
      SELECT CASE WHEN p.run_location = 'middle' THEN 'Up the middle'
                  ELSE INITCAP(p.run_location) || ' ' || p.run_gap END AS split,
             CASE p.run_location || '-' || COALESCE(p.run_gap, '')
               WHEN 'left-end' THEN 1 WHEN 'left-tackle' THEN 2 WHEN 'left-guard' THEN 3 WHEN 'middle-' THEN 4
               WHEN 'right-guard' THEN 5 WHEN 'right-tackle' THEN 6 WHEN 'right-end' THEN 7 END AS ord,
             ${SITUATION_SUMS}
      FROM pbp p
      WHERE p.season = $2 AND p.season_type = 'REG' AND p.epa IS NOT NULL AND p.rush_attempt = 1
        AND COALESCE(p.qb_scramble, 0) = 0 AND COALESCE(p.two_point_attempt, 0) = 0 AND p.rusher_player_id = $1
        AND (p.run_location = 'middle' OR p.run_gap IS NOT NULL)
      GROUP BY 1, 2 ORDER BY 2`, id, season),
  ]);
  res.json({ season, passing, rushing, receiving, directions });
}));

// ---------------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------------

const SITUATIONS = ['all', 'early_downs', 'late_downs', 'red_zone', 'neutral'];

// Columns of team_game_adv, summed over a season.
const TEAM_ADV_FIELDS = ['plays', 'explosive', 'rushes', 'stuffed', 'neutral_plays', 'neutral_passes', 'neutral_xpass',
  'neutral_early', 'neutral_early_passes', 'shotgun', 'no_huddle', 'charted_plays', 'motion', 'charted_dropbacks',
  'play_action', 'blitzes', 'int_worthy', 'interceptions', 'fumbles', 'fumbles_lost', 'fourth_downs', 'fourth_go',
  'fourth_conv', 'fourth_short', 'fourth_short_go', 'st_epa', 'st_plays', 'drives', 'drive_points', 'three_and_outs',
  'red_zone_trips', 'red_zone_tds', 'scoring_drives', 'turnover_drives', 'drive_seconds', 'drive_plays'];

// Team Next Gen Stats by side: 'off' sums a team's own players, 'def' its opponents' players.
// Weekly rows only exist for players above the NFL's thresholds (in practice the starting QB, the
// main ball carriers and most targeted receivers), so these describe the main players.
// Next Gen Stats uses today's codes too, except LAR for the Rams.
const NGS_TEAM = `CASE team_abbr WHEN 'LAR' THEN 'LA' ELSE team_abbr END`;
const TEAM_NGS_SQL = `
  WITH games AS (
    SELECT week, ${currentTeam('home_team')} AS team, ${currentTeam('away_team')} AS opp
    FROM schedules WHERE season = $1 AND game_type = 'REG'
    UNION ALL
    SELECT week, ${currentTeam('away_team')}, ${currentTeam('home_team')}
    FROM schedules WHERE season = $1 AND game_type = 'REG'
  ),
  pass AS (
    SELECT ${NGS_TEAM} AS team, week, SUM(attempts)::FLOAT AS att,
           SUM(avg_time_to_throw * attempts) AS ttt, SUM(aggressiveness * attempts) AS agg,
           SUM(avg_air_yards_to_sticks * attempts) AS sticks
    FROM nextgen_stats WHERE season = $1 AND season_type = 'REG' AND week > 0 GROUP BY 1, 2
  ),
  rush AS (
    SELECT ${NGS_TEAM} AS team, week, SUM(rush_attempts)::FLOAT AS carries, SUM(rush_yards_over_expected) AS ryoe,
           SUM(rush_pct_over_expected * rush_attempts) AS beat, SUM(percent_attempts_gte_eight_defenders * rush_attempts) AS box
    FROM nextgen_rushing WHERE season = $1 AND season_type = 'REG' AND week > 0 GROUP BY 1, 2
  ),
  rec AS (
    SELECT ${NGS_TEAM} AS team, week, SUM(targets)::FLOAT AS targets,
           SUM(avg_separation * targets) AS sep, SUM(avg_cushion * targets) AS cushion
    FROM nextgen_receiving WHERE season = $1 AND season_type = 'REG' AND week > 0 GROUP BY 1, 2
  ),
  weekly AS (
    SELECT g.team, g.opp, p.att, p.ttt, p.agg, p.sticks, r.carries, r.ryoe, r.beat, r.box, c.targets, c.sep, c.cushion
    FROM games g
    LEFT JOIN pass p ON p.team = g.team AND p.week = g.week
    LEFT JOIN rush r ON r.team = g.team AND r.week = g.week
    LEFT JOIN rec c ON c.team = g.team AND c.week = g.week
  )
  SELECT side, team, SUM(att) AS att, SUM(ttt) AS ttt, SUM(agg) AS agg, SUM(sticks) AS sticks,
         SUM(carries) AS carries, SUM(ryoe) AS ryoe, SUM(beat) AS beat, SUM(box) AS box,
         SUM(targets) AS targets, SUM(sep) AS sep, SUM(cushion) AS cushion
  FROM (SELECT 'off' AS side, team, att, ttt, agg, sticks, carries, ryoe, beat, box, targets, sep, cushion FROM weekly
        UNION ALL
        SELECT 'def', opp, att, ttt, agg, sticks, carries, ryoe, beat, box, targets, sep, cushion FROM weekly) x
  GROUP BY side, team`;

async function teamSeason(season, situation) {
  const [epa, results, odds, teams, adv, ngs] = await Promise.all([
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
        SELECT ${currentTeam('home_team')} AS team, home_score AS pf, away_score AS pa FROM schedules
        WHERE season = $1 AND game_type = 'REG' AND result IS NOT NULL
        UNION ALL
        SELECT ${currentTeam('away_team')}, away_score, home_score FROM schedules
        WHERE season = $1 AND game_type = 'REG' AND result IS NOT NULL
      ) g
      GROUP BY team`, season),
    query(`SELECT team, playoff_pct, division_pct, top_seed_pct, proj_wins, proj_losses, through_week
           FROM playoff_odds WHERE season = $1`, season),
    query(`SELECT team_abbr AS abbr, team_name AS name, team_nick AS nick, team_conf AS conf,
                  team_division AS division, team_color AS color, team_color2 AS color2,
                  team_logo_espn AS logo
           FROM teams`),
    query(`
      SELECT team, side, ${TEAM_ADV_FIELDS.map((f) => `SUM(${f})::FLOAT AS ${f}`).join(', ')}
      FROM team_game_adv
      WHERE season = $1 AND season_type = 'REG'
      GROUP BY team, side`, season),
    query(TEAM_NGS_SQL, season),
  ]);
  const byTeam = new Map(teams.map((t) => [t.abbr, { ...t, wins: 0, losses: 0, ties: 0, points_for: 0, points_against: 0 }]));
  for (const r of results) if (byTeam.has(r.team)) Object.assign(byTeam.get(r.team), r);
  for (const o of odds) if (byTeam.has(o.team)) byTeam.get(o.team).odds = o;
  for (const e of epa) {
    const t = byTeam.get(e.team);
    if (t) t[e.side === 'off' ? 'offense' : 'defense'] = e;
  }
  // Season totals (all plays, whatever the situation filter) for the advanced team stats.
  for (const a of adv) {
    const t = byTeam.get(a.team);
    if (t) (t.adv ||= {})[a.side] = a;
  }
  for (const n of ngs) {
    const t = byTeam.get(n.team);
    if (t) (t.ngs ||= {})[n.side] = n;
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
  // The depth chart and injury report describe the team now, so past seasons go without them.
  const isCurrent = season === current.season;
  const [teams, games, gameEpa, quarterbacks, leaders, depth, injuries, seasons] = await Promise.all([
    teamSeason(season, 'all'),
    query(`
      SELECT s.game_id, s.week::INT AS week, s.game_type, s.gameday,
             ${currentTeam('s.home_team')} AS home_team, ${currentTeam('s.away_team')} AS away_team,
             s.home_score::FLOAT AS home_score, s.away_score::FLOAT AS away_score,
             gp.home_wp, gp.home_proj, gp.away_proj
      FROM schedules s
      LEFT JOIN game_predictions gp ON gp.game_id = s.game_id
      WHERE s.season = $1 AND $2 IN (${currentTeam('s.home_team')}, ${currentTeam('s.away_team')})
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
               SUM(ps.receiving_tds)::FLOAT AS receiving_tds, SUM(ps.targets)::FLOAT AS targets,
               SUM(COALESCE(ps.def_tackles_solo, 0) + COALESCE(ps.def_tackle_assists, 0))::FLOAT AS tackles,
               SUM(ps.def_tackles_for_loss)::FLOAT AS def_tackles_for_loss, SUM(ps.def_sacks)::FLOAT AS def_sacks,
               SUM(ps.def_qb_hits)::FLOAT AS def_qb_hits, SUM(ps.def_interceptions)::FLOAT AS def_interceptions,
               SUM(ps.def_pass_defended)::FLOAT AS def_pass_defended, SUM(ps.def_fumbles_forced)::FLOAT AS def_fumbles_forced
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
    isCurrent ? query(`SELECT gsis_id, player_name, pos_grp, pos_abb, pos_name, pos_slot, pos_rank, spot, injury_status, dt, source
           FROM depth_chart WHERE team = $1 ORDER BY pos_grp, pos_slot, pos_rank`, abbr) : [],
    !isCurrent ? [] : query(`SELECT i.gsis_id, i.full_name, i.position, i.week::INT AS week, i.report_status, i.report_primary_injury,
                  i.practice_status
           FROM injuries i
           WHERE i.team = $1 AND i.season = $2
             AND i.week = (SELECT MAX(week) FROM injuries WHERE team = $1 AND season = $2)
             AND i.report_status IS NOT NULL
           ORDER BY CASE i.report_status WHEN 'Out' THEN 0 WHEN 'Doubtful' THEN 1 ELSE 2 END, i.full_name`, abbr, season),
    // Seasons with play-by-play for the team (today's codes, so the Raiders' Oakland years are LV's).
    query(`SELECT DISTINCT season::INT AS season FROM team_game_pbp
           WHERE team = $1 AND season_type = 'REG' ORDER BY season DESC`, abbr),
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
    season, current_season: current.season,
    seasons: [...new Set([current.season, ...seasons.map((x) => x.season)])].sort((a, b) => b - a),
    team, teams,
    leaders: {
      passing: top('passing_yards'), rushing: top('rushing_yards'), receiving: top('receiving_yards'),
      tackles: top('tackles'), sacks: top('def_sacks'), interceptions: top('def_interceptions'),
    },
    schedule,
    depth,
    injuries,
  });
}));

// ---------------------------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------------------------

router.get('/games', handle(async (req, res) => {
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  const [weeks, nextWeek] = await Promise.all([
    query(`
      SELECT week::INT AS week, MIN(game_type) AS game_type,
             COUNT(*)::INT AS games, COUNT(result)::INT AS completed
      FROM schedules WHERE season = $1 GROUP BY week ORDER BY week`, season),
    forecastWeek(season),
  ]);
  // Default to the week the win probability model is forecasting, so both pages turn over
  // together; without one (season over), the latest week with a completed game, or week one.
  const latestPlayed = [...weeks].reverse().find((w) => w.completed > 0);
  const week = intParam(req.query.week, nextWeek ?? (latestPlayed ? latestPlayed.week : weeks[0]?.week || 1));
  const games = await query(`
    SELECT s.game_id, s.week::INT AS week, s.game_type, s.gameday, s.gametime,
           ${currentTeam('s.home_team')} AS home_team, ${currentTeam('s.away_team')} AS away_team,
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
             ${currentTeam('s.home_team')} AS home_team, ${currentTeam('s.away_team')} AS away_team,
             s.home_score::FLOAT AS home_score, s.away_score::FLOAT AS away_score,
             gp.home_wp AS pregame_home_wp, gp.home_proj, gp.away_proj
      FROM schedules s LEFT JOIN game_predictions gp ON gp.game_id = s.game_id
      WHERE s.game_id = $1`, gameId),
    query(`
      -- Overtime as negative seconds (time past regulation) so the chart extends to the right.
      SELECT qtr::INT AS qtr,
             CASE WHEN qtr >= 5 THEN -((qtr - 5) * ot.len + ot.len - game_seconds_remaining) ELSE game_seconds_remaining END AS seconds_left,
             home_wp,
             total_home_score::INT AS home_score, total_away_score::INT AS away_score
      FROM pbp CROSS JOIN LATERAL (SELECT CASE WHEN season_type = 'REG' THEN 600 ELSE 900 END AS len) ot
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

// Standout performances of a week: each player-game's score (player_week_standout: EPA for offense,
// expected points taken away for defense) ranked against every game at the same position since
// 2010, so a 99th-percentile tight end game and a 99th-percentile quarterback game rank alike.
const STANDOUT_FIRST_SEASON = 2010;
const STANDOUTS_SQL = `
  WITH ranked AS (
    SELECT *, PERCENT_RANK() OVER (PARTITION BY grp ORDER BY score) AS pct, COUNT(*) OVER (PARTITION BY grp) AS pool
    FROM player_week_standout
  )
  SELECT r.player_id, r.grp, r.score, r.pct, r.pool, pl.display_name AS name, pl.headshot,
         ${currentTeam('ps.team')} AS team, ${currentTeam('ps.opponent_team')} AS opponent, ps.position,
         ps.completions::FLOAT AS completions, ps.attempts::FLOAT AS attempts, ps.passing_yards::FLOAT AS passing_yards,
         ps.passing_tds::FLOAT AS passing_tds, ps.passing_interceptions::FLOAT AS interceptions,
         ps.carries::FLOAT AS carries, ps.rushing_yards::FLOAT AS rushing_yards, ps.rushing_tds::FLOAT AS rushing_tds,
         ps.targets::FLOAT AS targets, ps.receptions::FLOAT AS receptions, ps.receiving_yards::FLOAT AS receiving_yards,
         ps.receiving_tds::FLOAT AS receiving_tds,
         (COALESCE(ps.def_tackles_solo, 0) + COALESCE(ps.def_tackle_assists, 0))::FLOAT AS tackles,
         ps.def_sacks::FLOAT AS sacks, ps.def_interceptions::FLOAT AS def_interceptions,
         ps.def_pass_defended::FLOAT AS passes_defended, ps.def_fumbles_forced::FLOAT AS forced_fumbles,
         ps.def_tackles_for_loss::FLOAT AS tackles_for_loss
  FROM ranked r
  JOIN player_stats ps ON ps.player_id = r.player_id AND ps.season = r.season AND ps.week = r.week AND ps.season_type = 'REG'
  LEFT JOIN players pl ON pl.gsis_id = r.player_id
  WHERE r.season = $1 AND r.week = $2 AND r.score > 0
  ORDER BY r.pct DESC, r.score DESC
  LIMIT 60`;

router.get('/standouts', handle(async (req, res) => {
  const current = await currentSeasonAndWeek();
  const season = intParam(req.query.season, current.season);
  // The requested week if it has a completed regular-season game (nothing for an upcoming week);
  // without one, the latest week that does.
  const requested = intParam(req.query.week, null);
  const [row] = await query(`
    SELECT MAX(week)::INT AS week FROM schedules
    WHERE season = $1 AND game_type = 'REG' AND result IS NOT NULL AND ($2::INT IS NULL OR week = $2)`,
    season, requested);
  if (!row?.week || season < STANDOUT_FIRST_SEASON) return res.json({ season, week: null, players: [] });
  const players = await query(STANDOUTS_SQL, season, row.week);
  res.json({ season, week: row.week, since: STANDOUT_FIRST_SEASON, players });
}));

// "BUF 33" -> yards from the possessing team's goal line (0-100), the drive chart's x axis.
function fieldPosition(spot, team) {
  if (!spot) return null;
  const match = String(spot).trim().match(/^([A-Z]{2,3})?\s*(\d+)$/);
  if (!match) return null;
  const yard = Number(match[2]);
  if (!match[1] || yard === 50) return 50;
  return match[1] === team ? yard : 100 - yard;
}

// Drive chart and play-by-play. fixed_drive numbers drives consistently across both teams.
router.get('/games/:gameId/drives', handle(async (req, res) => {
  const gameId = req.params.gameId;
  const plays = await query(`
    SELECT play_id::FLOAT AS play_id, fixed_drive::INT AS drive, posteam, defteam, qtr::INT AS qtr, "time", down::INT AS down,
           ydstogo::INT AS ydstogo, yrdln, yardline_100::INT AS yardline_100, play_type, "desc" AS description,
           yards_gained::INT AS yards, epa, wpa, home_wp, total_home_score::INT AS home_score,
           total_away_score::INT AS away_score, touchdown::INT AS touchdown, fixed_drive_result AS drive_result,
           drive_start_yard_line AS drive_start, drive_end_yard_line AS drive_end,
           drive_play_count::INT AS drive_plays, drive_time_of_possession AS drive_top,
           drive_first_downs::INT AS drive_first_downs
    FROM pbp
    WHERE game_id = $1 AND COALESCE(play_deleted, 0) = 0
    ORDER BY play_id`, gameId);
  if (!plays.length) return res.json({ drives: [] });
  const drives = [];
  for (const play of plays) {
    if (play.drive == null || !play.posteam) continue;
    let drive = drives[drives.length - 1];
    if (!drive || drive.number !== play.drive) {
      drive = {
        number: play.drive, team: play.posteam, quarter: play.qtr, start_time: play.time,
        start: play.drive_start, end: play.drive_end, result: play.drive_result,
        plays: play.drive_plays, top: play.drive_top, first_downs: play.drive_first_downs,
        from: fieldPosition(play.drive_start, play.posteam), to: fieldPosition(play.drive_end, play.posteam),
        yards: 0, epa: 0, list: [],
      };
      drives.push(drive);
    }
    if (['pass', 'run'].includes(play.play_type)) drive.yards += play.yards || 0;
    if (Number.isFinite(play.epa)) drive.epa += play.epa;
    drive.list.push({
      qtr: play.qtr, time: play.time, down: play.down, ydstogo: play.ydstogo, yrdln: play.yrdln,
      type: play.play_type, description: play.description, epa: play.epa, wpa: play.wpa,
      home_score: play.home_score, away_score: play.away_score,
    });
  }
  res.json({ drives });
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
  const [games, [run], nextWeek] = await Promise.all([
    query(`
      SELECT s.game_id, s.week::INT AS week, s.game_type, s.gameday, s.home_team, s.away_team,
             s.home_score::FLOAT AS home_score, s.away_score::FLOAT AS away_score,
             gp.home_wp, gp.home_proj, gp.away_proj, gp.proj_margin
      FROM schedules s JOIN game_predictions gp ON gp.game_id = s.game_id
      WHERE s.season = $1
      ORDER BY s.week, s.gameday, s.gametime, s.game_id`, season),
    query(`SELECT metrics, created_at FROM model_runs WHERE model = 'game' ORDER BY id DESC LIMIT 1`),
    forecastWeek(season),
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
  res.json({
    season,
    week: nextWeek,
    upcoming: games.filter((g) => g.home_score == null && g.week === nextWeek),
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
    query(`SELECT season, week, player_id, player_name, position, team, opponent, home, game_id, stats,
                  injury_status, depth_rank
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
// Season award races (ingest/award_model.py): the top candidates per award after a week, their
// change since the week before, and the models' backtest.
const AWARDS = [
  ['mvp', 'Most Valuable Player'], ['opoy', 'Offensive Player of the Year'], ['dpoy', 'Defensive Player of the Year'],
  ['oroy', 'Offensive Rookie of the Year'], ['droy', 'Defensive Rookie of the Year'],
  ['cpoy', 'Comeback Player of the Year'], ['poy', 'Protector of the Year'], ['coy', 'Coach of the Year'],
];

router.get('/models/awards', handle(async (req, res) => {
  const [[latest], [model]] = await Promise.all([
    query(`SELECT season, MAX(week)::INT AS week FROM award_predictions
           WHERE season = (SELECT MAX(season) FROM award_predictions) GROUP BY season`),
    query(`SELECT metrics, created_at FROM award_models ORDER BY id DESC LIMIT 1`),
  ]);
  if (!latest) return res.json({ season: null, week: null, weeks: [], awards: [], backtest: null });
  const week = Math.min(intParam(req.query.week, latest.week), latest.week);
  const [rows, previous, weeks] = await Promise.all([
    query(`SELECT award, rank, player_id, name, team, position, probability, stats
           FROM award_predictions WHERE season = $1 AND week = $2 ORDER BY award, rank`, latest.season, week),
    query(`SELECT award, COALESCE(player_id, team) AS key, probability
           FROM award_predictions WHERE season = $1 AND week = $2`, latest.season, week - 1),
    query(`SELECT DISTINCT week::INT AS week FROM award_predictions WHERE season = $1 ORDER BY week`, latest.season),
  ]);
  const before = new Map(previous.map((p) => [`${p.award}|${p.key}`, p.probability]));
  const metrics = model?.metrics || {};
  res.json({
    season: latest.season,
    week,
    weeks: weeks.map((w) => w.week),
    awards: AWARDS.map(([key, label]) => ({
      key,
      label,
      backtest: metrics[key] || null,
      candidates: rows.filter((r) => r.award === key).map((r) => {
        const prior = before.get(`${key}|${r.player_id || r.team}`);
        return { ...r, change: week > 1 ? r.probability - (prior ?? 0) : null };
      }),
    })),
    calibration: metrics.calibration_bands || null,
    trained_through: metrics.trained_through ?? null,
    trained_at: model?.created_at ?? null,
  });
}));

router.get('/models/regression-lab', handle(async (req, res) => {
  const [epa, results, anya] = await Promise.all([
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
        SELECT season, week, ${currentTeam('home_team')} AS team, home_score AS pf, away_score AS pa FROM schedules
        WHERE game_type = 'REG' AND result IS NOT NULL AND season >= 2006
        UNION ALL
        SELECT season, week, ${currentTeam('away_team')}, away_score, home_score FROM schedules
        WHERE game_type = 'REG' AND result IS NOT NULL AND season >= 2006
      ) g
      GROUP BY 1, 2, 3`),
    // Adjusted net yards per attempt, gained and allowed: (yards + 20 x TD - 45 x INT, with sack
    // yards counted) per dropback, scrambles excluded.
    query(`
      WITH d AS (
        SELECT season::INT AS season, posteam, defteam, CASE WHEN week <= 9 THEN 1 ELSE 2 END AS half,
               COALESCE(yards_gained, 0) + 20 * COALESCE(pass_touchdown, 0) - 45 * COALESCE(interception, 0) AS adj
        FROM pbp
        WHERE season_type = 'REG' AND season >= 2006 AND qb_dropback = 1 AND qb_scramble = 0 AND posteam IS NOT NULL
      )
      SELECT season, team, half, side, SUM(adj)::FLOAT / COUNT(*) AS anya
      FROM (SELECT season, posteam AS team, half, 'off' AS side, adj FROM d
            UNION ALL SELECT season, defteam, half, 'def', adj FROM d) x
      GROUP BY 1, 2, 3, 4`),
  ]);
  const key = (r) => `${r.season}|${r.team}`;
  const rows = new Map();
  const row = (r) => {
    if (!rows.has(key(r))) rows.set(key(r), { season: r.season, team: r.team, halves: { 1: {}, 2: {} } });
    return rows.get(key(r));
  };
  for (const r of epa) row(r).halves[r.half][r.side] = r;
  for (const r of results) row(r).halves[r.half].results = r;
  for (const r of anya) row(r).halves[r.half][`anya_${r.side}`] = r.anya;
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
        anya_off: h1.anya_off ?? null,
        anya_def: h1.anya_def ?? null,
        anya_net: h1.anya_off != null && h1.anya_def != null ? h1.anya_off - h1.anya_def : null,
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
