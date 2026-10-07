// Per-position layout: leaderboard columns, leader cards, qualification, and player-page sections.
import { METRICS } from './metrics';

export const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'OL'];
export const DEFENSE_POSITIONS = ['DL', 'LB', 'CB', 'S'];
export const SPECIAL_POSITIONS = ['K'];
export const LEADERBOARD_POSITIONS = [...OFFENSE_POSITIONS, ...DEFENSE_POSITIONS, ...SPECIAL_POSITIONS];

// Every defensive stat a defender's leaderboard, custom columns and player page can show.
const DEFENSE_METRICS = ['games', 'def_snaps', 'snap_share', 'tackles', 'stops', 'stop_rate', 'run_stops', 'run_tackle_depth',
  'def_tackles_for_loss', 'def_sacks', 'def_qb_hits', 'def_pressures', 'def_pressure_rate', 'def_blitzes', 'havoc', 'havoc_rate',
  'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'def_tds', 'def_missed_tackles', 'missed_tackle_pct',
  'def_targets', 'snaps_per_target', 'def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_yac_allowed', 'def_td_allowed',
  'def_rating_allowed'];

// Shared defender layout; each position supplies its own cards, column sets, chart and scatter.
function defender({ player, ...config }) {
  return {
    ...config,
    customOptions: DEFENSE_METRICS,
    player: {
      ...player,
      gameLog: [
        { group: 'Usage', columns: ['def_snaps', 'snap_share'] },
        { group: 'Tackling', columns: ['tackles', 'stops', 'def_tackles_for_loss', 'def_missed_tackles'] },
        { group: 'Pass rush', columns: ['def_sacks', 'def_qb_hits', 'def_pressures'] },
        { group: 'Coverage', columns: ['def_targets', 'def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_interceptions', 'def_pass_defended'] },
      ],
      career: [
        { group: 'Overall', columns: ['games', 'def_snaps', 'snap_share'] },
        { group: 'Tackling', columns: ['tackles', 'stops', 'def_tackles_for_loss', 'missed_tackle_pct'] },
        { group: 'Pass rush', columns: ['def_sacks', 'def_qb_hits', 'def_pressures'] },
        { group: 'Coverage', columns: ['def_targets', 'def_rating_allowed', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'def_tds'] },
      ],
      scatterOptions: ['tackles', 'stops', 'stop_rate', 'run_tackle_depth', 'def_sacks', 'def_pressures', 'def_pressure_rate', 'havoc_rate',
        'def_yds_per_tgt', 'def_cmp_pct_allowed', 'def_rating_allowed', 'snaps_per_target', 'missed_tackle_pct', 'def_snaps'],
      splits: ['games', 'def_snaps', 'tackles', 'stops', 'def_sacks', 'def_pressures', 'def_interceptions', 'def_pass_defended'],
      advanced: ['snap_share', 'stop_rate', 'run_tackle_depth', 'def_pressure_rate', 'havoc_rate', 'missed_tackle_pct', 'def_targets',
        'snaps_per_target', 'def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_rating_allowed'],
    },
  };
}

