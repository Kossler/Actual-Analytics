// Every metric shown on the site: how it's computed from summed totals, how it's formatted,
// which direction is good, and its glossary definition. Leaderboards, player pages, tooltips,
// comparisons and the glossary all read from here.

const div = (a, b) => (b ? a / b : null);
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const has = (v) => typeof v === 'number' && Number.isFinite(v);

const passEpa = (r) => (has(r.dropback_epa) && r.dropbacks ? r.dropback_epa : r.passing_epa);
const passPlays = (r) => (r.dropbacks ? r.dropbacks : n(r.attempts) + n(r.sacks));

export const METRICS = {
  // ---- General
  games: { label: 'Games', short: 'G', format: 'int', group: 'General', value: (r) => r.games, description: 'Games played.' },
  fantasy_points_ppr: { label: 'Fantasy points (PPR)', short: 'PPR', format: 'dec1', group: 'General', better: 'high', value: (r) => r.fantasy_points_ppr, description: 'Fantasy points in point-per-reception scoring.' },
  total_epa: {
    label: 'Total EPA', short: 'EPA', format: 'signed1', group: 'General', better: 'high',
    value: (r) => n(passEpa(r)) + n(r.rushing_epa) + n(r.receiving_epa),
    description: 'Expected points added across passing, rushing and receiving plays combined.',
  },
  scrimmage_yards: { label: 'Scrimmage yards', short: 'SCRIM YDS', format: 'int', group: 'General', better: 'high', value: (r) => n(r.rushing_yards) + n(r.receiving_yards), description: 'Rushing plus receiving yards.' },
  touches: { label: 'Touches', short: 'TCH', format: 'int', group: 'General', better: 'high', value: (r) => n(r.carries) + n(r.receptions), description: 'Carries plus receptions.' },

  // ---- Passing
  completions: { label: 'Completions', short: 'CMP', format: 'int', group: 'Passing', better: 'high', value: (r) => r.completions, description: 'Completed passes.' },
  attempts: { label: 'Pass attempts', short: 'ATT', format: 'int', group: 'Passing', better: 'high', value: (r) => r.attempts, description: 'Pass attempts (excludes sacks).' },
  cmp_att: { label: 'Completions / attempts', short: 'CMP/ATT', format: 'text', group: 'Passing', value: (r) => (r.attempts ? `${Math.round(n(r.completions))}/${Math.round(n(r.attempts))}` : '–'), sortValue: (r) => r.completions, description: 'Completions and attempts.' },
  passing_yards: { label: 'Passing yards', short: 'YDS', format: 'int', group: 'Passing', better: 'high', value: (r) => r.passing_yards, description: 'Passing yards (sack yardage not subtracted).' },
  passing_tds: { label: 'Passing touchdowns', short: 'TD', format: 'int', group: 'Passing', better: 'high', value: (r) => r.passing_tds, description: 'Touchdown passes.' },
  interceptions: { label: 'Interceptions', short: 'INT', format: 'int', group: 'Passing', better: 'low', value: (r) => r.interceptions, description: 'Passes intercepted.' },
  sacks: { label: 'Sacks taken', short: 'SK', format: 'int', group: 'Passing', better: 'low', value: (r) => r.sacks, description: 'Times sacked.' },
  cmp_pct: { label: 'Completion %', short: 'CMP%', format: 'pct', group: 'Passing', better: 'high', value: (r) => div(n(r.completions), r.attempts), description: 'Completions divided by attempts.' },
  ypa: { label: 'Yards per attempt', short: 'Y/A', card: 'Yards / attempt', format: 'dec2', group: 'Passing', better: 'high', value: (r) => div(n(r.passing_yards), r.attempts), description: 'Passing yards divided by attempts.' },
  anya: {
    label: 'Adjusted net yards per attempt', short: 'ANY/A', axis: 'ANY/A', format: 'dec2', group: 'Passing', better: 'high', shade: true,
    value: (r) => div(n(r.passing_yards) + 20 * n(r.passing_tds) - 45 * n(r.interceptions) - n(r.sack_yards), n(r.attempts) + n(r.sacks)),
    description: '(Passing yards + 20 × TD − 45 × INT − sack yards) ÷ (attempts + sacks). Rewards touchdowns, punishes interceptions and sacks.',
  },
  td_rate: { label: 'Touchdown rate', short: 'TD%', format: 'pct', group: 'Passing', better: 'high', value: (r) => div(n(r.passing_tds), r.attempts), description: 'Touchdown passes per attempt.' },
  int_rate: { label: 'Interception rate', short: 'INT%', card: 'INT rate', format: 'pct', group: 'Passing', better: 'low', shade: true, value: (r) => div(n(r.interceptions), r.attempts), description: 'Interceptions per attempt.' },
  sack_rate: { label: 'Sack rate', short: 'SK%', format: 'pct', group: 'Passing', better: 'low', shade: true, value: (r) => div(n(r.sacks), n(r.attempts) + n(r.sacks)), description: 'Sacks per dropback (attempts plus sacks).' },
  dropbacks: { label: 'Dropbacks', short: 'DB', format: 'int', group: 'Passing', better: 'high', value: (r) => r.dropbacks, description: 'Pass attempts, sacks and scrambles.' },
  pass_epa: { label: 'Passing EPA', short: 'EPA', axis: 'Pass EPA', format: 'signed1', group: 'Passing', better: 'high', value: passEpa, description: 'Expected points added on dropbacks, including sacks and scrambles.' },
  epa_per_play: {
    label: 'EPA per dropback', short: 'EPA/PLAY', card: 'EPA / play', axis: 'EPA/play', format: 'signed2', group: 'Passing', better: 'high', shade: true,
    value: (r) => div(n(passEpa(r)), passPlays(r)),
    description: 'Expected points added per dropback. Zero is an average play; +0.20 is elite.',
  },
  cpoe: {
    label: 'Completion % over expected', short: 'CPOE', card: 'CPOE', axis: 'CPOE', format: 'signed1', group: 'Passing', better: 'high', shade: true,
    value: (r) => (r.cpoe_n ? r.cpoe_sum / r.cpoe_n : null),
    description: 'Completion percentage minus the expected completion percentage for the same throws, given depth, location and pressure. In percentage points.',
  },
  dropback_success: { label: 'Dropback success rate', short: 'SUCC%', format: 'pct', group: 'Passing', better: 'high', shade: true, value: (r) => div(n(r.dropback_success), r.dropbacks), description: 'Share of dropbacks with positive EPA.' },
  adot: { label: 'Average depth of target', short: 'aDOT', format: 'dec1', group: 'Passing', value: (r) => div(n(r.passing_air_yards), r.attempts), description: 'Air yards per pass attempt: how far downfield the quarterback throws.' },
  time_to_throw: { label: 'Time to throw', short: 'TTT', format: 'dec2', group: 'Passing', value: (r) => r.time_to_throw, description: 'Average seconds from snap to throw (Next Gen Stats).' },
  aggressiveness: { label: 'Aggressiveness', short: 'AGG%', format: 'dec1', group: 'Passing', value: (r) => r.aggressiveness, description: 'Share of throws into tight coverage (defender within a yard) (Next Gen Stats).' },

  // ---- Rushing
  carries: { label: 'Carries', short: 'CAR', format: 'int', group: 'Rushing', better: 'high', value: (r) => r.carries, description: 'Rushing attempts.' },
  rushing_yards: { label: 'Rushing yards', short: 'YDS', format: 'int', group: 'Rushing', better: 'high', value: (r) => r.rushing_yards, description: 'Rushing yards.' },
  rushing_tds: { label: 'Rushing touchdowns', short: 'TD', format: 'int', group: 'Rushing', better: 'high', value: (r) => r.rushing_tds, description: 'Rushing touchdowns.' },
  ypc: { label: 'Yards per carry', short: 'Y/C', format: 'dec2', group: 'Rushing', better: 'high', value: (r) => div(n(r.rushing_yards), r.carries), description: 'Rushing yards divided by carries.' },
  rushing_epa: { label: 'Rushing EPA', short: 'EPA', format: 'signed1', group: 'Rushing', better: 'high', value: (r) => r.rushing_epa, description: 'Expected points added on carries.' },
  rush_epa_per: {
    label: 'EPA per carry', short: 'EPA/CAR', card: 'EPA / carry', format: 'signed2', group: 'Rushing', better: 'high', shade: true,
    value: (r) => div(n(r.rushing_epa), r.carries),
    description: 'Expected points added per carry. Most running backs land below zero; anything positive is strong.',
  },
  rush_success: { label: 'Rushing success rate', short: 'SUCC%', card: 'Success rate', axis: 'Rush success %', format: 'pct', group: 'Rushing', better: 'high', shade: true, value: (r) => div(n(r.rush_success), r.pbp_carries), description: 'Share of designed runs with positive EPA.' },
  ryoe_per: {
    label: 'Rush yards over expected per carry', short: 'RYOE/CAR', card: 'RYOE / carry', axis: 'RYOE/carry', format: 'signed1', group: 'Rushing', better: 'high', shade: true,
    value: (r) => div(n(r.ryoe), r.ngs_rush_attempts),
    description: 'Rushing yards beyond what an average back would gain given blocking and defender positions at the handoff (Next Gen Stats).',
  },
  ryoe: { label: 'Rush yards over expected', short: 'RYOE', format: 'signedInt', group: 'Rushing', better: 'high', value: (r) => (has(r.ryoe) ? r.ryoe : null), description: 'Total rushing yards over expected (Next Gen Stats).' },
  stacked_box_pct: { label: 'Stacked-box rate', short: '8+ BOX%', format: 'dec1', group: 'Rushing', value: (r) => r.stacked_box_pct, description: 'Share of carries against eight or more defenders in the box (Next Gen Stats).' },

  // ---- Receiving
  targets: { label: 'Targets', short: 'TGT', format: 'int', group: 'Receiving', better: 'high', value: (r) => r.targets, description: 'Passes thrown to the player.' },
  receptions: { label: 'Receptions', short: 'REC', format: 'int', group: 'Receiving', better: 'high', value: (r) => r.receptions, description: 'Catches.' },
  receiving_yards: { label: 'Receiving yards', short: 'YDS', format: 'int', group: 'Receiving', better: 'high', value: (r) => r.receiving_yards, description: 'Receiving yards.' },
  receiving_tds: { label: 'Receiving touchdowns', short: 'TD', format: 'int', group: 'Receiving', better: 'high', value: (r) => r.receiving_tds, description: 'Receiving touchdowns.' },
  catch_pct: { label: 'Catch rate', short: 'CATCH%', format: 'pct', group: 'Receiving', better: 'high', value: (r) => div(n(r.receptions), r.targets), description: 'Receptions per target.' },
  ypr: { label: 'Yards per reception', short: 'Y/R', format: 'dec1', group: 'Receiving', better: 'high', value: (r) => div(n(r.receiving_yards), r.receptions), description: 'Receiving yards per catch.' },
  ypt: { label: 'Yards per target', short: 'Y/TGT', card: 'Yards / target', format: 'dec1', group: 'Receiving', better: 'high', shade: true, value: (r) => div(n(r.receiving_yards), r.targets), description: 'Receiving yards per target, including incompletions.' },
  receiving_epa: { label: 'Receiving EPA', short: 'EPA', format: 'signed1', group: 'Receiving', better: 'high', value: (r) => r.receiving_epa, description: 'Expected points added on catches.' },
  epa_per_target: {
    label: 'EPA per target', short: 'EPA/TGT', card: 'EPA / target', format: 'signed2', group: 'Receiving', better: 'high', shade: true,
    value: (r) => div(n(r.target_epa), r.pbp_targets),
    description: 'Expected points added per target, including incompletions and interceptions.',
  },
  target_success: { label: 'Target success rate', short: 'SUCC%', format: 'pct', group: 'Receiving', better: 'high', shade: true, value: (r) => div(n(r.target_success), r.pbp_targets), description: 'Share of targets with positive EPA.' },
  target_share: { label: 'Target share', short: 'TGT%', format: 'pct', group: 'Receiving', better: 'high', value: (r) => r.target_share, description: "Share of the team's targets, averaged across games." },
  air_yards_share: { label: 'Air yards share', short: 'AY%', format: 'pct', group: 'Receiving', better: 'high', value: (r) => r.air_yards_share, description: "Share of the team's air yards, averaged across games." },
  wopr: { label: 'Weighted opportunity rating', short: 'WOPR', format: 'dec2', group: 'Receiving', better: 'high', value: (r) => r.wopr, description: '1.5 × target share + 0.7 × air yards share. Measures a receiver’s role in the passing game.' },
  adot_rec: { label: 'Average depth of target', short: 'aDOT', format: 'dec1', group: 'Receiving', value: (r) => div(n(r.receiving_air_yards), r.targets), description: 'Air yards per target.' },
  yac_per_rec: { label: 'Yards after catch per reception', short: 'YAC/R', format: 'dec1', group: 'Receiving', better: 'high', value: (r) => div(n(r.receiving_yac), r.receptions), description: 'Yards gained after the catch, per reception.' },
  separation: { label: 'Average separation', short: 'SEP', format: 'dec1', group: 'Receiving', better: 'high', shade: true, value: (r) => r.separation, description: 'Yards between receiver and nearest defender when the ball arrives (Next Gen Stats).' },
  yac_over_expected: { label: 'YAC over expected', short: 'YACOE', format: 'signed1', group: 'Receiving', better: 'high', shade: true, value: (r) => r.yac_over_expected, description: 'Yards after catch beyond the expected amount, per reception (Next Gen Stats).' },

  // ---- Defense
  tackles: { label: 'Tackles', short: 'TKL', format: 'int', group: 'Defense', better: 'high', value: (r) => n(r.def_tackles_solo) + n(r.def_tackle_assists), description: 'Solo plus assisted tackles.' },
  def_tackles_for_loss: { label: 'Tackles for loss', short: 'TFL', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_tackles_for_loss, description: 'Tackles behind the line of scrimmage.' },
  def_sacks: { label: 'Sacks', short: 'SACK', format: 'dec1', group: 'Defense', better: 'high', value: (r) => r.def_sacks, description: 'Sacks (half sacks count 0.5).' },
  def_qb_hits: { label: 'QB hits', short: 'QBH', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_qb_hits, description: 'Hits on the quarterback.' },
  def_interceptions: { label: 'Interceptions', short: 'INT', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_interceptions, description: 'Interceptions made.' },
  def_pass_defended: { label: 'Passes defended', short: 'PD', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_pass_defended, description: 'Passes broken up or intercepted.' },
  def_fumbles_forced: { label: 'Forced fumbles', short: 'FF', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_fumbles_forced, description: 'Fumbles forced.' },
  def_tds: { label: 'Defensive touchdowns', short: 'TD', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_tds, description: 'Touchdowns scored on defense.' },

  // ---- Kicking
  fg_made: { label: 'Field goals made', short: 'FGM', format: 'int', group: 'Kicking', better: 'high', value: (r) => r.fg_made, description: 'Field goals made.' },
  fg_att: { label: 'Field goals attempted', short: 'FGA', format: 'int', group: 'Kicking', value: (r) => r.fg_att, description: 'Field goals attempted.' },
  fg_pct: { label: 'Field goal %', short: 'FG%', format: 'pct', group: 'Kicking', better: 'high', value: (r) => div(n(r.fg_made), r.fg_att), description: 'Field goals made per attempt.' },
  fg_long: { label: 'Longest field goal', short: 'LNG', format: 'int', group: 'Kicking', value: (r) => r.fg_long, description: 'Longest field goal made.' },
  pat_pct: { label: 'Extra point %', short: 'XP%', format: 'pct', group: 'Kicking', better: 'high', value: (r) => div(n(r.pat_made), r.pat_att), description: 'Extra points made per attempt.' },
};

