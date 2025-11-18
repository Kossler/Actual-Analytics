import { TableHead, TableBody, TableRow, TableCell, Box, Chip } from '@mui/material';
import StatsTableWrapper from './StatsTableWrapper';
import {
  formatNumber,
  shouldShowPassingColumns,
  shouldShowRushingColumns,
} from '../utils/statsUtils';

/**
 * AdvancedMetricsTable component - displays EPA and success rate metrics
 */
export default function AdvancedMetricsTable({ advancedMetrics, position, playerStats, loading }) {
  const showPassing = shouldShowPassingColumns(position);
  const showRushing = shouldShowRushingColumns(position, playerStats);

  if (!advancedMetrics || advancedMetrics.length === 0) return null;

  return (
    <StatsTableWrapper
      title="Advanced Metrics"
      subtitle="EPA, EPA per play, CPOE, and success rates"
      loading={loading}
      dataLength={advancedMetrics.length}
    >
      <TableHead>
        <TableRow>
          <TableCell>Season</TableCell>
          <TableCell align="right">EPA</TableCell>
          {showPassing && (
            <>
              <TableCell align="right">Pass EPA</TableCell>
              <TableCell align="right">Pass EPA/Pl</TableCell>
              <TableCell align="right">Pass SR %</TableCell>
            </>
          )}
          {showRushing && (
            <>
              <TableCell align="right">Rush EPA</TableCell>
              <TableCell align="right">Rush EPA/Pl</TableCell>
              <TableCell align="right">Rush SR %</TableCell>
            </>
          )}
          {position === 'QB' && <TableCell align="right">CPOE %</TableCell>}
          <TableCell align="right">Overall SR %</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {advancedMetrics.map((metric) => (
          <TableRow
            key={`${metric.playerId}-${metric.season}`}
            hover
            sx={{
              backgroundColor: metric.season === 2025 ? 'rgba(25, 118, 210, 0.1)' : 'inherit',
            }}
          >
            <TableCell sx={{ fontWeight: 'bold' }}>
              {metric.season === 2025 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>{metric.season}</span>
                  <Chip
                    label="Active"
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                </Box>
              ) : (
                metric.season
              )}
            </TableCell>
            <TableCell align="right">{formatNumber(metric.epa)}</TableCell>
            {showPassing && (
              <>
                <TableCell align="right">{formatNumber(metric.passing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(metric.passing_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(metric.passing_success_rate)}</TableCell>
              </>
            )}
            {showRushing && (
              <>
                <TableCell align="right">{formatNumber(metric.rushing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(metric.rushing_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{formatNumber(metric.rushing_success_rate)}</TableCell>
              </>
            )}
            {position === 'QB' && (
              <TableCell align="right">{formatNumber(metric.cpoe)}</TableCell>
            )}
            <TableCell align="right">{formatNumber(metric.success_rate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </StatsTableWrapper>
  );
}