const RECEIVER = {
  qualifier: { metric: 'targets', label: 'Min. targets', perWeek: 5 },
  leaderCards: [
    { metric: 'receiving_yards', label: 'Receiving yards' },
    { metric: 'epa_per_target', label: 'EPA / target' },
    { metric: 'target_share', label: 'Target share' },
    { metric: 'separation', label: 'Separation' },
  ],
  defaultSort: 'receiving_yards',
  columnSets: {
    Standard: [
      { group: 'Receiving', columns: ['games', 'targets', 'receptions', 'receiving_yards', 'receiving_tds'] },
      { group: 'Efficiency', columns: ['catch_pct', 'ypr', 'ypt'] },
      { group: 'Advanced', columns: ['receiving_epa', 'epa_per_target', 'target_share'] },
    ],
    Efficiency: [
      { group: 'Volume', columns: ['games', 'targets', 'receptions'] },
      { group: 'Efficiency', columns: ['epa_per_target', 'target_success', 'ypt', 'catch_pct', 'yac_per_rec'] },
    ],
    Advanced: [
      { group: 'Role', columns: ['target_share', 'air_yards_share', 'wopr', 'adot_rec'] },
      { group: 'Next Gen Stats', columns: ['separation', 'cushion', 'yac_over_expected'] },
      { group: 'Hands', columns: ['drop_rate', 'broken_tackles'] },
      { group: 'Value', columns: ['epa_per_target'] },
    ],
    Impact: [
      { group: 'Win probability', columns: ['rec_wpa'] },
      { group: 'After the catch', columns: ['yac_oe_pbp', 'racr'] },
      { group: 'Big plays', columns: ['explosive_catches', 'explosive_catch_rate'] },
      { group: 'Chains & scoring', columns: ['fd_per_target', 'rz_targets', 'ez_targets'] },
    ],
    Fantasy: [
      { group: 'Scored', columns: ['fantasy_points_ppr', 'fp_per_game'] },
      { group: 'Expected', columns: ['xfp', 'xfp_per_game', 'fpoe'] },
      { group: 'Touchdowns', columns: ['xtd', 'td_oe'] },
    ],
  },
  customOptions: ['games', 'targets', 'receptions', 'receiving_yards', 'receiving_tds', 'catch_pct', 'ypr', 'ypt',
    'receiving_epa', 'epa_per_target', 'target_success', 'target_share', 'air_yards_share', 'wopr', 'adot_rec',
    'yac_per_rec', 'separation', 'cushion', 'yac_over_expected', 'rec_drops', 'drop_rate', 'broken_tackles', 'carries', 'rushing_yards',
    'fantasy_points_ppr', 'rec_wpa', 'yac_oe_pbp', 'racr', 'explosive_catches', 'explosive_catch_rate', 'fd_per_target',
    'rz_targets', 'ez_targets', 'fp_per_game', 'xfp', 'xfp_per_game', 'fpoe', 'xtd', 'td_oe'],
  player: {
    cards: ['epa_per_target', 'catch_pct', 'ypt', 'target_share'],
    summary: { title: 'Receiving', main: 'receiving_yards', unit: 'yds', rate: 'epa_per_target', detail: ['receptions', 'targets', 'receiving_tds'] },
    weekChart: ['epa_per_target', 'receiving_yards', 'targets'],
    valueSplit: [{ label: 'Receiving', metric: 'receiving_epa' }, { label: 'Rushing', metric: 'rushing_epa' }],
    gameLog: [
      { group: 'Receiving', columns: ['targets', 'receptions', 'receiving_yards', 'ypr', 'receiving_tds', 'catch_pct', 'adot_rec', 'receiving_epa', 'epa_per_target'] },
      { group: 'Rushing', columns: ['carries', 'rushing_yards', 'rushing_tds'] },
    ],
    career: [
      { group: 'Overall', columns: ['games', 'total_epa'] },
      { group: 'Receiving', columns: ['targets', 'receptions', 'receiving_yards', 'receiving_tds', 'catch_pct', 'ypr', 'ypt', 'target_share', 'epa_per_target'] },
      { group: 'Rushing', columns: ['carries', 'rushing_yards', 'rushing_tds'] },
    ],
    scatter: { x: 'adot_rec', y: 'epa_per_target' },
    scatterOptions: ['epa_per_target', 'ypt', 'catch_pct', 'adot_rec', 'target_share', 'yac_per_rec', 'separation', 'receiving_yards', 'targets', 'target_success'],
    splits: ['games', 'targets', 'receptions', 'receiving_yards', 'receiving_tds', 'catch_pct', 'ypt', 'epa_per_target'],
    advanced: ['target_success', 'epa_per_target', 'adot_rec', 'yac_per_rec', 'target_share', 'wopr', 'rec_drops', 'drop_rate', 'broken_tackles'],
    impact: ['rec_wpa', 'yac_oe_pbp', 'racr', 'explosive_catches', 'explosive_catch_rate', 'fd_per_target', 'rz_targets', 'ez_targets', 'xfp_per_game', 'fpoe', 'td_oe'],
    ngs: [
      { key: 'separation', label: 'Separation', format: 'dec1' },
      { key: 'cushion', label: 'Cushion', format: 'dec1' },
      { key: 'yac_over_expected', label: 'YAC over expected', format: 'signed1' },
      { key: 'intended_air_yards', label: 'Intended air yards', format: 'dec1' },
    ],
  },
};

