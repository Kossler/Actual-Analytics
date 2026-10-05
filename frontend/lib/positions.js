// Per-position layout: leaderboard columns, leader cards, qualification, and player-page sections.
import { METRICS } from './metrics';

export const LEADERBOARD_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

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
      { group: 'Next Gen Stats', columns: ['separation', 'yac_over_expected'] },
      { group: 'Value', columns: ['receiving_epa', 'epa_per_target'] },
    ],
  },
  customOptions: ['games', 'targets', 'receptions', 'receiving_yards', 'receiving_tds', 'catch_pct', 'ypr', 'ypt',
    'receiving_epa', 'epa_per_target', 'target_success', 'target_share', 'air_yards_share', 'wopr', 'adot_rec',
    'yac_per_rec', 'separation', 'yac_over_expected', 'carries', 'rushing_yards', 'fantasy_points_ppr'],
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
    advanced: ['target_success', 'epa_per_target', 'adot_rec', 'yac_per_rec', 'target_share', 'air_yards_share', 'wopr'],
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
        { group: 'Passing', columns: ['dropbacks', 'adot', 'time_to_throw', 'aggressiveness'] },
        { group: 'Value', columns: ['pass_epa', 'epa_per_play', 'cpoe'] },
        { group: 'Rushing', columns: ['carries', 'rushing_yards', 'rushing_epa'] },
      ],
    },
    customOptions: ['games', 'completions', 'attempts', 'cmp_pct', 'passing_yards', 'passing_tds', 'interceptions', 'sacks',
      'ypa', 'anya', 'td_rate', 'int_rate', 'sack_rate', 'dropbacks', 'pass_epa', 'epa_per_play', 'cpoe', 'dropback_success',
      'adot', 'time_to_throw', 'aggressiveness', 'carries', 'rushing_yards', 'rushing_tds', 'rushing_epa', 'total_epa', 'fantasy_points_ppr'],
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
      advanced: ['dropbacks', 'dropback_success', 'epa_per_play', 'cpoe', 'adot', 'sack_rate', 'td_rate', 'int_rate'],
      ngs: [
        { key: 'time_to_throw', label: 'Time to throw', format: 'dec2' },
        { key: 'aggressiveness', label: 'Aggressiveness', format: 'dec1' },
        { key: 'intended_air_yards', label: 'Intended air yards', format: 'dec1' },
        { key: 'completed_air_yards', label: 'Completed air yards', format: 'dec1' },
        { key: 'cpoe_ngs', label: 'NGS CPOE', format: 'signed1' },
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
        { group: 'Rushing', columns: ['carries', 'ryoe', 'ryoe_per', 'stacked_box_pct'] },
        { group: 'Value', columns: ['total_epa', 'rushing_epa', 'receiving_epa'] },
        { group: 'Role', columns: ['target_share', 'scrimmage_yards', 'fantasy_points_ppr'] },
      ],
    },
    customOptions: ['games', 'carries', 'rushing_yards', 'ypc', 'rushing_tds', 'rushing_epa', 'rush_epa_per', 'rush_success',
      'ryoe', 'ryoe_per', 'stacked_box_pct', 'targets', 'receptions', 'receiving_yards', 'receiving_tds', 'catch_pct', 'ypt',
      'epa_per_target', 'target_share', 'scrimmage_yards', 'touches', 'total_epa', 'fantasy_points_ppr'],
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
      advanced: ['rush_success', 'rush_epa_per', 'ypc', 'target_success', 'epa_per_target', 'target_share', 'touches'],
      ngs: [
        { key: 'ryoe_per_att', label: 'RYOE per carry', format: 'signed2' },
        { key: 'ryoe', label: 'Rush yards over expected', format: 'signed1' },
        { key: 'stacked_box_pct', label: 'Stacked-box rate', format: 'dec1' },
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
  DEF: {
    title: 'Defender',
    plural: 'Defenders',
    player: {
      cards: ['tackles', 'def_sacks', 'def_qb_hits', 'def_pass_defended'],
      summary: { title: 'Takeaways', main: 'def_interceptions', unit: 'INT', detail: ['def_fumbles_forced', 'def_tds'] },
      weekChart: ['tackles', 'def_sacks', 'def_qb_hits'],
      gameLog: [{ group: 'Defense', columns: ['tackles', 'def_tackles_for_loss', 'def_sacks', 'def_qb_hits', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'def_tds'] }],
      career: [
        { group: 'Overall', columns: ['games'] },
        { group: 'Defense', columns: ['tackles', 'def_tackles_for_loss', 'def_sacks', 'def_qb_hits', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'def_tds'] },
      ],
      splits: ['games', 'tackles', 'def_sacks', 'def_qb_hits', 'def_interceptions', 'def_pass_defended'],
    },
  },
  K: {
    title: 'Kicker',
    plural: 'Kickers',
    player: {
      cards: ['fg_made', 'fg_pct', 'fg_long', 'pat_pct'],
      weekChart: ['fg_made'],
      gameLog: [{ group: 'Kicking', columns: ['fg_made', 'fg_att', 'fg_pct', 'fg_long', 'pat_pct'] }],
      career: [
        { group: 'Overall', columns: ['games'] },
        { group: 'Kicking', columns: ['fg_made', 'fg_att', 'fg_pct', 'fg_long', 'pat_pct'] },
      ],
      splits: ['games', 'fg_made', 'fg_att', 'fg_pct', 'pat_pct'],
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
