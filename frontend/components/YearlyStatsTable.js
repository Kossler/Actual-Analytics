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

  // Calculate career totals
  const careerTotals = playerStats.reduce((totals, stat) => ({
    gameCount: (totals.gameCount || 0) + (stat.gameCount || 0),
    passingYds: (totals.passingYds || 0) + (stat.passingYds || 0),
    passing_tds: (totals.passing_tds || 0) + (stat.passing_tds || 0),
    passing_interceptions: (totals.passing_interceptions || 0) + (stat.passing_interceptions || 0),
    passing_sacks: (totals.passing_sacks || 0) + (stat.passing_sacks || 0),
    passing_attempts: (totals.passing_attempts || 0) + (stat.passing_attempts || 0),
    passing_completions: (totals.passing_completions || 0) + (stat.passing_completions || 0),
    rushingYds: (totals.rushingYds || 0) + (stat.rushingYds || 0),
    rushing_tds: (totals.rushing_tds || 0) + (stat.rushing_tds || 0),
    rushing_attempts: (totals.rushing_attempts || 0) + (stat.rushing_attempts || 0),
    targets: (totals.targets || 0) + (stat.targets || 0),
    receptions: (totals.receptions || 0) + (stat.receptions || 0),
    receivingYds: (totals.receivingYds || 0) + (stat.receivingYds || 0),
    receiving_tds: (totals.receiving_tds || 0) + (stat.receiving_tds || 0),
  }), {});

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
        
        {/* Career Totals Row */}
        {playerStats.length > 0 && (
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
                label="Career Total"
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
            <TableCell align="right">{careerTotals.gameCount}</TableCell>
            {showPassing && (
              <>
                <TableCell align="right">{displayStat(careerTotals.passingYds)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.passing_tds)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.passing_interceptions)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.passing_sacks)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.passing_attempts)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.passing_completions)}</TableCell>
                <TableCell align="right">
                  {calculateCompletionPercentage(careerTotals.passing_completions, careerTotals.passing_attempts)}
                </TableCell>
              </>
            )}
            {showRushing && (
              <>
                <TableCell align="right">{displayStat(careerTotals.rushingYds)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.rushing_tds)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.rushing_attempts)}</TableCell>
              </>
            )}
            {showReceiving && (
              <>
                <TableCell align="right">{displayStat(careerTotals.targets)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.receptions)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.receivingYds)}</TableCell>
                <TableCell align="right">{displayStat(careerTotals.receiving_tds)}</TableCell>
              </>
            )}
          </TableRow>
        )}
      </TableBody>
    </StatsTableWrapper>
  );
}
