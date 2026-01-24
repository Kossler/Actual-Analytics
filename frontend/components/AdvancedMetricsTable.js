import { TableHead, TableBody, TableRow, TableCell, Box, Chip } from '@mui/material';
import StatsTableWrapper from './StatsTableWrapper';
import {
  formatNumber,
  shouldShowPassingColumns,
  shouldShowRushingColumns,
} from '../utils/statsUtils';
import { m } from 'framer-motion';

/**
 * AdvancedMetricsTable component - displays EPA and success rate metrics
 */
export default function AdvancedMetricsTable({ advancedMetrics, position, playerStats, loading }) {
  const showPassing = shouldShowPassingColumns(position);
  const showRushing = shouldShowRushingColumns(position, playerStats);

  if (!advancedMetrics || advancedMetrics.length === 0) return null;

  const avgOf = (items, selector) => {
    const values = items
      .map((item) => Number(selector(item)))
      .filter((v) => Number.isFinite(v));
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  };

  // ANY/A calculation for a metric (yearly, per row) with debug logging
  const calcAnya = (m) => {
    const passYds = Number(m.passing_yards) || 0;
    const passTDs = Number(m.passing_tds) || 0;
    const ints = Number(m.passing_interceptions) || 0;
    const sackYds = Number(m.sack_yards_lost ?? m.sack_yards) || 0;
    const atts = Number(m.attempts) || 0;
    const sacks = Number(m.sacks_suffered) || 0;
    const denom = atts + sacks;
    if (denom === 0) return null;
    return (passYds + 20 * passTDs - 45 * ints - sackYds) / denom;
  };

  const averages = {
    epa: avgOf(advancedMetrics, (m) => m.epa),
    passing_epa: avgOf(advancedMetrics, (m) => m.passing_epa),
    passing_epa_per_play: avgOf(advancedMetrics, (m) => m.passing_epa_per_play),
    rushing_epa: avgOf(advancedMetrics, (m) => m.rushing_epa),
    rushing_epa_per_play: avgOf(advancedMetrics, (m) => m.rushing_epa_per_play),
    cpoe: avgOf(advancedMetrics, (m) => m.cpoe),
    anya: avgOf(advancedMetrics, calcAnya), // This is now the average of yearly ANY/A, not weekly
  };

  const formatPercent = (value, decimals = 3) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '-';
    return `${num.toFixed(decimals)}%`;
  };

  return (
    <StatsTableWrapper
      title="Advanced Metrics"
      subtitle="EPA, EPA per play, and CPOE"
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
              <TableCell align="right">Pass EPA/Play</TableCell>
              <TableCell align="right">ANY/A</TableCell>
            </>
          )}
          {showRushing && (
            <>
              <TableCell align="right">Rush EPA</TableCell>
              <TableCell align="right">Rush EPA/Play</TableCell>
            </>
          )}
          {position === 'QB' && <TableCell align="right">CPOE</TableCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {advancedMetrics.map((metric) => (
          <TableRow
            key={`${metric.playerId ?? 'player'}-${metric.season}`}
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
                <TableCell align="right">{calcAnya(metric) !== null ? calcAnya(metric).toFixed(2) : '-'}</TableCell>
              </>
            )}
            {showRushing && (
              <>
                <TableCell align="right">{formatNumber(metric.rushing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(metric.rushing_epa_per_play, 3)}</TableCell>
              </>
            )}
            {position === 'QB' && <TableCell align="right">{formatPercent(metric.cpoe)}</TableCell>}
          </TableRow>
        ))}

        {/* Averages Row */}
        {advancedMetrics.length > 0 && (
          <TableRow
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              '& td': {
                fontWeight: 'bold',
                fontSize: '0.95rem',
              },
            }}
          >
            <TableCell>
              <Chip
                label="Average"
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
            <TableCell align="right">{formatNumber(averages.epa)}</TableCell>
            {showPassing && (
              <>
                <TableCell align="right">{formatNumber(averages.passing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(averages.passing_epa_per_play, 3)}</TableCell>
                <TableCell align="right">{averages.anya !== null ? averages.anya.toFixed(2) : '-'}</TableCell>
              </>
            )}
            {showRushing && (
              <>
                <TableCell align="right">{formatNumber(averages.rushing_epa)}</TableCell>
                <TableCell align="right">{formatNumber(averages.rushing_epa_per_play, 3)}</TableCell>
              </>
            )}
            {position === 'QB' && <TableCell align="right">{formatPercent(averages.cpoe)}</TableCell>}
          </TableRow>
        )}
      </TableBody>
    </StatsTableWrapper>
  );
}
