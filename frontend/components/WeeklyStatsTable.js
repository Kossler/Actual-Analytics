import { TableHead, TableBody, TableRow, TableCell, Chip, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
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
  const showPassing = shouldShowPassingColumns(position);
  const showRushing = shouldShowRushingColumns(position, playerStats);
  const showReceiving = shouldShowReceivingColumns(position);

  if (!weeklyStats || weeklyStats.length === 0) return null;

  const weeklyData = weeklyStats.filter(stat => stat.week !== null);

  // Calculate season totals and averages
  const seasonTotals = weeklyData.reduce((totals, stat) => {
    const gamesPlayed = totals.gamesPlayed + 1;
    return {
      gamesPlayed,
      // Passing totals
      passingYds: (totals.passingYds || 0) + (stat.passingYds || 0),
      passing_tds: (totals.passing_tds || 0) + (stat.passing_tds || 0),
      passing_interceptions: (totals.passing_interceptions || 0) + (stat.passing_interceptions || 0),
      passing_sacks: (totals.passing_sacks || 0) + (stat.passing_sacks || 0),
      passing_attempts: (totals.passing_attempts || 0) + (stat.passing_attempts || 0),
      passing_completions: (totals.passing_completions || 0) + (stat.passing_completions || 0),
      passing_epa: (totals.passing_epa || 0) + (stat.passing_epa || 0),
      // Rushing totals
      rushing_attempts: (totals.rushing_attempts || 0) + (stat.rushing_attempts || 0),
      rushingYds: (totals.rushingYds || 0) + (stat.rushingYds || 0),
      rushing_tds: (totals.rushing_tds || 0) + (stat.rushing_tds || 0),
      rushing_epa: (totals.rushing_epa || 0) + (stat.rushing_epa || 0),
      // Receiving totals
      targets: (totals.targets || 0) + (stat.targets || 0),
      receptions: (totals.receptions || 0) + (stat.receptions || 0),
      receivingYds: (totals.receivingYds || 0) + (stat.receivingYds || 0),
      receiving_tds: (totals.receiving_tds || 0) + (stat.receiving_tds || 0),
      receiving_epa: (totals.receiving_epa || 0) + (stat.receiving_epa || 0),
      // For averages (sum up for later division)
      passing_epa_per_play_sum: (totals.passing_epa_per_play_sum || 0) + (stat.passing_epa_per_play || 0),
      passing_success_rate_sum: (totals.passing_success_rate_sum || 0) + (stat.passing_success_rate || 0),
      cpoe_sum: (totals.cpoe_sum || 0) + (stat.cpoe || 0),
      rushing_epa_per_play_sum: (totals.rushing_epa_per_play_sum || 0) + (stat.rushing_epa_per_play || 0),
      rushing_success_rate_sum: (totals.rushing_success_rate_sum || 0) + (stat.rushing_success_rate || 0),
      receiving_epa_per_play_sum: (totals.receiving_epa_per_play_sum || 0) + (stat.receiving_epa_per_play || 0),
      receiving_success_rate_sum: (totals.receiving_success_rate_sum || 0) + (stat.receiving_success_rate || 0),
      success_rate_sum: (totals.success_rate_sum || 0) + (stat.success_rate || 0),
      // Count non-null values for proper averaging
      passing_epa_per_play_count: (totals.passing_epa_per_play_count || 0) + (stat.passing_epa_per_play != null ? 1 : 0),
      passing_success_rate_count: (totals.passing_success_rate_count || 0) + (stat.passing_success_rate != null ? 1 : 0),
      cpoe_count: (totals.cpoe_count || 0) + (stat.cpoe != null ? 1 : 0),
      rushing_epa_per_play_count: (totals.rushing_epa_per_play_count || 0) + (stat.rushing_epa_per_play != null ? 1 : 0),
      rushing_success_rate_count: (totals.rushing_success_rate_count || 0) + (stat.rushing_success_rate != null ? 1 : 0),
      receiving_epa_per_play_count: (totals.receiving_epa_per_play_count || 0) + (stat.receiving_epa_per_play != null ? 1 : 0),
      receiving_success_rate_count: (totals.receiving_success_rate_count || 0) + (stat.receiving_success_rate != null ? 1 : 0),
      success_rate_count: (totals.success_rate_count || 0) + (stat.success_rate != null ? 1 : 0),
    };
  }, { gamesPlayed: 0 });

  // Calculate averages
  const seasonAverages = {
    passing_epa_per_play: seasonTotals.passing_epa_per_play_count > 0 
      ? seasonTotals.passing_epa_per_play_sum / seasonTotals.passing_epa_per_play_count : null,
    passing_success_rate: seasonTotals.passing_success_rate_count > 0 
      ? seasonTotals.passing_success_rate_sum / seasonTotals.passing_success_rate_count : null,
    cpoe: seasonTotals.cpoe_count > 0 
      ? seasonTotals.cpoe_sum / seasonTotals.cpoe_count : null,
    rushing_epa_per_play: seasonTotals.rushing_epa_per_play_count > 0 
      ? seasonTotals.rushing_epa_per_play_sum / seasonTotals.rushing_epa_per_play_count : null,
    rushing_success_rate: seasonTotals.rushing_success_rate_count > 0 
      ? seasonTotals.rushing_success_rate_sum / seasonTotals.rushing_success_rate_count : null,
    receiving_epa_per_play: seasonTotals.receiving_epa_per_play_count > 0 
      ? seasonTotals.receiving_epa_per_play_sum / seasonTotals.receiving_epa_per_play_count : null,
    receiving_success_rate: seasonTotals.receiving_success_rate_count > 0 
      ? seasonTotals.receiving_success_rate_sum / seasonTotals.receiving_success_rate_count : null,
    success_rate: seasonTotals.success_rate_count > 0 
      ? seasonTotals.success_rate_sum / seasonTotals.success_rate_count : null,
  };

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
          <TableCell>Week</TableCell>
          {showPassing && (
            <>
              <TableCell align="right">Pass Yds</TableCell>
              <TableCell align="right">Pass TD</TableCell>
              <TableCell align="right">INT</TableCell>
              <TableCell align="right">Sacks</TableCell>
              <TableCell align="right">Att</TableCell>
              <TableCell align="right">Cmp</TableCell>
              <TableCell align="right">Cmp %</TableCell>
              <TableCell align="right">Pass EPA</TableCell>
              <TableCell align="right">EPA/Pl</TableCell>
              <TableCell align="right">SR %</TableCell>
              <TableCell align="right">CPOE %</TableCell>
            </>
          )}
          {showRushing && (
            <>
              <TableCell align="right">Rush Att</TableCell>
              <TableCell align="right">Rush Yds</TableCell>
              <TableCell align="right">Rush TD</TableCell>
              <TableCell align="right">Rush EPA</TableCell>
              <TableCell align="right">EPA/Pl</TableCell>
              <TableCell align="right">SR %</TableCell>
            </>
          )}
          {showReceiving && (
            <>
              <TableCell align="right">Tgt</TableCell>
              <TableCell align="right">Rec</TableCell>
              <TableCell align="right">Rec Yds</TableCell>
              <TableCell align="right">Rec TD</TableCell>
              <TableCell align="right">Rec EPA</TableCell>
              <TableCell align="right">EPA/Pl</TableCell>
              <TableCell align="right">SR %</TableCell>
            </>
          )}
          <TableCell align="right">Overall SR %</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {weeklyData.map((stat) => (
          <TableRow key={`${stat.season}-${stat.week}`} hover>
            <TableCell sx={{ fontWeight: 'bold' }}>Wk {stat.week}</TableCell>
            {showPassing && (
              <>
                <TableCell align="right">{displayStat(stat.passingYds)}</TableCell>
                <TableCell align="right">{displayStat(stat.passing_tds)}</TableCell>
                <TableCell align="right">{displayStat(stat.passing_interceptions)}</TableCell>
                <TableCell align="right">{displayStat(stat.passing_sacks)}</TableCell>
                <TableCell align="right">{displayStat(stat.passing_attempts)}</TableCell>
                <TableCell align="right">{displayStat(stat.passing_completions)}</TableCell>
                <TableCell align="right">
                  {calculateCompletionPercentage(stat.passing_completions, stat.passing_attempts)}
                </TableCell>
                <TableCell align="right">{formatNumber(stat.passing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(stat.passing_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(stat.passing_success_rate)}</TableCell>
                <TableCell align="right">{formatNumber(stat.cpoe)}</TableCell>
              </>
            )}
            {showRushing && (
              <>
                <TableCell align="right">{displayStat(stat.rushing_attempts)}</TableCell>
                <TableCell align="right">{displayStat(stat.rushingYds)}</TableCell>
                <TableCell align="right">{displayStat(stat.rushing_tds)}</TableCell>
                <TableCell align="right">{formatNumber(stat.rushing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(stat.rushing_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(stat.rushing_success_rate)}</TableCell>
              </>
            )}
            {showReceiving && (
              <>
                <TableCell align="right">{displayStat(stat.targets)}</TableCell>
                <TableCell align="right">{displayStat(stat.receptions)}</TableCell>
                <TableCell align="right">{displayStat(stat.receivingYds)}</TableCell>
                <TableCell align="right">{displayStat(stat.receiving_tds)}</TableCell>
                <TableCell align="right">{formatNumber(stat.receiving_epa)}</TableCell>
                <TableCell align="right">{formatNumber(stat.receiving_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(stat.receiving_success_rate)}</TableCell>
              </>
            )}
            <TableCell align="right">{formatNumber(stat.success_rate)}</TableCell>
          </TableRow>
        ))}
        
        {/* Season Totals Row */}
        {weeklyData.length > 0 && (
          <TableRow
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              '& td': {
                fontWeight: 'bold',
                borderTop: '2px solid rgba(255, 255, 255, 0.2)',
                fontSize: '0.95rem',
              },
            }}
          >
            <TableCell>
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
            </TableCell>
            {showPassing && (
              <>
                <TableCell align="right">{displayStat(seasonTotals.passingYds)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.passing_tds)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.passing_interceptions)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.passing_sacks)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.passing_attempts)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.passing_completions)}</TableCell>
                <TableCell align="right">
                  {calculateCompletionPercentage(seasonTotals.passing_completions, seasonTotals.passing_attempts)}
                </TableCell>
                <TableCell align="right">{formatNumber(seasonTotals.passing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(seasonAverages.passing_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(seasonAverages.passing_success_rate)}</TableCell>
                <TableCell align="right">{formatNumber(seasonAverages.cpoe)}</TableCell>
              </>
            )}
            {showRushing && (
              <>
                <TableCell align="right">{displayStat(seasonTotals.rushing_attempts)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.rushingYds)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.rushing_tds)}</TableCell>
                <TableCell align="right">{formatNumber(seasonTotals.rushing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(seasonAverages.rushing_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(seasonAverages.rushing_success_rate)}</TableCell>
              </>
            )}
            {showReceiving && (
              <>
                <TableCell align="right">{displayStat(seasonTotals.targets)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.receptions)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.receivingYds)}</TableCell>
                <TableCell align="right">{displayStat(seasonTotals.receiving_tds)}</TableCell>
                <TableCell align="right">{formatNumber(seasonTotals.receiving_epa)}</TableCell>
                <TableCell align="right">{formatNumber(seasonAverages.receiving_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(seasonAverages.receiving_success_rate)}</TableCell>
              </>
            )}
            <TableCell align="right">{formatNumber(seasonAverages.success_rate)}</TableCell>
          </TableRow>
        )}
      </TableBody>
    </StatsTableWrapper>
  );
}
