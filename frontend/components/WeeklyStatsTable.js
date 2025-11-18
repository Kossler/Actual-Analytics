import { TableHead, TableBody, TableRow, TableCell } from '@mui/material';
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
export default function WeeklyStatsTable({ weeklyStats, position, playerStats, loading }) {
  const showPassing = shouldShowPassingColumns(position);
  const showRushing = shouldShowRushingColumns(position, playerStats);
  const showReceiving = shouldShowReceivingColumns(position);

  if (!weeklyStats || weeklyStats.length === 0) return null;

  const weeklyData = weeklyStats.filter(stat => stat.week !== null);

  return (
    <StatsTableWrapper
      title="Season Metrics"
      subtitle="Week-by-week performance for 2025"
      loading={loading}
      dataLength={weeklyData.length}
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
      </TableBody>
    </StatsTableWrapper>
  );
}