export const POSITIONS = {
  QB: {
    title: 'Quarterback',
    plural: 'Quarterbacks',
    qualifier: { metric: 'attempts', label: 'Min. attempts', perWeek: 22.5 },
    leaderCards: [
      { metric: 'passing_yards', label: 'Passing yards' },
      { metric: 'epa_per_play', label: 'EPA / play' },
      { metric: 'cpoe', label: 'CPOE' },
      { metric: 'passing_tds', label: 'Passing TD' },
    ],
    defaultSort: 'passing_yards',
    columnSets: {
      Standard: [
        { group: 'Volume', columns: ['games', 'attempts', 'passing_yards', 'passing_tds', 'interceptions'] },
        { group: 'Efficiency', columns: ['cmp_pct', 'ypa'] },
        { group: 'Advanced', columns: ['pass_epa', 'epa_per_play', 'cpoe'] },
      ],
      Efficiency: [
        { group: 'Volume', columns: ['games', 'dropbacks'] },
        { group: 'Efficiency', columns: ['epa_per_play', 'dropback_success', 'cpoe', 'anya', 'ypa'] },
        { group: 'Rates', columns: ['td_rate', 'int_rate', 'sack_rate'] },
      ],
      Advanced: [
        { group: 'Passing', columns: ['dropbacks', 'adot', 'air_yards_to_sticks', 'time_to_throw', 'aggressiveness'] },
        { group: 'Accuracy', columns: ['cpoe', 'xcomp_pct'] },
        { group: 'Pressure', columns: ['pressure_rate', 'sack_rate', 'bad_throw_pct'] },
        { group: 'Value', columns: ['epa_per_play', 'cpoe'] },
      ],
      Impact: [
        { group: 'Win probability', columns: ['pass_wpa', 'total_wpa'] },
        { group: 'Deep passing', columns: ['deep_rate', 'deep_cmp_pct', 'deep_epa_per'] },
        { group: 'Risk', columns: ['iw_rate'] },
        { group: 'Scrambling', columns: ['scramble_rate', 'scramble_epa_per'] },
        { group: 'Receiver help', columns: ['yac_share_pass'] },
      ],
      Fantasy: [
        { group: 'Scored', columns: ['fantasy_points_ppr', 'fp_per_game'] },
        { group: 'Expected', columns: ['xfp', 'xfp_per_game', 'fpoe'] },
        { group: 'Touchdowns', columns: ['xtd', 'td_oe'] },
      ],
    },
    customOptions: ['games', 'completions', 'attempts', 'cmp_pct', 'passing_yards', 'passing_tds', 'interceptions', 'sacks',
      'ypa', 'anya', 'td_rate', 'int_rate', 'sack_rate', 'dropbacks', 'pass_epa', 'epa_per_play', 'cpoe', 'dropback_success',
      'adot', 'air_yards_to_sticks', 'xcomp_pct', 'time_to_throw', 'aggressiveness', 'pressure_rate', 'bad_throw_pct', 'carries', 'rushing_yards', 'rushing_tds', 'rushing_epa', 'total_epa', 'fantasy_points_ppr',
      'pass_wpa', 'total_wpa', 'deep_rate', 'deep_cmp_pct', 'deep_epa_per', 'iw_rate', 'scramble_rate', 'scramble_epa_per', 'yac_share_pass', 'fp_per_game', 'xfp', 'xfp_per_game', 'fpoe', 'xtd', 'td_oe'],
    player: {
      cards: ['epa_per_play', 'cpoe', 'ypa', 'int_rate'],
      cardDetail: { int_rate: (t) => `${Math.round(t.interceptions || 0)} INT / ${Math.round(t.attempts || 0)} att` },
      summary: { title: 'Rushing', main: 'rushing_yards', unit: 'yds', rate: 'rush_epa_per', detail: ['carries', 'ypc', 'rushing_tds'] },
      weekChart: ['epa_per_play', 'cpoe', 'ypa'],
      valueSplit: [{ label: 'Passing', metric: 'pass_epa' }, { label: 'Rushing', metric: 'rushing_epa' }],
      gameLog: [
        { group: 'Passing', columns: ['cmp_att', 'cmp_pct', 'passing_yards', 'ypa', 'passing_tds', 'interceptions', 'sacks', 'anya', 'pass_epa', 'epa_per_play', 'cpoe'] },
        { group: 'Rushing', columns: ['carries', 'rushing_yards', 'ypc', 'rushing_tds', 'rushing_epa', 'rush_epa_per'] },
      ],
      career: [
        { group: 'Overall', columns: ['games', 'total_epa'] },
        { group: 'Passing', columns: ['cmp_att', 'cmp_pct', 'ypa', 'anya', 'passing_tds', 'interceptions', 'sacks', 'pass_epa', 'epa_per_play', 'cpoe'] },
        { group: 'Rushing', columns: ['carries', 'ypc', 'rushing_tds', 'rushing_epa', 'rush_epa_per'] },
      ],
      scatter: { x: 'cpoe', y: 'pass_epa' },
      scatterOptions: ['pass_epa', 'epa_per_play', 'cpoe', 'ypa', 'anya', 'adot', 'dropback_success', 'sack_rate', 'int_rate', 'passing_yards', 'attempts', 'time_to_throw'],
      splits: ['games', 'cmp_pct', 'passing_yards', 'ypa', 'anya', 'passing_tds', 'interceptions', 'epa_per_play', 'cpoe'],
      advanced: ['dropbacks', 'dropback_success', 'epa_per_play', 'cpoe', 'adot', 'pressure_rate', 'sack_rate', 'bad_throw_pct', 'int_rate'],
      impact: ['pass_wpa', 'total_wpa', 'deep_rate', 'deep_cmp_pct', 'deep_epa_per', 'iw_rate', 'scramble_rate', 'scramble_epa_per', 'yac_share_pass', 'xfp_per_game', 'fpoe', 'td_oe'],
      ngs: [
        { key: 'time_to_throw', label: 'Time to throw', format: 'dec2' },
        { key: 'aggressiveness', label: 'Aggressiveness', format: 'dec1' },
        { key: 'intended_air_yards', label: 'Intended air yards', format: 'dec1' },
        { key: 'completed_air_yards', label: 'Completed air yards', format: 'dec1' },
        { key: 'cpoe_ngs', label: 'NGS CPOE', format: 'signed1' },
        { key: 'xcomp_pct', label: 'Expected completion %', format: 'dec1' },
        { key: 'air_yards_to_sticks', label: 'Air yards to the sticks', format: 'signed1' },
        { key: 'max_completed_air', label: 'Longest completion in the air', format: 'dec1' },
      ],
    },
  },
  RB: {
    title: 'Running Back',
    plural: 'Running Backs',
    qualifier: { metric: 'carries', label: 'Min. carries', perWeek: 10 },
    leaderCards: [
      { metric: 'rushing_yards', label: 'Rushing yards' },
      { metric: 'scrimmage_yards', label: 'Scrimmage yards' },
      { metric: 'rush_epa_per', label: 'EPA / carry' },
      { metric: 'ryoe_per', label: 'RYOE / carry' },
    ],
    defaultSort: 'rushing_yards',
    columnSets: {
      Standard: [
        { group: 'Rushing', columns: ['carries', 'rushing_yards', 'ypc', 'rushing_tds'] },
        { group: 'Efficiency', columns: ['rush_epa_per', 'rush_success', 'ryoe_per'] },
        { group: 'Receiving', columns: ['targets', 'receptions', 'receiving_yards'] },
      ],
      Efficiency: [
        { group: 'Volume', columns: ['games', 'carries', 'touches'] },
        { group: 'Rushing', columns: ['rush_epa_per', 'rush_success', 'ryoe_per', 'ypc'] },
        { group: 'Receiving', columns: ['epa_per_target', 'catch_pct', 'ypt'] },
      ],
      Advanced: [
        { group: 'Rushing', columns: ['carries', 'ryoe_per', 'rush_beat_pct', 'expected_ypc', 'stacked_box_pct'] },
        { group: 'Running style', columns: ['rush_efficiency', 'time_to_los'] },
        { group: 'Contact', columns: ['ybc_per_att', 'yac_rush_per_att', 'broken_tackles'] },
        { group: 'Value', columns: ['total_epa', 'rushing_epa', 'receiving_epa'] },
        { group: 'Role', columns: ['target_share', 'scrimmage_yards', 'fantasy_points_ppr'] },
      ],
      Impact: [
        { group: 'Win probability', columns: ['rush_wpa', 'total_wpa'] },
        { group: 'Big plays', columns: ['explosive_run_rate', 'stuff_rate'] },
        { group: 'Chains', columns: ['rush_fd_rate'] },
        { group: 'Goal line', columns: ['goal_line_carries', 'goal_line_td_rate'] },
      ],
      Fantasy: [
        { group: 'Scored', columns: ['fantasy_points_ppr', 'fp_per_game'] },
        { group: 'Expected', columns: ['xfp', 'xfp_per_game', 'fpoe'] },
        { group: 'Touchdowns', columns: ['xtd', 'td_oe'] },
      ],
    },
    customOptions: ['games', 'carries', 'rushing_yards', 'ypc', 'rushing_tds', 'rushing_epa', 'rush_epa_per', 'rush_success',
      'ryoe', 'ryoe_per', 'rush_beat_pct', 'expected_ypc', 'rush_efficiency', 'time_to_los', 'stacked_box_pct', 'ybc_per_att', 'yac_rush_per_att', 'broken_tackles', 'targets', 'receptions', 'receiving_yards', 'receiving_tds', 'catch_pct', 'ypt',
      'epa_per_target', 'target_share', 'scrimmage_yards', 'touches', 'total_epa', 'fantasy_points_ppr',
      'rush_wpa', 'total_wpa', 'explosive_run_rate', 'stuff_rate', 'rush_fd_rate', 'goal_line_carries', 'goal_line_td_rate', 'fp_per_game', 'xfp', 'xfp_per_game', 'fpoe', 'xtd', 'td_oe'],
    player: {
      cards: ['rush_epa_per', 'rush_success', 'ryoe_per', 'ypc'],
      summary: { title: 'Receiving', main: 'receiving_yards', unit: 'yds', rate: 'epa_per_target', detail: ['receptions', 'targets', 'receiving_tds'] },
      weekChart: ['rush_epa_per', 'ypc', 'rushing_yards'],
      valueSplit: [{ label: 'Rushing', metric: 'rushing_epa' }, { label: 'Receiving', metric: 'receiving_epa' }],
      gameLog: [
        { group: 'Rushing', columns: ['carries', 'rushing_yards', 'ypc', 'rushing_tds', 'rushing_epa', 'rush_epa_per', 'rush_success'] },
        { group: 'Receiving', columns: ['targets', 'receptions', 'receiving_yards', 'receiving_tds', 'epa_per_target'] },
      ],
      career: [
        { group: 'Overall', columns: ['games', 'total_epa', 'scrimmage_yards'] },
        { group: 'Rushing', columns: ['carries', 'rushing_yards', 'ypc', 'rushing_tds', 'rush_epa_per', 'rush_success'] },
        { group: 'Receiving', columns: ['targets', 'receptions', 'receiving_yards', 'receiving_tds', 'epa_per_target'] },
      ],
      scatter: { x: 'rush_success', y: 'rush_epa_per' },
      scatterOptions: ['rush_epa_per', 'rush_success', 'ryoe_per', 'ypc', 'carries', 'rushing_yards', 'scrimmage_yards', 'epa_per_target', 'targets', 'stacked_box_pct'],
      splits: ['games', 'carries', 'rushing_yards', 'ypc', 'rush_epa_per', 'rush_success', 'receptions', 'receiving_yards'],
      advanced: ['rush_success', 'rush_epa_per', 'ypc', 'ybc_per_att', 'yac_rush_per_att', 'broken_tackles', 'epa_per_target', 'target_share'],
      impact: ['rush_wpa', 'total_wpa', 'explosive_run_rate', 'stuff_rate', 'rush_fd_rate', 'goal_line_carries', 'goal_line_td_rate', 'xfp_per_game', 'fpoe', 'td_oe'],
      ngs: [
        { key: 'ryoe_per_att', label: 'RYOE per carry', format: 'signed2' },
        { key: 'ryoe', label: 'Rush yards over expected', format: 'signed1' },
        { key: 'stacked_box_pct', label: 'Stacked-box rate', format: 'dec1' },
        { key: 'rush_beat_pct', label: 'Carries beating expectation', format: 'pct' },
        { key: 'expected_ypc', label: 'Expected yards per carry', format: 'dec2' },
        { key: 'rush_efficiency', label: 'Rushing efficiency', format: 'dec2' },
        { key: 'time_to_los', label: 'Time behind the line', format: 'dec2' },
      ],
    },
  },
  WR: { title: 'Wide Receiver', plural: 'Wide Receivers', ...RECEIVER },
  TE: {
    title: 'Tight End',
    plural: 'Tight Ends',
    ...RECEIVER,
    qualifier: { metric: 'targets', label: 'Min. targets', perWeek: 4 },
  },
  DL: defender({
    title: 'Defensive Line',
    plural: 'Defensive linemen',
    rankLabel: 'DL',
    qualifier: { metric: 'def_snaps', label: 'Min. snaps', perWeek: 25 },
    leaderCards: [
      { metric: 'def_sacks', label: 'Sacks' },
      { metric: 'def_pressures', label: 'Pressures' },
      { metric: 'def_pressure_rate', label: 'Pressure rate' },
      { metric: 'run_stops', label: 'Run stops' },
    ],
    defaultSort: 'def_sacks',
    columnSets: {
      Standard: [
        { group: 'Usage', columns: ['games', 'def_snaps', 'snap_share'] },
        { group: 'Pass rush', columns: ['def_sacks', 'def_qb_hits', 'def_pressures'] },
        { group: 'Run defense', columns: ['tackles', 'def_tackles_for_loss', 'run_stops'] },
      ],
      Efficiency: [
        { group: 'Usage', columns: ['games', 'def_snaps'] },
        { group: 'Per snap', columns: ['def_pressure_rate', 'havoc_rate', 'stop_rate'] },
        { group: 'Tackling', columns: ['run_tackle_depth', 'missed_tackle_pct'] },
      ],
      Advanced: [
        { group: 'Pass rush', columns: ['def_pressures', 'def_pressure_rate', 'def_sacks', 'def_qb_hits'] },
        { group: 'Disruption', columns: ['havoc', 'havoc_rate', 'def_fumbles_forced', 'def_pass_defended'] },
        { group: 'Run defense', columns: ['run_stops', 'run_tackle_depth'] },
      ],
    },
    player: {
      cards: ['def_sacks', 'def_pressures', 'def_pressure_rate', 'run_stops'],
      summary: { title: 'Tackling', main: 'tackles', unit: 'tkl', rate: null, detail: ['def_tackles_for_loss', 'stops', 'def_fumbles_forced'] },
      weekChart: ['def_pressures', 'def_sacks', 'tackles', 'def_snaps'],
      scatter: { x: 'def_pressure_rate', y: 'stop_rate' },
    },
  }),
  LB: defender({
    title: 'Linebacker',
    plural: 'Linebackers',
    rankLabel: 'LBs',
    qualifier: { metric: 'def_snaps', label: 'Min. snaps', perWeek: 25 },
    leaderCards: [
      { metric: 'tackles', label: 'Tackles' },
      { metric: 'stops', label: 'Stops' },
      { metric: 'run_tackle_depth', label: 'Yards per run tackle' },
      { metric: 'def_pressures', label: 'Pressures' },
    ],
    defaultSort: 'tackles',
    columnSets: {
      Standard: [
        { group: 'Usage', columns: ['games', 'def_snaps', 'snap_share'] },
        { group: 'Tackling', columns: ['tackles', 'stops', 'def_tackles_for_loss'] },
        { group: 'Playmaking', columns: ['def_sacks', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced'] },
      ],
      Efficiency: [
        { group: 'Usage', columns: ['games', 'def_snaps'] },
        { group: 'Per snap', columns: ['stop_rate', 'havoc_rate', 'def_pressure_rate'] },
        { group: 'Tackling', columns: ['run_tackle_depth', 'missed_tackle_pct'] },
        { group: 'Coverage', columns: ['def_yds_per_tgt', 'def_rating_allowed'] },
      ],
      Advanced: [
        { group: 'Run defense', columns: ['run_stops', 'run_tackle_depth', 'def_missed_tackles'] },
        { group: 'Blitzing', columns: ['def_blitzes', 'def_pressures', 'def_sacks'] },
        { group: 'Coverage', columns: ['def_targets', 'def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_rating_allowed'] },
      ],
    },
    player: {
      cards: ['tackles', 'stops', 'run_tackle_depth', 'missed_tackle_pct'],
      summary: { title: 'Coverage', main: 'def_targets', unit: 'targets', rate: null, detail: ['def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_interceptions'] },
      weekChart: ['tackles', 'stops', 'def_pressures', 'def_snaps'],
      scatter: { x: 'stop_rate', y: 'run_tackle_depth' },
    },
  }),
  CB: defender({
    title: 'Cornerback',
    plural: 'Cornerbacks',
    rankLabel: 'CBs',
    qualifier: { metric: 'def_snaps', label: 'Min. snaps', perWeek: 30 },
    leaderCards: [
      { metric: 'def_interceptions', label: 'Interceptions' },
      { metric: 'def_pass_defended', label: 'Passes defended' },
      { metric: 'def_rating_allowed', label: 'Passer rating allowed' },
      { metric: 'def_yds_per_tgt', label: 'Yards per target allowed' },
    ],
    defaultSort: 'def_pass_defended',
    columnSets: {
      Standard: [
        { group: 'Usage', columns: ['games', 'def_snaps', 'snap_share'] },
        { group: 'Coverage', columns: ['def_targets', 'def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_rating_allowed'] },
        { group: 'Ball skills', columns: ['def_interceptions', 'def_pass_defended'] },
        { group: 'Tackling', columns: ['tackles'] },
      ],
      Efficiency: [
        { group: 'Usage', columns: ['games', 'def_snaps'] },
        { group: 'Coverage', columns: ['snaps_per_target', 'def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_yac_allowed', 'def_rating_allowed'] },
        { group: 'Tackling', columns: ['missed_tackle_pct'] },
      ],
      Advanced: [
        { group: 'Coverage', columns: ['def_targets', 'snaps_per_target', 'def_td_allowed', 'def_yac_allowed'] },
        { group: 'Disruption', columns: ['havoc', 'havoc_rate', 'def_fumbles_forced'] },
        { group: 'Tackling', columns: ['tackles', 'def_missed_tackles', 'missed_tackle_pct'] },
      ],
    },
    player: {
      cards: ['def_rating_allowed', 'def_yds_per_tgt', 'def_cmp_pct_allowed', 'def_pass_defended'],
      summary: { title: 'Tackling', main: 'tackles', unit: 'tkl', rate: null, detail: ['stops', 'def_missed_tackles', 'def_fumbles_forced'] },
      weekChart: ['def_targets', 'def_pass_defended', 'tackles', 'def_snaps'],
      scatter: { x: 'def_yds_per_tgt', y: 'def_rating_allowed' },
    },
  }),
  S: defender({
    title: 'Safety',
    plural: 'Safeties',
    rankLabel: 'safeties',
    qualifier: { metric: 'def_snaps', label: 'Min. snaps', perWeek: 30 },
    leaderCards: [
      { metric: 'tackles', label: 'Tackles' },
      { metric: 'def_interceptions', label: 'Interceptions' },
      { metric: 'def_pass_defended', label: 'Passes defended' },
      { metric: 'def_rating_allowed', label: 'Passer rating allowed' },
    ],
    defaultSort: 'tackles',
    columnSets: {
      Standard: [
        { group: 'Usage', columns: ['games', 'def_snaps', 'snap_share'] },
        { group: 'Tackling', columns: ['tackles', 'stops'] },
        { group: 'Ball skills', columns: ['def_interceptions', 'def_pass_defended'] },
        { group: 'Coverage', columns: ['def_targets', 'def_yds_per_tgt', 'def_rating_allowed'] },
      ],
      Efficiency: [
        { group: 'Usage', columns: ['games', 'def_snaps'] },
        { group: 'Per snap', columns: ['stop_rate', 'havoc_rate'] },
        { group: 'Coverage', columns: ['snaps_per_target', 'def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_rating_allowed'] },
        { group: 'Tackling', columns: ['missed_tackle_pct'] },
      ],
      Advanced: [
        { group: 'Coverage', columns: ['def_targets', 'def_td_allowed', 'def_yac_allowed'] },
        { group: 'Run support', columns: ['run_stops', 'run_tackle_depth'] },
        { group: 'Tackling', columns: ['def_missed_tackles', 'missed_tackle_pct'] },
        { group: 'Blitzing', columns: ['def_blitzes', 'def_pressures'] },
      ],
    },
    player: {
      cards: ['tackles', 'def_pass_defended', 'def_rating_allowed', 'missed_tackle_pct'],
      summary: { title: 'Coverage', main: 'def_targets', unit: 'targets', rate: null, detail: ['def_cmp_pct_allowed', 'def_yds_per_tgt', 'def_interceptions'] },
      weekChart: ['tackles', 'def_targets', 'def_pass_defended', 'def_snaps'],
      scatter: { x: 'def_yds_per_tgt', y: 'stop_rate' },
    },
  }),
  OL: {
    title: 'Offensive Line',
    plural: 'Offensive linemen',
    rankLabel: 'linemen',
    qualifier: { metric: 'ol_snaps', label: 'Min. snaps', perWeek: 30 },
    leaderCards: [
      { metric: 'ol_pen_rate', label: 'Fewest penalties per 100 snaps' },
      { metric: 'line_pressure_rate', label: 'Lowest line pressure rate' },
      { metric: 'line_ybc', label: 'Yards before contact per carry' },
      { metric: 'ol_snaps', label: 'Offensive snaps' },
    ],
    defaultSort: 'ol_snaps',
    columnSets: {
      Standard: [
        { group: 'Usage', columns: ['games', 'ol_snaps', 'ol_snap_share'] },
        { group: 'Discipline', columns: ['ol_penalties', 'ol_holding', 'ol_false_starts'] },
        { group: 'Line on the field', columns: ['line_sack_rate', 'line_pressure_rate', 'line_ybc'] },
      ],
      Efficiency: [
        { group: 'Pass protection', columns: ['line_sack_rate', 'line_fault_sack_rate', 'line_pressure_rate', 'line_pass_epa'] },
        { group: 'On his snaps (2016–last season)', columns: ['ol_pressure_on', 'ol_std_pressure', 'ol_sack_rate_on'] },
        { group: 'Run blocking', columns: ['line_ybc', 'line_stuff_rate', 'line_rush_epa'] },
        { group: 'Discipline', columns: ['ol_pen_rate'] },
      ],
    },
    customOptions: ['games', 'ol_snaps', 'ol_snap_share', 'ol_penalties', 'ol_holding', 'ol_false_starts', 'ol_pen_rate',
      'line_sack_rate', 'line_fault_sack_rate', 'line_pressure_rate', 'ol_pressure_on', 'ol_std_pressure', 'ol_sack_rate_on',
      'line_pass_epa', 'line_ybc', 'line_stuff_rate', 'line_rush_epa'],
    player: {
      cards: ['ol_snap_share', 'ol_pen_rate', 'line_pressure_rate', 'line_ybc'],
      weekChart: ['ol_snaps', 'ol_penalties'],
      gameLog: [
        { group: 'Usage', columns: ['ol_snaps', 'ol_snap_share'] },
        { group: 'Discipline', columns: ['ol_penalties', 'ol_holding', 'ol_false_starts'] },
        { group: 'Line on the field', columns: ['line_sack_rate', 'line_stuff_rate', 'line_rush_epa'] },
      ],
      career: [
        { group: 'Overall', columns: ['games', 'ol_snaps', 'ol_snap_share'] },
        { group: 'Discipline', columns: ['ol_penalties', 'ol_holding', 'ol_false_starts', 'ol_pen_rate'] },
        { group: 'Line on the field', columns: ['line_sack_rate', 'line_fault_sack_rate', 'line_pressure_rate', 'line_ybc', 'line_stuff_rate'] },
        { group: 'On his snaps', columns: ['ol_pressure_on', 'ol_std_pressure', 'ol_sack_rate_on'] },
      ],
      scatter: { x: 'line_pressure_rate', y: 'line_ybc' },
      scatterOptions: ['line_pressure_rate', 'ol_pressure_on', 'ol_std_pressure', 'line_sack_rate', 'line_fault_sack_rate', 'line_ybc', 'line_stuff_rate', 'line_rush_epa', 'line_pass_epa',
        'ol_pen_rate', 'ol_snap_share', 'ol_snaps'],
      splits: ['games', 'ol_snaps', 'ol_penalties', 'line_sack_rate', 'line_ybc'],
      advanced: ['ol_snap_share', 'ol_pen_rate', 'line_sack_rate', 'line_fault_sack_rate', 'line_pressure_rate',
        'ol_pressure_on', 'ol_std_pressure', 'ol_sack_rate_on', 'line_pass_epa', 'line_ybc', 'line_stuff_rate', 'line_rush_epa'],
    },
  },
  K: {
    title: 'Kicker',
    plural: 'Kickers',
    rankLabel: 'kickers',
    qualifier: { metric: 'fg_att', label: 'Min. FG attempts', perWeek: 1.2 },
    leaderCards: [
      { metric: 'fg_oe', label: 'Field goals over expected' },
      { metric: 'fg_pct', label: 'Field goal %' },
      { metric: 'fg_50_pct', label: '50+ yard FG %' },
      { metric: 'fg_long', label: 'Longest field goal' },
    ],
    defaultSort: 'fg_oe',
    columnSets: {
      Standard: [
        { group: 'Field goals', columns: ['games', 'fg_made', 'fg_att', 'fg_pct', 'fg_long'] },
        { group: 'Long range', columns: ['fg_50'] },
        { group: 'Extra points', columns: ['pat_pct'] },
        { group: 'Value', columns: ['fg_oe'] },
      ],
      Efficiency: [
        { group: 'Accuracy', columns: ['fg_att', 'fg_pct', 'fg_pct_oe', 'fg_oe'] },
        { group: 'Long range', columns: ['fg_50', 'fg_50_pct'] },
        { group: 'Extra points', columns: ['pat_pct'] },
      ],
    },
    customOptions: ['games', 'fg_made', 'fg_att', 'fg_pct', 'fg_long', 'fg_50', 'fg_50_pct', 'fg_oe', 'fg_pct_oe', 'pat_pct'],
    player: {
      cards: ['fg_oe', 'fg_pct', 'fg_50_pct', 'pat_pct'],
      weekChart: ['fg_made', 'fg_oe'],
      gameLog: [{ group: 'Kicking', columns: ['fg_made', 'fg_att', 'fg_pct', 'fg_long', 'fg_50', 'fg_oe', 'pat_pct'] }],
      career: [
        { group: 'Overall', columns: ['games'] },
        { group: 'Kicking', columns: ['fg_made', 'fg_att', 'fg_pct', 'fg_long', 'fg_50', 'fg_50_pct', 'fg_oe', 'pat_pct'] },
      ],
      scatter: { x: 'fg_50_pct', y: 'fg_pct_oe' },
      scatterOptions: ['fg_pct', 'fg_pct_oe', 'fg_oe', 'fg_50_pct', 'fg_att', 'pat_pct'],
      splits: ['games', 'fg_made', 'fg_att', 'fg_pct', 'fg_oe', 'pat_pct'],
    },
  },
  OTHER: {
    title: 'Player',
    plural: 'Players',
    player: {
      cards: ['games', 'scrimmage_yards', 'total_epa'],
      weekChart: ['scrimmage_yards'],
      gameLog: [{ group: 'Stats', columns: ['carries', 'rushing_yards', 'targets', 'receptions', 'receiving_yards', 'tackles'] }],
      career: [{ group: 'Overall', columns: ['games', 'scrimmage_yards', 'total_epa', 'tackles'] }],
      splits: ['games', 'scrimmage_yards', 'total_epa'],
    },
  },
};

export function qualifierMinimum(position, weeks) {
  const q = POSITIONS[position]?.qualifier;
  return q ? Math.round((q.perWeek * Math.max(weeks, 1)) / 5) * 5 : 0;
}

export function flattenColumns(groups) {
  return groups.flatMap((g) => g.columns.map((key) => ({ ...METRICS[key], key, group: g.group })));
}
