// Every metric shown on the site: how it's computed from summed totals, how it's formatted,
// which direction is good, and its glossary definition. Leaderboards, player pages, tooltips,
// comparisons and the glossary all read from here.

const div = (a, b) => (b ? a / b : null);
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const has = (v) => typeof v === 'number' && Number.isFinite(v);

// NFL passer rating from summed totals (each component capped at 0-2.375).
function passerRating(cmp, att, yds, td, ints) {
  if (!has(att) || !att) return null;
  const clamp = (v) => Math.max(0, Math.min(2.375, v));
  const a = clamp((n(cmp) / att - 0.3) * 5);
  const b = clamp((n(yds) / att - 3) * 0.25);
  const c = clamp((n(td) / att) * 20);
  const d = clamp(2.375 - (n(ints) / att) * 25);
  return ((a + b + c + d) / 6) * 100;
}

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
  total_wpa: {
    label: 'Total win probability added', short: 'WPA', card: 'Total WPA', format: 'signed2', group: 'General', better: 'high', shade: true,
    value: (r) => (has(r.pass_wpa) || has(r.rush_wpa) || has(r.rec_wpa) ? n(r.pass_wpa) + n(r.rush_wpa) + n(r.rec_wpa) : null),
    description: "Win probability added across passing, rushing and receiving. +1.00 is a full win's worth; unlike EPA it weighs plays by how much they swung the game, so late, close-game plays count most.",
  },

  // ---- Fantasy (expected points from ffverse's ffopportunity model, PPR scoring)
  fp_per_game: { label: 'Fantasy points per game (PPR)', short: 'PPR/G', format: 'dec1', group: 'Fantasy', better: 'high', value: (r) => (r.games ? div(n(r.fantasy_points_ppr), r.games) : null), description: 'PPR fantasy points per game played.' },
  xfp: { label: 'Expected fantasy points', short: 'xFP', format: 'dec1', group: 'Fantasy', better: 'high', value: (r) => (has(r.total_fantasy_points_exp) ? r.total_fantasy_points_exp : null), description: "Fantasy points an average player would score with the same opportunities (each target, carry and dropback valued by its down, distance, field position and depth), from ffverse's ffopportunity model. Measures role and volume." },
  xfp_per_game: { label: 'Expected fantasy points per game', short: 'xFP/G', format: 'dec1', group: 'Fantasy', better: 'high', shade: true, value: (r) => (r.games && has(r.total_fantasy_points_exp) ? r.total_fantasy_points_exp / r.games : null), description: 'Expected fantasy points per game played.' },
  fpoe: { label: 'Fantasy points over expected', short: 'FPOE', format: 'signed1', group: 'Fantasy', better: 'high', shade: true, value: (r) => (has(r.total_fantasy_points_exp) ? n(r.total_fantasy_points) - r.total_fantasy_points_exp : null), description: 'Fantasy points scored minus expected fantasy points: how much more (or less) the player made of their opportunities. Large values in either direction tend to shrink.' },
  xtd: { label: 'Expected touchdowns', short: 'xTD', format: 'dec1', group: 'Fantasy', value: (r) => (has(r.total_touchdown_exp) ? r.total_touchdown_exp : null), description: 'Touchdowns an average player would score with the same opportunities.' },
  td_oe: { label: 'Touchdowns over expected', short: 'TD OE', format: 'signed1', group: 'Fantasy', value: (r) => (has(r.total_touchdown_exp) ? n(r.total_touchdown) - r.total_touchdown_exp : null), description: 'Touchdowns scored minus expected touchdowns. Players well above zero usually score less often going forward; well below, more often.' },

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

  pressure_rate: { label: 'Pressure rate', short: 'PRSS%', format: 'pct', group: 'Passing', value: (r) => (has(r.pfr_pressured) ? div(r.pfr_pressured, n(r.attempts) + n(r.sacks)) : null), description: 'Share of dropbacks under pressure (hurried, hit or sacked), as charted by Pro Football Reference. Reflects the offensive line as much as the quarterback.' },
  bad_throw_pct: { label: 'Bad throw rate', short: 'BAD%', format: 'pct', group: 'Passing', better: 'low', shade: true, value: (r) => (has(r.pfr_bad_throws) ? div(r.pfr_bad_throws, r.attempts) : null), description: 'Share of pass attempts charted as poorly thrown by Pro Football Reference.' },
  pass_wpa: { label: 'Passing win probability added', short: 'PASS WPA', format: 'signed2', group: 'Passing', better: 'high', value: (r) => (has(r.pass_wpa) ? r.pass_wpa : null), description: "Win probability added on dropbacks. +1.00 is a full win's worth." },
  deep_rate: { label: 'Deep throw rate', short: 'DEEP%', format: 'pct', group: 'Passing', value: (r) => (has(r.deep_att) ? div(r.deep_att, r.attempts) : null), description: 'Share of pass attempts thrown 20+ yards downfield.' },
  deep_cmp_pct: { label: 'Deep completion %', short: 'DEEP CMP%', format: 'pct', group: 'Passing', better: 'high', value: (r) => (r.deep_att ? n(r.deep_comp) / r.deep_att : null), description: 'Completions on throws 20+ yards downfield.' },
  deep_epa_per: { label: 'EPA per deep throw', short: 'DEEP EPA', format: 'signed2', group: 'Passing', better: 'high', shade: true, value: (r) => (r.deep_att ? n(r.deep_epa) / r.deep_att : null), description: 'Expected points added per throw 20+ yards downfield.' },
  iw_rate: { label: 'Interception-worthy throw rate', short: 'IW%', format: 'pct', group: 'Passing', better: 'low', shade: true, value: (r) => (r.charted_dropbacks ? n(r.int_worthy) / r.charted_dropbacks : null), description: 'Share of dropbacks with a throw FTN charted as interception-worthy, caught or not (2022 on). A steadier read on risk than interceptions.' },
  scramble_rate: { label: 'Scramble rate', short: 'SCRM%', format: 'pct', group: 'Passing', value: (r) => (has(r.scrambles) && n(r.dropbacks) + n(r.scrambles) ? r.scrambles / (n(r.dropbacks) + n(r.scrambles)) : null), description: 'Share of dropbacks where the quarterback scrambled.' },
  scramble_epa_per: { label: 'EPA per scramble', short: 'SCRM EPA', format: 'signed2', group: 'Passing', better: 'high', value: (r) => (r.scrambles ? n(r.scramble_epa) / r.scrambles : null), description: 'Expected points added per scramble.' },
  yac_share_pass: { label: 'YAC share of passing yards', short: 'YAC%', format: 'pct', group: 'Passing', value: (r) => (r.passing_yards ? div(n(r.passing_yac), r.passing_yards) : null), description: 'Share of passing yards gained after the catch. High means receivers did more of the work.' },

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
  ybc_per_att: { label: 'Yards before contact per carry', short: 'YBC/ATT', format: 'dec1', group: 'Rushing', better: 'high', value: (r) => (has(r.pfr_ybc) ? div(r.pfr_ybc, r.pfr_carries) : null), description: 'Yards gained before the first defender makes contact, per carry (Pro Football Reference). Mostly a blocking measure.' },
  yac_rush_per_att: { label: 'Yards after contact per carry', short: 'YAC/ATT', format: 'dec1', group: 'Rushing', better: 'high', shade: true, value: (r) => (has(r.pfr_yac_rush) ? div(r.pfr_yac_rush, r.pfr_carries) : null), description: 'Yards gained after first contact, per carry (Pro Football Reference). Mostly a runner measure.' },
  broken_tackles: { label: 'Broken tackles', short: 'BTK', format: 'int', group: 'Rushing', better: 'high', value: (r) => (has(r.pfr_rush_broken) || has(r.pfr_rec_broken) ? n(r.pfr_rush_broken) + n(r.pfr_rec_broken) : null), description: 'Tackles broken as a runner or receiver (Pro Football Reference).' },
  stacked_box_pct: { label: 'Stacked-box rate', short: '8+ BOX%', format: 'dec1', group: 'Rushing', value: (r) => r.stacked_box_pct, description: 'Share of carries against eight or more defenders in the box (Next Gen Stats).' },
  rush_wpa: { label: 'Rushing win probability added', short: 'RUSH WPA', format: 'signed2', group: 'Rushing', better: 'high', value: (r) => (has(r.rush_wpa) ? r.rush_wpa : null), description: "Win probability added on runs (quarterback scrambles included). +1.00 is a full win's worth." },
  explosive_run_rate: { label: 'Explosive run rate', short: 'EXPL%', format: 'pct', group: 'Rushing', better: 'high', shade: true, value: (r) => (r.pbp_carries && has(r.explosive_runs) ? r.explosive_runs / r.pbp_carries : null), description: 'Share of designed runs gaining 10+ yards.' },
  stuff_rate: { label: 'Stuff rate', short: 'STUFF%', format: 'pct', group: 'Rushing', better: 'low', shade: true, value: (r) => (r.pbp_carries && has(r.stuffed_runs) ? r.stuffed_runs / r.pbp_carries : null), description: 'Share of designed runs stopped at or behind the line.' },
  rush_fd_rate: { label: 'First down rate (rushing)', short: '1D%', format: 'pct', group: 'Rushing', better: 'high', value: (r) => (r.carries ? div(n(r.rushing_first_downs), r.carries) : null), description: 'Carries that gained a first down or touchdown.' },
  goal_line_carries: { label: 'Goal-line carries', short: 'GL CAR', format: 'int', group: 'Rushing', value: (r) => (has(r.goal_line_carries) ? r.goal_line_carries : null), description: "Carries from the opponent's 5-yard line or closer." },
  goal_line_td_rate: { label: 'Goal-line TD rate', short: 'GL TD%', format: 'pct', group: 'Rushing', better: 'high', value: (r) => (r.goal_line_carries ? n(r.goal_line_tds) / r.goal_line_carries : null), description: "Touchdowns per carry from the opponent's 5-yard line or closer." },

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
  rec_drops: { label: 'Drops', short: 'DROP', format: 'int', group: 'Receiving', better: 'low', value: (r) => (has(r.pfr_rec_drops) ? r.pfr_rec_drops : null), description: 'Catchable passes dropped (Pro Football Reference).' },
  drop_rate: { label: 'Drop rate', short: 'DROP%', format: 'pct', group: 'Receiving', better: 'low', shade: true, value: (r) => (has(r.pfr_rec_drops) ? div(r.pfr_rec_drops, r.targets) : null), description: 'Drops per target (Pro Football Reference).' },
  separation: { label: 'Average separation', short: 'SEP', format: 'dec1', group: 'Receiving', better: 'high', shade: true, value: (r) => r.separation, description: 'Yards between receiver and nearest defender when the ball arrives (Next Gen Stats).' },
  yac_over_expected: { label: 'YAC over expected', short: 'YACOE', format: 'signed1', group: 'Receiving', better: 'high', shade: true, value: (r) => r.yac_over_expected, description: 'Yards after catch beyond the expected amount, per reception (Next Gen Stats).' },
  rec_wpa: { label: 'Receiving win probability added', short: 'REC WPA', format: 'signed2', group: 'Receiving', better: 'high', value: (r) => (has(r.rec_wpa) ? r.rec_wpa : null), description: "Win probability added on targets. +1.00 is a full win's worth." },
  yac_oe_pbp: { label: 'YAC over expected (all catches)', short: 'xYAC+', format: 'signed2', group: 'Receiving', better: 'high', shade: true, value: (r) => (r.xyac_n ? (n(r.yac_tracked) - n(r.xyac)) / r.xyac_n : null), description: "Yards after catch beyond nflfastR's expectation, per reception. Covers every catch, unlike the Next Gen Stats version, which the NFL only publishes for high-volume players." },
  explosive_catches: { label: '20+ yard catches', short: '20+', format: 'int', group: 'Receiving', better: 'high', value: (r) => (has(r.explosive_catches) ? r.explosive_catches : null), description: 'Receptions gaining 20 or more yards.' },
  explosive_catch_rate: { label: '20+ yard catches per target', short: '20+/TGT', format: 'pct', group: 'Receiving', better: 'high', shade: true, value: (r) => (r.pbp_targets && has(r.explosive_catches) ? r.explosive_catches / r.pbp_targets : null), description: 'Share of targets that became a 20+ yard catch.' },
  racr: { label: 'Receiver air conversion ratio', short: 'RACR', format: 'dec2', group: 'Receiving', better: 'high', value: (r) => (r.receiving_air_yards > 0 ? div(n(r.receiving_yards), r.receiving_air_yards) : null), description: 'Receiving yards per air yard targeted. Above 1 means the receiver gains more than the throws were worth in the air (yards after the catch, catch rate).' },
  fd_per_target: { label: 'First downs per target', short: '1D/TGT', format: 'pct', group: 'Receiving', better: 'high', value: (r) => (r.targets ? div(n(r.receiving_first_downs), r.targets) : null), description: 'Targets that produced a first down or touchdown.' },
  rz_targets: { label: 'Red zone targets', short: 'RZ TGT', format: 'int', group: 'Receiving', value: (r) => (has(r.rz_targets) ? r.rz_targets : null), description: "Targets inside the opponent's 20-yard line." },
  ez_targets: { label: 'End zone targets', short: 'EZ TGT', format: 'int', group: 'Receiving', value: (r) => (has(r.ez_targets) ? r.ez_targets : null), description: 'Targets thrown into the end zone.' },

  // ---- Defense
  tackles: { label: 'Tackles', short: 'TKL', format: 'int', group: 'Defense', better: 'high', value: (r) => n(r.def_tackles_solo) + n(r.def_tackle_assists), description: 'Solo plus assisted tackles.' },
  def_tackles_for_loss: { label: 'Tackles for loss', short: 'TFL', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_tackles_for_loss, description: 'Tackles behind the line of scrimmage.' },
  def_sacks: { label: 'Sacks', short: 'SACK', format: 'dec1', group: 'Defense', better: 'high', value: (r) => r.def_sacks, description: 'Sacks (half sacks count 0.5).' },
  def_qb_hits: { label: 'QB hits', short: 'QBH', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_qb_hits, description: 'Hits on the quarterback.' },
  def_interceptions: { label: 'Interceptions', short: 'INT', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_interceptions, description: 'Interceptions made.' },
  def_pass_defended: { label: 'Passes defended', short: 'PD', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_pass_defended, description: 'Passes broken up or intercepted.' },
  def_fumbles_forced: { label: 'Forced fumbles', short: 'FF', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_fumbles_forced, description: 'Fumbles forced.' },
  def_pressures: { label: 'Pressures', short: 'PRSS', format: 'int', group: 'Defense', better: 'high', value: (r) => (has(r.pfr_def_pressures) ? r.pfr_def_pressures : null), description: 'Hurries, QB hits and sacks combined (Pro Football Reference).' },
  missed_tackle_pct: { label: 'Missed tackle rate', short: 'MTKL%', format: 'pct', group: 'Defense', better: 'low', shade: true, value: (r) => (has(r.pfr_def_missed) ? div(r.pfr_def_missed, n(r.pfr_def_missed) + n(r.pfr_def_tackles)) : null), description: 'Missed tackles as a share of tackle attempts (Pro Football Reference).' },
  def_targets: { label: 'Targets allowed', short: 'TGT', format: 'int', group: 'Defense', value: (r) => (has(r.pfr_def_targets) ? r.pfr_def_targets : null), description: 'Passes thrown at the defender in coverage (Pro Football Reference).' },
  def_cmp_pct_allowed: { label: 'Completion % allowed', short: 'CMP%', format: 'pct', group: 'Defense', better: 'low', value: (r) => (has(r.pfr_def_targets) ? div(n(r.pfr_def_completions), r.pfr_def_targets) : null), description: 'Completions allowed per target in coverage.' },
  def_yds_per_tgt: { label: 'Yards per target allowed', short: 'Y/TGT', format: 'dec1', group: 'Defense', better: 'low', shade: true, value: (r) => (has(r.pfr_def_targets) ? div(n(r.pfr_def_yards), r.pfr_def_targets) : null), description: 'Receiving yards allowed per target in coverage.' },
  def_rating_allowed: { label: 'Passer rating allowed', short: 'RTG', format: 'dec1', group: 'Defense', better: 'low', value: (r) => passerRating(r.pfr_def_completions, r.pfr_def_targets, r.pfr_def_yards, r.pfr_def_td, r.pfr_def_ints), description: "NFL passer rating on throws into the defender's coverage, computed from completions, yards, touchdowns and interceptions allowed." },
  def_tds: { label: 'Defensive touchdowns', short: 'TD', format: 'int', group: 'Defense', better: 'high', value: (r) => r.def_tds, description: 'Touchdowns scored on defense.' },
  def_snaps: { label: 'Defensive snaps', short: 'SNAPS', format: 'int', group: 'Defense', better: 'high', value: (r) => (has(r.def_snaps) ? r.def_snaps : null), description: 'Snaps played on defense (Pro Football Reference snap counts).' },
  snap_share: { label: 'Snap share', short: 'SNAP%', format: 'pct', group: 'Defense', better: 'high', value: (r) => (has(r.def_snaps) && r.team_def_snaps ? r.def_snaps / r.team_def_snaps : null), description: "Share of the team's defensive snaps played, in the games the player appeared in." },
  havoc: { label: 'Havoc plays', short: 'HAVOC', format: 'int', group: 'Defense', better: 'high', value: (r) => n(r.def_tackles_for_loss) + n(r.def_pass_defended) + n(r.def_fumbles_forced), description: 'Tackles for loss (sacks included), passes defended (interceptions included) and forced fumbles.' },
  havoc_rate: { label: 'Havoc rate', short: 'HAVOC%', format: 'pct', group: 'Defense', better: 'high', shade: true, value: (r) => (r.def_snaps ? (n(r.def_tackles_for_loss) + n(r.def_pass_defended) + n(r.def_fumbles_forced)) / r.def_snaps : null), description: 'Havoc plays per defensive snap.' },
  stops: { label: 'Stops', short: 'STOPS', format: 'int', group: 'Defense', better: 'high', value: (r) => (has(r.stops) ? r.stops : null), description: 'Tackles (solo or shared) that end a play the offense failed on, i.e. one with negative EPA. From play-by-play.' },
  stop_rate: { label: 'Stop rate', short: 'STOP%', format: 'pct', group: 'Defense', better: 'high', shade: true, value: (r) => (r.def_snaps && has(r.stops) ? r.stops / r.def_snaps : null), description: 'Stops per defensive snap.' },
  run_stops: { label: 'Run stops', short: 'RSTOP', format: 'int', group: 'Defense', better: 'high', value: (r) => (has(r.run_stops) ? r.run_stops : null), description: 'Tackles on designed runs and scrambles that the offense failed on (negative EPA).' },
  run_tackle_depth: { label: 'Yards per run tackle', short: 'RTKL YDS', format: 'dec1', group: 'Defense', better: 'low', shade: true, value: (r) => (r.run_tackles ? n(r.run_tackle_yards) / r.run_tackles : null), description: 'Average gain on the runs the player tackled. Lower means the player makes tackles closer to (or behind) the line.' },
  def_pressure_rate: { label: 'Pressure rate', short: 'PRSS%', format: 'pct', group: 'Defense', better: 'high', shade: true, value: (r) => (has(r.pfr_def_pressures) && r.def_snaps ? r.pfr_def_pressures / r.def_snaps : null), description: 'Pressures per defensive snap. Pass-rush snaps are not published, so run snaps count too; compare players at the same position.' },
  def_blitzes: { label: 'Blitzes', short: 'BLTZ', format: 'int', group: 'Defense', value: (r) => (has(r.pfr_def_blitzes) ? r.pfr_def_blitzes : null), description: 'Times sent as a blitzer (Pro Football Reference).' },
  def_missed_tackles: { label: 'Missed tackles', short: 'MTKL', format: 'int', group: 'Defense', better: 'low', value: (r) => (has(r.pfr_def_missed) ? r.pfr_def_missed : null), description: 'Missed tackles (Pro Football Reference).' },
  def_td_allowed: { label: 'Touchdowns allowed', short: 'TD ALW', format: 'int', group: 'Defense', better: 'low', value: (r) => (has(r.pfr_def_targets) ? n(r.pfr_def_td) : null), description: "Receiving touchdowns allowed in the defender's coverage (Pro Football Reference)." },
  def_yac_allowed: { label: 'YAC allowed per completion', short: 'YAC/C', format: 'dec1', group: 'Defense', better: 'low', value: (r) => (has(r.pfr_def_yac) && r.pfr_def_completions ? r.pfr_def_yac / r.pfr_def_completions : null), description: 'Yards after the catch allowed per completion in coverage (Pro Football Reference).' },
  snaps_per_target: { label: 'Snaps per target', short: 'SNP/TGT', format: 'dec1', group: 'Defense', better: 'high', shade: true, value: (r) => (r.pfr_def_targets && r.def_snaps ? r.def_snaps / r.pfr_def_targets : null), description: 'Defensive snaps per pass thrown at the defender. Higher means quarterbacks avoid them (or they rarely cover).' },

  // ---- Kicking
  fg_made: { label: 'Field goals made', short: 'FGM', format: 'int', group: 'Kicking', better: 'high', value: (r) => r.fg_made, description: 'Field goals made.' },
  fg_att: { label: 'Field goals attempted', short: 'FGA', format: 'int', group: 'Kicking', value: (r) => r.fg_att, description: 'Field goals attempted.' },
  fg_pct: { label: 'Field goal %', short: 'FG%', format: 'pct', group: 'Kicking', better: 'high', value: (r) => div(n(r.fg_made), r.fg_att), description: 'Field goals made per attempt.' },
  fg_long: { label: 'Longest field goal', short: 'LNG', format: 'int', group: 'Kicking', value: (r) => r.fg_long, description: 'Longest field goal made.' },
  fg_oe: { label: 'Field goals over expected', short: 'FG OE', card: 'FGs over expected', format: 'signed1', group: 'Kicking', better: 'high', shade: true, value: (r) => (has(r.fg_expected) ? n(r.fg_makes) - r.fg_expected : null), description: "Field goals made minus the number an average kicker would make from the same distances (the league's make rate within two yards, over that season and the two before)." },
  fg_pct_oe: { label: 'FG % over expected', short: 'FG% OE', format: 'signedPct', group: 'Kicking', better: 'high', value: (r) => (r.fg_attempts && has(r.fg_expected) ? (n(r.fg_makes) - r.fg_expected) / r.fg_attempts : null), description: 'Field goal percentage above what an average kicker would make from the same distances, in percentage points.' },
  fg_50: { label: '50+ yard field goals', short: '50+', format: 'text', group: 'Kicking', value: (r) => (has(r.fg_50_attempts) ? `${Math.round(n(r.fg_50_makes))}/${Math.round(r.fg_50_attempts)}` : '–'), sortValue: (r) => (has(r.fg_50_makes) ? r.fg_50_makes : null), description: 'Field goals made and attempted from 50 yards or more.' },
  fg_50_pct: { label: '50+ yard FG %', short: '50+%', format: 'pct', group: 'Kicking', better: 'high', value: (r) => (r.fg_50_attempts ? n(r.fg_50_makes) / r.fg_50_attempts : null), description: 'Make rate from 50 yards or more.' },
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

  // Drives (every possession, end-of-half drives included)
  ppd: { label: 'Points per drive', short: 'PTS/DR', format: 'dec2', better: 'high', description: 'Points scored by the offense per possession.' },
  def_ppd: { label: 'Points per drive allowed', short: 'PTS/DR', format: 'dec2', better: 'low', description: 'Points opponents scored per possession.' },
  scoring_drive_pct: { label: 'Scoring drive rate', short: 'SCORE%', format: 'pct', better: 'high', description: 'Share of possessions ending in a touchdown or field goal.' },
  def_scoring_drive_pct: { label: 'Scoring drives allowed', short: 'SCORE%', format: 'pct', better: 'low', description: "Share of opponents' possessions ending in a touchdown or field goal." },
  three_out_pct: { label: 'Three-and-out rate', short: '3&OUT%', format: 'pct', better: 'low', description: 'Share of possessions that ended in a punt without a first down.' },
  def_three_out_pct: { label: 'Three-and-outs forced', short: '3&OUT%', format: 'pct', better: 'high', description: "Share of opponents' possessions that ended in a punt without a first down." },
  rz_td_pct: { label: 'Red zone TD rate', short: 'RZ TD%', format: 'pct', better: 'high', description: 'Share of drives reaching the opponent 20 that ended in a touchdown.' },
  def_rz_td_pct: { label: 'Red zone TD rate allowed', short: 'RZ TD%', format: 'pct', better: 'low', description: "Share of opponents' drives reaching the 20 that ended in a touchdown." },
  giveaway_drive_pct: { label: 'Giveaway rate', short: 'GIVE%', format: 'pct', better: 'low', description: 'Share of possessions ending in an interception or lost fumble.' },
  takeaway_drive_pct: { label: 'Takeaway rate', short: 'TAKE%', format: 'pct', better: 'high', description: "Share of opponents' possessions ending in an interception or lost fumble." },

  // Big plays
  explosive_pct: { label: 'Explosive play rate', short: 'EXPL%', format: 'pct', better: 'high', description: 'Share of plays gaining 20+ yards on a pass or 10+ on a run.' },
  def_explosive_pct: { label: 'Explosive plays allowed', short: 'EXPL%', format: 'pct', better: 'low', description: 'Share of opponent plays gaining 20+ yards on a pass or 10+ on a run.' },
  stuffed_pct: { label: 'Runs stuffed', short: 'STUFF%', format: 'pct', better: 'low', description: 'Share of designed runs stopped at or behind the line.' },
  def_stuff_pct: { label: 'Run stuff rate', short: 'STUFF%', format: 'pct', better: 'high', description: 'Share of opponent designed runs the defense stopped at or behind the line.' },

  // Style: no better or worse, so ranks read as "most"
  proe: { label: 'Pass rate over expected', short: 'PROE', format: 'signedPct', description: "How much more often the team passes than an average team would in the same situation (nflfastR's expected pass model), in neutral situations: 1st-3rd down, win probability 20-80%, outside the last two minutes of a half." },
  early_pass_pct: { label: 'Early-down pass rate', short: 'ED PASS%', format: 'pct', description: 'Share of 1st and 2nd down plays that were passes, in neutral situations.' },
  sec_per_play: { label: 'Seconds per play', short: 'SEC/PL', format: 'dec1', description: 'Time of possession per offensive play. Lower is a faster pace.' },
  shotgun_pct: { label: 'Shotgun rate', short: 'GUN%', format: 'pct', description: 'Share of plays snapped from shotgun.' },
  no_huddle_pct: { label: 'No-huddle rate', short: 'NO HUD%', format: 'pct', description: 'Share of plays run without a huddle.' },
  motion_pct: { label: 'Motion rate', short: 'MOTION%', format: 'pct', description: 'Share of plays with pre-snap motion (FTN charting, 2022 on).' },
  play_action_pct: { label: 'Play-action rate', short: 'PA%', format: 'pct', description: 'Share of dropbacks with a play-action fake (FTN charting, 2022 on).' },
  blitz_pct: { label: 'Blitz rate', short: 'BLITZ%', format: 'pct', description: 'Share of opponent dropbacks where the defense blitzed (FTN charting, 2022 on).' },
  fourth_go_pct: { label: '4th-and-short go rate', short: '4TH GO%', format: 'pct', description: 'How often the offense went for it on 4th and 2 or less in the opponent half, instead of punting or kicking.' },
  fourth_conv_pct: { label: '4th-down conversion rate', short: '4TH CNV%', format: 'pct', better: 'high', description: 'Share of 4th-down attempts converted.' },

  // Luck and special teams
  pythag_wins: { label: 'Pythagorean wins', short: 'PYTH W', format: 'dec1', better: 'high', description: 'Wins expected from points scored and allowed (exponent 2.37). It predicts the next season better than the actual record does.' },
  wins_over_pythag: { label: 'Wins over expected', short: 'LUCK', format: 'signed1', description: 'Actual wins minus Pythagorean wins. Teams far above zero usually won close games, which tends not to last.' },
  fumble_recovery_pct: { label: 'Fumble recovery rate', short: 'FUM REC%', format: 'pct', description: 'Share of all fumbles in its games (by either team) that the team recovered. Mostly luck; the average is about 50%.' },
  int_per_worthy: { label: 'INTs per interceptable pass', short: 'THROWN/IW', format: 'pct', better: 'low', description: 'Interceptions thrown per interception-worthy pass (FTN charting, 2022 on). Low means the offense got away with risky throws, which tends to even out.' },
  def_int_per_worthy: { label: 'INTs made per interceptable pass', short: 'PICKED/IW', format: 'pct', better: 'high', description: 'Interceptions caught per interception-worthy pass by opponents (FTN charting, 2022 on).' },
  st_epa_pg: { label: 'Special teams EPA per game', short: 'ST EPA', format: 'signed2', better: 'high', description: 'Expected points added on kicks, punts and returns, both units combined, per game.' },
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

// A player's group from the position in their latest game (what the leaderboards use), falling
// back to the roster position; the two can disagree (e.g. edge rushers listed as LB on rosters).
export function playerGroup(player, games = []) {
  const latest = [...games].reverse().find((g) => g.position);
  return positionGroup(latest?.position || player?.position);
}

export function positionGroup(position) {
  const p = String(position || '').toUpperCase();
  if (p === 'QB') return 'QB';
  if (p === 'RB' || p === 'FB') return 'RB';
  if (p === 'WR') return 'WR';
  if (p === 'TE') return 'TE';
  if (p === 'K' || p === 'P') return 'K';
  // nflverse has labelled safeties SAF since 2025 (S, FS, SS before); DB is an unspecified back.
  if (['DE', 'DT', 'NT', 'DL', 'EDGE'].includes(p)) return 'DL';
  if (['LB', 'ILB', 'OLB', 'MLB'].includes(p)) return 'LB';
  if (['CB', 'DB'].includes(p)) return 'CB';
  if (['SAF', 'S', 'FS', 'SS'].includes(p)) return 'S';
  return 'OTHER';
}
