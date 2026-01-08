import { TableHead, TableBody, TableRow, TableCell, Chip, Select, MenuItem, FormControl, InputLabel, Tooltip, Box } from '@mui/material';
import StatsTableWrapper from './StatsTableWrapper';
import {
  displayStat,
  formatNumber,
  calculateCompletionPercentage,
  shouldShowPassingColumns,
  shouldShowRushingColumns,
  shouldShowReceivingColumns,
} from '../utils/statsUtils';

/**
 * WeeklyStatsTable component - displays week-by-week stats for current season
 */
export default function WeeklyStatsTable({ 
  weeklyStats, 
  position, 
  playerStats, 
  loading,
  selectedYear,
  onYearChange,
  availableYears = [2025]
}) {
  // Debug: print the weeklyStats data to verify structure and values
  console.log('[WeeklyStatsTable] weeklyStats:', weeklyStats);

  const showPassing = shouldShowPassingColumns(position);
  const showRushing = shouldShowRushingColumns(position, playerStats);
  const showReceiving = shouldShowReceivingColumns(position);

  if (!weeklyStats || weeklyStats.length === 0) return null;

  // Use 'attempts' instead of 'passing_attempts', and use passing_cpoe for CPOE
  const weeklyData = weeklyStats.filter(stat => stat.week !== null).map(stat => ({
    ...stat,
    attempts: stat.attempts ?? stat.passing_attempts ?? 0,
    cpoe: stat.passing_cpoe !== undefined ? Number(stat.passing_cpoe).toFixed(3) : (stat.cpoe !== undefined ? Number(stat.cpoe).toFixed(3) : stat.cpoe),
    passing_epa: stat.passing_epa !== undefined ? Number(stat.passing_epa).toFixed(3) : stat.passing_epa,
    passing_epa_per_play: stat.passing_epa_per_play !== undefined ? Number(stat.passing_epa_per_play).toFixed(3) : stat.passing_epa_per_play,
    rushing_epa: stat.rushing_epa !== undefined ? Number(stat.rushing_epa).toFixed(3) : stat.rushing_epa,
    rushing_epa_per_play: stat.rushing_epa_per_play !== undefined ? Number(stat.rushing_epa_per_play).toFixed(3) : stat.rushing_epa_per_play,
    // Defensive stat mappings (backend to frontend)
    def_tackles_solo: stat.def_tackles_solo != null ? stat.def_tackles_solo : (stat.solo_tackles != null ? stat.solo_tackles : 0),
    def_tackle_assists: stat.def_tackle_assists != null ? stat.def_tackle_assists : (stat.tackle_assists != null ? stat.tackle_assists : 0),
    def_tackles_for_loss: stat.def_tackles_for_loss != null ? stat.def_tackles_for_loss : (stat.tfl != null ? stat.tfl : 0),
    def_tackles_for_loss_yards: stat.def_tackles_for_loss_yards != null ? stat.def_tackles_for_loss_yards : (stat.tfl_yards != null ? stat.tfl_yards : 0),
    def_fumbles_forced: stat.def_fumbles_forced != null ? stat.def_fumbles_forced : (stat.fumbles_forced != null ? stat.fumbles_forced : 0),
    def_sacks: stat.def_sacks != null ? stat.def_sacks : (stat.sacks != null ? stat.sacks : 0),
    def_sack_yards: stat.def_sack_yards != null ? stat.def_sack_yards : (stat.sack_yards != null ? stat.sack_yards : 0),
    def_qb_hits: stat.def_qb_hits != null ? stat.def_qb_hits : (stat.qb_hits != null ? stat.qb_hits : 0),
    def_interceptions: stat.def_interceptions != null ? stat.def_interceptions : (stat.ints != null ? stat.ints : 0),
    def_interception_yards: stat.def_interception_yards != null ? stat.def_interception_yards : (stat.int_yards != null ? stat.int_yards : 0),
    def_pass_defended: stat.def_pass_defended != null ? stat.def_pass_defended : (stat.passes_defended != null ? stat.passes_defended : 0),
    def_tds: stat.def_tds != null ? stat.def_tds : (stat.def_td != null ? stat.def_td : 0),
    def_fumbles: stat.def_fumbles != null ? stat.def_fumbles : (stat.fumbles != null ? stat.fumbles : 0),
    def_safeties: stat.def_safeties != null ? stat.def_safeties : (stat.safeties != null ? stat.safeties : 0),
    penalties: Number(stat.penalties) || 0,
    penalty_yards: Number(stat.penalty_yards) || 0,
    punt_returns: Number(stat.punt_returns) || 0,
    punt_return_yards: Number(stat.punt_return_yards) || 0,
    kickoff_returns: Number(stat.kickoff_returns) || 0,
    kickoff_return_yards: Number(stat.kickoff_return_yards) || 0,
    fumble_recovery_own: Number(stat.fumble_recovery_own) || 0,
    fumble_recovery_opp: Number(stat.fumble_recovery_opp) || 0,
    fumble_recovery_yards_own: Number(stat.fumble_recovery_yards_own) || 0,
    fumble_recovery_yards_opp: Number(stat.fumble_recovery_yards_opp) || 0,
    fumble_recovery_tds: Number(stat.fumble_recovery_tds) || 0,
  }));

  // Calculate season totals and averages using new schema
  // Calculate season totals and averages using new schema
  const seasonTotals = weeklyData.reduce((totals, stat) => {
    const gamesPlayed = (totals.gamesPlayed || 0) + 1;
    return {
      gamesPlayed,
      // Passing totals
      passing_yards: (totals.passing_yards || 0) + (stat.passing_yards || 0),
      passing_tds: (totals.passing_tds || 0) + (stat.passing_tds || 0),
      passing_interceptions: (totals.passing_interceptions || 0) + (stat.passing_interceptions || 0),
      sacks_suffered: (totals.sacks_suffered || 0) + (stat.sacks_suffered || 0),
      attempts: (totals.attempts || 0) + (stat.attempts || 0),
      completions: (totals.completions || 0) + (stat.completions || 0),
      passing_epa: (totals.passing_epa || 0) + (Number(stat.passing_epa) || 0),
      // Rushing totals
      carries: (totals.carries || 0) + (stat.carries || 0),
      rushing_yards: (totals.rushing_yards || 0) + (stat.rushing_yards || 0),
      rushing_tds: (totals.rushing_tds || 0) + (stat.rushing_tds || 0),
      rushing_epa: (totals.rushing_epa || 0) + (Number(stat.rushing_epa) || 0),
      // Receiving totals
      targets: (totals.targets || 0) + (stat.targets || 0),
      receptions: (totals.receptions || 0) + (stat.receptions || 0),
      receiving_yards: (totals.receiving_yards || 0) + (stat.receiving_yards || 0),
      receiving_tds: (totals.receiving_tds || 0) + (stat.receiving_tds || 0),
      receiving_epa: (totals.receiving_epa || 0) + (stat.receiving_epa || 0),
      // Defensive totals
      def_tackles_solo: (totals.def_tackles_solo || 0) + (stat.def_tackles_solo || 0),
      def_tackle_assists: (totals.def_tackle_assists || 0) + (stat.def_tackle_assists || 0),
      def_tackles_for_loss: (totals.def_tackles_for_loss || 0) + (stat.def_tackles_for_loss || 0),
      def_tackles_for_loss_yards: (totals.def_tackles_for_loss_yards || 0) + (stat.def_tackles_for_loss_yards || 0),
      def_fumbles_forced: (totals.def_fumbles_forced || 0) + (stat.def_fumbles_forced || 0),
      def_sacks: (totals.def_sacks || 0) + (stat.def_sacks || 0),
      def_sack_yards: (totals.def_sack_yards || 0) + (stat.def_sack_yards || 0),
      def_qb_hits: (totals.def_qb_hits || 0) + (stat.def_qb_hits || 0),
      def_interceptions: (totals.def_interceptions || 0) + (stat.def_interceptions || 0),
      def_interception_yards: (totals.def_interception_yards || 0) + (stat.def_interception_yards || 0),
      def_pass_defended: (totals.def_pass_defended || 0) + (stat.def_pass_defended || 0),
      def_tds: (totals.def_tds || 0) + (stat.def_tds || 0),
      def_fumbles: (totals.def_fumbles || 0) + (stat.def_fumbles || 0),
      def_safeties: (totals.def_safeties || 0) + (stat.def_safeties || 0),
      penalties: (totals.penalties || 0) + (stat.penalties || 0),
      penalty_yards: (totals.penalty_yards || 0) + (stat.penalty_yards || 0),
      punt_returns: (totals.punt_returns || 0) + (stat.punt_returns || 0),
      punt_return_yards: (totals.punt_return_yards || 0) + (stat.punt_return_yards || 0),
      kickoff_returns: (totals.kickoff_returns || 0) + (stat.kickoff_returns || 0),
      kickoff_return_yards: (totals.kickoff_return_yards || 0) + (stat.kickoff_return_yards || 0),
      fumble_recovery_own: (totals.fumble_recovery_own || 0) + (stat.fumble_recovery_own || 0),
      fumble_recovery_yards_own: (totals.fumble_recovery_yards_own || 0) + (stat.fumble_recovery_yards_own || 0),
      fumble_recovery_opp: (totals.fumble_recovery_opp || 0) + (stat.fumble_recovery_opp || 0),
      fumble_recovery_yards_opp: (totals.fumble_recovery_yards_opp || 0) + (stat.fumble_recovery_yards_opp || 0),
      fumble_recovery_tds: (totals.fumble_recovery_tds || 0) + (stat.fumble_recovery_tds || 0),
      // For averages (sum up for later division)
      passing_epa_per_play_sum: (totals.passing_epa_per_play_sum || 0) + ((stat.passing_epa_per_play != null && stat.attempts && Number(stat.attempts) > 0) ? Number(stat.passing_epa_per_play) : 0),
      cpoe_sum: (totals.cpoe_sum || 0) + ((stat.cpoe != null && stat.attempts && Number(stat.attempts) > 0) ? Number(stat.cpoe) : 0),
      rushing_epa_per_play_sum: (totals.rushing_epa_per_play_sum || 0) + ((stat.rushing_epa_per_play != null && stat.carries && Number(stat.carries) > 0) ? Number(stat.rushing_epa_per_play) : 0),
      receiving_epa_per_play_sum: (totals.receiving_epa_per_play_sum || 0) + ((stat.receiving_epa_per_play != null && stat.receptions && Number(stat.receptions) > 0) ? Number(stat.receiving_epa_per_play) : 0),
      // Count non-null values for proper averaging
      passing_epa_per_play_count: (totals.passing_epa_per_play_count || 0) + ((stat.passing_epa_per_play != null && stat.attempts && Number(stat.attempts) > 0) ? 1 : 0),
      cpoe_count: (totals.cpoe_count || 0) + ((stat.cpoe != null && stat.attempts && Number(stat.attempts) > 0) ? 1 : 0),
      rushing_epa_per_play_count: (totals.rushing_epa_per_play_count || 0) + ((stat.rushing_epa_per_play != null && stat.carries && Number(stat.carries) > 0) ? 1 : 0),
      receiving_epa_per_play_count: (totals.receiving_epa_per_play_count || 0) + ((stat.receiving_epa_per_play != null && stat.receptions && Number(stat.receptions) > 0) ? 1 : 0),
    };
  }, { gamesPlayed: 0 });

  // Calculate averages
  const seasonAverages = {
    passing_epa_per_play: seasonTotals.passing_epa_per_play_count > 0 
      ? (seasonTotals.passing_epa_per_play_sum / seasonTotals.passing_epa_per_play_count).toFixed(3) : null,
    cpoe: seasonTotals.cpoe_count > 0 
      ? (seasonTotals.cpoe_sum / seasonTotals.cpoe_count).toFixed(3) : null,
    rushing_epa_per_play: seasonTotals.rushing_epa_per_play_count > 0 
      ? (seasonTotals.rushing_epa_per_play_sum / seasonTotals.rushing_epa_per_play_count).toFixed(3) : null,
    receiving_epa_per_play: seasonTotals.receiving_epa_per_play_count > 0 
      ? (seasonTotals.receiving_epa_per_play_sum / seasonTotals.receiving_epa_per_play_count).toFixed(3) : null,
  };

  // Values used in the "Season Total" row. Most columns are true totals, but some
  // (like CPOE) should be shown as an average across games.
  const seasonTotalsForDisplay = {
    ...seasonTotals,
    cpoe: seasonTotals.cpoe_count > 0 ? (seasonTotals.cpoe_sum / seasonTotals.cpoe_count) : null,
  };

  const averageIndicatorByLabel = {
    // Summary-row values that are rates/averages (not simple sums)
    'Cmp %': 'Rate/average (not a sum)',
    'Yds/Att': 'Rate/average (not a sum)',
    'EPA/Play': 'Rate/average (not a sum)',
    'Rec EPA/Rec': 'Rate/average (not a sum)',
    CPOE: 'Average across games',
    'Rush Yds/Att': 'Rate/average (not a sum)',
    'Rush EPA/Play': 'Rate/average (not a sum)',
    'Catch %': 'Rate/average (not a sum)',
    'Yds/Catch': 'Rate/average (not a sum)',
    'FG %': 'Rate/average (not a sum)',
    'XP %': 'Rate/average (not a sum)',
  };

  // Column definitions matching YearlyStatsTable
  const pct = (value) => (value === '-' ? '-' : `${value}%`);
  const completionPct = (comp, att) => (att ? pct(((comp / att) * 100).toFixed(1)) : '-');
  const yardsPerAttempt = (yards, att) => att ? (yards / att).toFixed(2) : '-';
  const roundEPA = val => (val !== null && val !== undefined && !isNaN(val)) ? Number(val).toFixed(3) : '-';
  const roundCPOE = val => (val !== null && val !== undefined && !isNaN(val)) ? pct(Number(val).toFixed(3)) : '-';
  const epaPerPlay = (epa, att) => att ? (Number(epa) / Number(att)).toFixed(3) : '-';
  const catchPct = (rec, tgt) => (tgt ? pct(((rec / tgt) * 100).toFixed(1)) : '-');
  const receivingYdsPerAttempt = (yards, att) => att ? (yards / att).toFixed(2) : '-';

  const hasNonZero = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && Math.abs(n) > 0;
  };

  const showPuntReturns = weeklyData.some(
    (stat) => hasNonZero(stat.punt_returns) || hasNonZero(stat.punt_return_yards)
  );
  const showKickReturns = weeklyData.some(
    (stat) => hasNonZero(stat.kickoff_returns) || hasNonZero(stat.kickoff_return_yards)
  );

  const showFumbleRecovery = weeklyData.some(
    (stat) =>
      hasNonZero(stat.fumble_recovery_own) ||
      hasNonZero(stat.fumble_recovery_opp) ||
      hasNonZero(stat.fumble_recovery_yards_own) ||
      hasNonZero(stat.fumble_recovery_yards_opp) ||
      hasNonZero(stat.fumble_recovery_tds)
  );

  // QB columns
  const columnsQB = [
    { label: 'Week', value: stat => `Wk ${stat.week}` },
    { label: 'Cmp', value: stat => displayStat(stat.completions) },
    { label: 'Att', value: stat => displayStat(stat.attempts) },
    { label: 'Cmp %', value: stat => completionPct(stat.completions, stat.attempts) },
    { label: 'Pass Yds', value: stat => displayStat(stat.passing_yards) },
    { label: 'Yds/Att', value: stat => yardsPerAttempt(stat.passing_yards, stat.attempts) },
    { label: 'Pass TD', value: stat => displayStat(stat.passing_tds) },
    { label: 'INT', value: stat => displayStat(stat.passing_interceptions) },
    { label: 'Sacks', value: stat => displayStat(stat.sacks_suffered) },
    { label: 'Pass EPA', value: stat => roundEPA(stat.passing_epa) },
    { label: 'EPA/Play', value: stat => epaPerPlay(stat.passing_epa, stat.attempts) },
    { label: 'CPOE', value: stat => roundCPOE(stat.cpoe) },
    { label: 'Carries', value: stat => displayStat(stat.carries) },
    { label: 'Rush Yds', value: stat => displayStat(stat.rushing_yards) },
    { label: 'Rush Yds/Att', value: stat => yardsPerAttempt(stat.rushing_yards, stat.carries) },
    { label: 'Rush TD', value: stat => displayStat(stat.rushing_tds) },
    { label: 'Rush EPA', value: stat => roundEPA(stat.rushing_epa) },
    { label: 'Rush EPA/Play', value: stat => epaPerPlay(stat.rushing_epa, stat.carries) },
  ];

  // WR/TE columns
  const columnsWRTE = [
    { label: 'Week', value: stat => `Wk ${stat.week}` },
    { label: 'Rec', value: stat => displayStat(stat.receptions) },
    { label: 'Tgt', value: stat => displayStat(stat.targets) },
    { label: 'Catch %', value: stat => catchPct(stat.receptions, stat.targets) },
    { label: 'Yds/Catch', value: stat => receivingYdsPerAttempt(stat.receiving_yards, stat.receptions) },
    { label: 'Receiving Yds', value: stat => displayStat(stat.receiving_yards) },
    { label: 'Rec EPA', value: stat => roundEPA(stat.receiving_epa) },
    { label: 'Rec EPA/Rec', value: stat => epaPerPlay(stat.receiving_epa, stat.receptions) },
  ];

  // RB columns
  const columnsRB = [
    { label: 'Week', value: stat => `Wk ${stat.week}` },
    { label: 'Rec', value: stat => displayStat(stat.receptions) },
    { label: 'Tgt', value: stat => displayStat(stat.targets) },
    { label: 'Catch %', value: stat => catchPct(stat.receptions, stat.targets) },
    { label: 'Yds/Catch', value: stat => receivingYdsPerAttempt(stat.receiving_yards, stat.receptions) },
    { label: 'Receiving Yds', value: stat => displayStat(stat.receiving_yards) },
    { label: 'Rec EPA', value: stat => roundEPA(stat.receiving_epa) },
    { label: 'Rec EPA/Rec', value: stat => epaPerPlay(stat.receiving_epa, stat.receptions) },
    { label: 'Carries', value: stat => displayStat(stat.carries) },
    { label: 'Rush Yds/Att', value: stat => yardsPerAttempt(stat.rushing_yards, stat.carries) },
    { label: 'Rush Yds', value: stat => displayStat(stat.rushing_yards) },
    { label: 'Rush TD', value: stat => displayStat(stat.rushing_tds) },
    { label: 'Rush EPA/Play', value: stat => epaPerPlay(stat.rushing_epa, stat.carries) },
  ];

  // Kicker columns
  const columnsK = [
    { label: 'Week', value: stat => `Wk ${stat.week}` },
    { label: 'FG Made', value: stat => displayStat(stat.fg_made) },
    { label: 'FG Att', value: stat => displayStat(stat.fg_att) },
    { label: 'FG %', value: stat => stat.fg_att ? pct(((stat.fg_made / stat.fg_att) * 100).toFixed(1)) : '-' },
    { label: 'XP Made', value: stat => displayStat(stat.xp_made) },
    { label: 'XP Att', value: stat => displayStat(stat.xp_att) },
    { label: 'XP %', value: stat => stat.xp_att ? pct(((stat.xp_made / stat.xp_att) * 100).toFixed(1)) : '-' },
    { label: 'Points', value: stat => displayStat(stat.kicking_points) },
  ];

  // Defense columns
  const columnsDEF = [
    { label: 'Week', value: stat => `Wk ${stat.week}` },
    { label: 'Solo Tackles', value: stat => displayStat(stat.def_tackles_solo) },
    { label: 'Tackle Assists', value: stat => displayStat(stat.def_tackle_assists) },
    { label: 'Total Tackles', value: stat => displayStat((Number(stat.def_tackles_solo) || 0) + (Number(stat.def_tackle_assists) || 0)) },
    { label: 'TFL', value: stat => displayStat(stat.def_tackles_for_loss) },
    { label: 'TFL Yards', value: stat => displayStat(stat.def_tackles_for_loss_yards) },
    { label: 'Fumbles Forced', value: stat => displayStat(stat.def_fumbles_forced) },
    { label: 'Sacks', value: stat => displayStat(stat.def_sacks) },
    { label: 'Sack Yards', value: stat => displayStat(stat.def_sack_yards) },
    { label: 'QB Hits', value: stat => displayStat(stat.def_qb_hits) },
    { label: 'INT', value: stat => displayStat(stat.def_interceptions) },
    { label: 'INT Yards', value: stat => displayStat(stat.def_interception_yards) },
    { label: 'Passes Defended', value: stat => displayStat(stat.def_pass_defended) },
    { label: 'Def TD', value: stat => displayStat(stat.def_tds) },
    { label: 'Fumbles', value: stat => displayStat(stat.def_fumbles) },
    { label: 'Safeties', value: stat => displayStat(stat.def_safeties) },
    { label: 'Penalties', value: stat => displayStat(stat.penalties) },
    { label: 'Penalty Yards', value: stat => displayStat(stat.penalty_yards) },
    ...(showPuntReturns
      ? [
          { label: 'Punt Returns', value: stat => displayStat(stat.punt_returns) },
          { label: 'Punt Return Yards', value: stat => displayStat(stat.punt_return_yards) },
        ]
      : []),
    ...(showKickReturns
      ? [
          { label: 'Kick Returns', value: stat => displayStat(stat.kickoff_returns) },
          { label: 'Kick Return Yards', value: stat => displayStat(stat.kickoff_return_yards) },
        ]
      : []),
    ...(showFumbleRecovery
      ? [
          { label: 'FR Own', value: stat => displayStat(stat.fumble_recovery_own) },
          { label: 'FR Opp', value: stat => displayStat(stat.fumble_recovery_opp) },
          { label: 'FR Yds Own', value: stat => displayStat(stat.fumble_recovery_yards_own) },
          { label: 'FR Yds Opp', value: stat => displayStat(stat.fumble_recovery_yards_opp) },
          { label: 'FR TD', value: stat => displayStat(stat.fumble_recovery_tds) },
        ]
      : []),
  ];

  // Fullback columns (similar to RB, but can be customized)
  const columnsFB = [
    { label: 'Week', value: stat => `Wk ${stat.week}` },
    { label: 'Rec', value: stat => displayStat(stat.receptions) },
    { label: 'Tgt', value: stat => displayStat(stat.targets) },
    { label: 'Catch %', value: stat => catchPct(stat.receptions, stat.targets) },
    { label: 'Receiving Yds', value: stat => displayStat(stat.receiving_yards) },
    { label: 'Rush Yds', value: stat => displayStat(stat.rushing_yards) },
    { label: 'Rush TD', value: stat => displayStat(stat.rushing_tds) },
  ];

  // Fallback columns (basic info)
  const columnsBasic = [
    { label: 'Week', value: stat => `Wk ${stat.week}` },
    { label: 'Snaps', value: stat => displayStat(stat.snaps) },
  ];

  // Defensive positions (case-insensitive)
  const defensivePositions = [
    'CB', 'S', 'FS', 'SS', 'LB', 'ILB', 'OLB', 'DE', 'DT', 'NT', 'DL', 'DB', 'SAF', 'COR', 'MLB', 'WLB', 'SLB', 'EDGE'
  ];
  let columns;
  if (position === 'QB') columns = columnsQB;
  else if (position === 'RB') columns = columnsRB;
  else if (position === 'WR' || position === 'TE') columns = columnsWRTE;
  else if (position === 'K') columns = columnsK;
  else if (position === 'DEF' || position === 'DST' || (position && defensivePositions.includes(position.toUpperCase()))) columns = columnsDEF;
  else if (position === 'FB') columns = columnsFB;
  else columns = columnsBasic;

  return (
    <StatsTableWrapper
      title="Season Metrics"
      subtitle={`Week-by-week performance for ${selectedYear}`}
      loading={loading}
      dataLength={weeklyData.length}
      headerAction={
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Year</InputLabel>
          <Select
            value={selectedYear}
            onChange={(e) => onYearChange(e.target.value)}
            sx={{
              color: 'text.primary',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255, 255, 255, 0.23)',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main',
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: 'primary.main',
              },
            }}
          >
            {availableYears.map(year => (
              <MenuItem key={year} value={year}>
                {year}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      }
    >
      <TableHead>
        <TableRow>
          {columns.map((col, idx) => (
            <TableCell key={col.label} align={idx === 0 ? "left" : "right"}>{col.label}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {weeklyData.map((stat) => (
          <TableRow key={`${stat.season}-${stat.week}`} hover>
            {columns.map((col, idx) => (
              <TableCell key={col.label} align={idx === 0 ? "left" : "right"}>{col.value(stat)}</TableCell>
            ))}
          </TableRow>
        ))}
        {/* Season Totals Row */}
        {weeklyData.length > 0 && (
          <TableRow
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              '& td': {
                fontWeight: 'bold',
                fontSize: '0.95rem',
              },
            }}
          >
            {columns.map((col, idx) => (
              <TableCell key={col.label} align={idx === 0 ? "left" : "right"}>
                {idx === 0 ? (
                  <Chip
                    label="Season Total"
                    size="medium"
                    variant="outlined"
                    sx={{ 
                      borderColor: '#ffffff',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                    }}
                  />
                ) : averageIndicatorByLabel[col.label] ? (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                    <Tooltip title={averageIndicatorByLabel[col.label]} arrow>
                      <Chip
                        label="avg"
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 18,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          borderColor: 'divider',
                          color: 'text.secondary',
                        }}
                      />
                    </Tooltip>
                    <span>{
                      // Use filtered averages for these columns
                      col.label === 'EPA/Play' ? epaPerPlay(seasonTotals.passing_epa, seasonTotals.attempts) :
                      col.label === 'Rush EPA/Play' ? epaPerPlay(seasonTotals.rushing_epa, seasonTotals.carries) :
                      col.label === 'Rec EPA/Rec' ? epaPerPlay(seasonTotals.receiving_epa, seasonTotals.receptions) :
                      col.label === 'CPOE' ? (seasonTotals.cpoe_count > 0 ? (seasonTotals.cpoe_sum / seasonTotals.cpoe_count).toFixed(3) + '%' : '-') :
                      col.label === 'Rush Yds/Att' ? (seasonTotals.carries > 0 ? (seasonTotals.rushing_yards / seasonTotals.carries).toFixed(2) : '-') :
                      col.label === 'Yds/Att' ? (seasonTotals.attempts > 0 ? (seasonTotals.passing_yards / seasonTotals.attempts).toFixed(2) : '-') :
                      col.label === 'Catch %' ? (seasonTotals.targets > 0 ? ((seasonTotals.receptions / seasonTotals.targets) * 100).toFixed(1) + '%' : '-') :
                      col.label === 'Yds/Catch' ? (seasonTotals.receptions > 0 ? (seasonTotals.receiving_yards / seasonTotals.receptions).toFixed(2) : '-') :
                      col.value(seasonTotalsForDisplay)
                    }</span>
                  </Box>
                ) : (
                  // Always use col.value(seasonTotalsForDisplay) for non-average columns
                  col.value(seasonTotalsForDisplay)
                )}
              </TableCell>
            ))}
          </TableRow>
        )}
      </TableBody>
    </StatsTableWrapper>
  );
}