// Team-level metrics (Team rankings, team pages, regression lab).
export const TEAM_METRICS = {
  off_epa: { label: 'Offense EPA/play', short: 'OFFENSE', format: 'signed2', better: 'high', description: 'Expected points added per offensive play (passes and runs).' },
  def_epa: { label: 'Defense EPA/play allowed', short: 'DEFENSE', format: 'signed2', better: 'low', description: 'Expected points added per play by opponents. Negative is good.' },
  net_epa: { label: 'Net EPA/play', short: 'NET', format: 'signed2', better: 'high', description: 'Offense EPA/play minus defense EPA/play allowed.' },
  pass_off_epa: { label: 'Pass offense EPA/play', short: 'PASS', format: 'signed2', better: 'high', description: 'EPA per dropback on offense.' },
  rush_off_epa: { label: 'Rush offense EPA/play', short: 'RUSH', format: 'signed2', better: 'high', description: 'EPA per designed run on offense.' },
  pass_def_epa: { label: 'Pass defense EPA/play allowed', short: 'PASS D', format: 'signed2', better: 'low', description: 'EPA per dropback allowed.' },
  rush_def_epa: { label: 'Rush defense EPA/play allowed', short: 'RUSH D', format: 'signed2', better: 'low', description: 'EPA per designed run allowed.' },
  off_success: { label: 'Offensive success rate', short: 'SUCC%', format: 'pct', better: 'high', description: 'Share of offensive plays with positive EPA.' },
  point_diff: { label: 'Point differential', short: 'PT DIFF', format: 'signedInt', better: 'high', description: 'Points scored minus points allowed.' },
  turnover_diff: { label: 'Turnover differential per game', short: 'TO DIFF', format: 'signed2', better: 'high', description: 'Takeaways minus giveaways, per game.' },
  win_pct: { label: 'Win %', short: 'WIN%', format: 'pct', better: 'high', description: 'Wins per game (ties count half).' },
};

