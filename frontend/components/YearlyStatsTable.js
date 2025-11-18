import { TableHead, TableBody, TableRow, TableCell, Box, Chip } from '@mui/material';
import StatsTableWrapper from './StatsTableWrapper';
import {
  displayStat,
  calculateCompletionPercentage,
  shouldShowPassingColumns,
  shouldShowRushingColumns,
  shouldShowReceivingColumns,
} from '../utils/statsUtils';

/**
 * YearlyStatsTable component - displays season-aggregated stats
 */
export default function YearlyStatsTable({ playerStats, position, loading }) {
  const showPassing = shouldShowPassingColumns(position);
  const showRushing = shouldShowRushingColumns(position, playerStats);
  const showReceiving = shouldShowReceivingColumns(position);

  return (
    <StatsTableWrapper
      title="Yearly Statistics"
      subtitle="Season-by-season performance"
      loading={loading}
      dataLength={playerStats.length}
    >
      <TableHead>
        <TableRow>
          <TableCell>Season</TableCell>
          <TableCell align="right">Games</TableCell>
          {showPassing && (
            <>
              <TableCell align="right">Pass Yds</TableCell>
              <TableCell align="right">Pass TD</TableCell>
              <TableCell align="right">INT</TableCell>
              <TableCell align="right">Sacks</TableCell>
              <TableCell align="right">Att</TableCell>
              <TableCell align="right">Cmp</TableCell>
              <TableCell align="right">Cmp %</TableCell>
            </>
          )}
          {showRushing && (
            <>
              <TableCell align="right">Rush Yds</TableCell>
              <TableCell align="right">Rush TD</TableCell>
              <TableCell align="right">Rush Att</TableCell>
            </>
          )}
          {showReceiving && (
            <>
              <TableCell align="right">Tgt</TableCell>
              <TableCell align="right">Rec</TableCell>
              <TableCell align="right">Rec Yds</TableCell>
              <TableCell align="right">Rec TD</TableCell>
            </>
          )}
        </TableRow>
      </TableHead>
      <TableBody>
        {playerStats.map((stat) => (
          <TableRow
            key={stat.season}
            hover
            sx={{
              backgroundColor: stat.season === 2025 ? 'rgba(25, 118, 210, 0.1)' : 'inherit',
            }}
          >
            <TableCell sx={{ fontWeight: 'bold' }}>
              {stat.season === 2025 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>{stat.season}</span>
                  <Chip
                    label="Active"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                </Box>
              ) : (
                stat.season
              )}
            </TableCell>
            <TableCell align="right">{stat.gameCount}</TableCell>
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
              </>
            )}
            {showRushing && (
              <>
                <TableCell align="right">{displayStat(stat.rushingYds)}</TableCell>
                <TableCell align="right">{displayStat(stat.rushing_tds)}</TableCell>
                <TableCell align="right">{displayStat(stat.rushing_attempts)}</TableCell>
              </>
            )}
            {showReceiving && (
              <>
                <TableCell align="right">{displayStat(stat.targets)}</TableCell>
                <TableCell align="right">{displayStat(stat.receptions)}</TableCell>
                <TableCell align="right">{displayStat(stat.receivingYds)}</TableCell>
                <TableCell align="right">{displayStat(stat.receiving_tds)}</TableCell>
              </>
            )}
          </TableRow>
        ))}
      </TableBody>
    </StatsTableWrapper>
  );
}