export function metricValue(key, row) {
  const m = METRICS[key];
  if (!m || !row) return null;
  const v = m.value(row);
  return v === undefined ? null : v;
}

export function sortValue(key, row) {
  const m = METRICS[key];
  if (m?.sortValue) return m.sortValue(row);
  const v = metricValue(key, row);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Shares that are averaged across games rather than summed.
const AVERAGED = new Set(['target_share', 'air_yards_share', 'wopr', 'passing_cpoe']);
const MAXED = new Set(['fg_long']);
const IDENTITY = new Set(['season', 'week', 'season_type', 'team', 'opponent', 'position', 'game_id', 'home_team', 'away_team', 'home_score', 'away_score', 'gameday', 'roof', 'game_type']);

// Sums per-game rows into totals the metric functions understand (adds `games`).
export function aggregate(rows) {
  const out = { games: rows.length };
  const counts = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (IDENTITY.has(key) || typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (MAXED.has(key)) {
        out[key] = Math.max(out[key] ?? -Infinity, value);
      } else {
        out[key] = (out[key] || 0) + value;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
  for (const key of AVERAGED) if (counts[key]) out[key] /= counts[key];
  return out;
}

// Mean and standard deviation of a metric across a group, for above/below-average shading.
export function groupStats(rows, key, accessor = (r) => metricValue(key, r)) {
  const values = rows.map(accessor).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length < 3) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length) || 1;
  return { mean, sd };
}

// Blue for better than the group average, orange for worse; intensity follows the z-score.
export function shadeStyle(value, stats, better = 'high') {
  if (!stats || typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const z = (value - stats.mean) / stats.sd;
  const goodness = better === 'low' ? -z : z;
  const strength = Math.min(Math.abs(goodness) / 2, 1);
  if (strength < 0.08) return undefined;
  const alpha = 0.12 + strength * 0.5;
  return { backgroundColor: goodness > 0 ? `rgba(61, 122, 214, ${alpha})` : `rgba(196, 110, 40, ${alpha})` };
}

export function positionGroup(position) {
  const p = String(position || '').toUpperCase();
  if (p === 'QB') return 'QB';
  if (p === 'RB' || p === 'FB') return 'RB';
  if (p === 'WR') return 'WR';
  if (p === 'TE') return 'TE';
  if (p === 'K' || p === 'P') return 'K';
  if (['CB', 'S', 'FS', 'SS', 'DB', 'LB', 'ILB', 'OLB', 'MLB', 'DL', 'DE', 'DT', 'NT', 'EDGE'].includes(p)) return 'DEF';
  return 'OTHER';
}
