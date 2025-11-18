import { useState, useMemo, useEffect } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
  LabelList,
} from 'recharts';
import {
  Card,
  CardHeader,
  CardContent,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Grid,
  Box,
} from '@mui/material';

const METRICS = [
  // Passing Stats
  { value: 'passingYds', label: 'Passing Yards', category: 'passing', threshold: 150 },
  { value: 'passing_tds', label: 'Passing TDs', category: 'passing', threshold: 150 },
  { value: 'passing_interceptions', label: 'Interceptions', category: 'passing', threshold: 150 },
  { value: 'passing_attempts', label: 'Pass Attempts', category: 'passing', threshold: 150 },
  { value: 'passing_completions', label: 'Completions', category: 'passing', threshold: 150 },
  { value: 'completionPct', label: 'Completion %', category: 'passing', threshold: 150 },
  { value: 'passing_sacks', label: 'Sacks Taken', category: 'passing', threshold: 150 },
  { value: 'passing_epa', label: 'Passing EPA', category: 'passing', threshold: 150 },
  { value: 'passing_epa_per_play', label: 'Passing EPA/Play', category: 'passing', threshold: 150 },
  { value: 'passing_success_rate', label: 'Pass Success Rate %', category: 'passing', threshold: 150 },
  { value: 'cpoe', label: 'CPOE %', category: 'passing', threshold: 150 },
  
  // Rushing Stats
  { value: 'rushingYds', label: 'Rushing Yards', category: 'rushing', threshold: 120 },
  { value: 'rushing_attempts', label: 'Rush Attempts', category: 'rushing', threshold: 120 },
  { value: 'rushing_tds', label: 'Rushing TDs', category: 'rushing', threshold: 120 },
  { value: 'yardsPerRushAttempt', label: 'Yards/Rush', category: 'rushing', threshold: 120 },
  { value: 'rushing_epa', label: 'Rushing EPA', category: 'rushing', threshold: 120 },
  { value: 'rushing_epa_per_play', label: 'Rushing EPA/Play', category: 'rushing', threshold: 120 },
  { value: 'rushing_success_rate', label: 'Rush Success Rate %', category: 'rushing', threshold: 120 },
  
  // Receiving Stats
  { value: 'receivingYds', label: 'Receiving Yards', category: 'receiving', threshold: 40 },
  { value: 'receptions', label: 'Receptions', category: 'receiving', threshold: 40 },
  { value: 'targets', label: 'Targets', category: 'receiving', threshold: 40 },
  { value: 'receiving_tds', label: 'Receiving TDs', category: 'receiving', threshold: 40 },
  { value: 'yardsPerReception', label: 'Yards/Reception', category: 'receiving', threshold: 40 },
  { value: 'catchPct', label: 'Catch %', category: 'receiving', threshold: 40 },
  { value: 'receiving_epa', label: 'Receiving EPA', category: 'receiving', threshold: 40 },
  { value: 'receiving_epa_per_play', label: 'Receiving EPA/Play', category: 'receiving', threshold: 40 },
  { value: 'receiving_success_rate', label: 'Rec Success Rate %', category: 'receiving', threshold: 40 },
  
  // Overall Stats
  { value: 'epa', label: 'Total EPA', category: 'overall', threshold: 0 },
  { value: 'success_rate', label: 'Overall Success Rate %', category: 'overall', threshold: 0 },
];

export default function PlayerScatterPlot({ 
  playerStats, 
  weeklyStats, 
  advancedMetrics, 
  selectedPlayerId, 
  allPlayerStats,
  selectedYear,
  onYearChange,
  availableYears = [2025]
}) {
  // Find the selected player's position to set appropriate defaults
  const selectedPlayer = useMemo(() => {
    if (!allPlayerStats || !selectedPlayerId) return null;
    return allPlayerStats.find(p => p.playerId === selectedPlayerId);
  }, [allPlayerStats, selectedPlayerId]);

  // Set default axes based on player position
  const getDefaultAxes = (position) => {
    if (!position) return { x: 'passing_attempts', y: 'passing_epa' };
    
    if (position === 'RB') {
      return { x: 'rushing_attempts', y: 'rushing_epa' };
    } else if (position === 'WR' || position === 'TE') {
      return { x: 'receptions', y: 'receiving_epa' };
    } else {
      // QB and others default to passing
      return { x: 'passing_attempts', y: 'passing_epa' };
    }
  };

  const defaultAxes = useMemo(() => 
    getDefaultAxes(selectedPlayer?.position), 
    [selectedPlayer?.position]
  );

  const [xAxis, setXAxis] = useState(defaultAxes.x);
  const [yAxis, setYAxis] = useState(defaultAxes.y);

  // Update axes when selected player position changes
  useEffect(() => {
    setXAxis(defaultAxes.x);
    setYAxis(defaultAxes.y);
  }, [defaultAxes.x, defaultAxes.y]);

  // Combine all data sources for selected year
  const combinedData = useMemo(() => {
    if (!allPlayerStats || allPlayerStats.length === 0) return [];

    // Map the backend data to our frontend structure
    return allPlayerStats.map(stat => ({
      playerId: stat.playerId,
      name: stat.name,
      position: stat.position,
      season: stat.season,
      passingYds: Number(stat.passingYds) || 0,
      passing_tds: Number(stat.passingTDs) || 0,
      passing_interceptions: Number(stat.interceptions) || 0,
      passing_attempts: Number(stat.passingAttempts) || 0,
      passing_completions: Number(stat.passingCompletions) || 0,
      completionPct: stat.passingAttempts > 0 
        ? (Number(stat.passingCompletions) / Number(stat.passingAttempts) * 100) 
        : 0,
      passing_sacks: Number(stat.sacks) || 0,
      rushingYds: Number(stat.rushingYds) || 0,
      rushing_attempts: Number(stat.rushingAttempts) || 0,
      rushing_tds: Number(stat.rushingTDs) || 0,
      yardsPerRushAttempt: stat.rushingAttempts > 0 
        ? (Number(stat.rushingYds) / Number(stat.rushingAttempts)) 
        : 0,
      receivingYds: Number(stat.receivingYds) || 0,
      receptions: Number(stat.receptions) || 0,
      targets: Number(stat.targets) || 0,
      receiving_tds: Number(stat.receivingTDs) || 0,
      yardsPerReception: stat.receptions > 0 
        ? (Number(stat.receivingYds) / Number(stat.receptions)) 
        : 0,
      catchPct: stat.targets > 0 
        ? (Number(stat.receptions) / Number(stat.targets) * 100) 
        : 0,
      passing_epa: Number(stat.passingEPA) || 0,
      passing_epa_per_play: stat.passingAttempts > 0 
        ? (Number(stat.passingEPA) / Number(stat.passingAttempts)) 
        : 0,
      passing_success_rate: Number(stat.successRate) || 0,
      rushing_epa: Number(stat.rushingEPA) || 0,
      rushing_epa_per_play: stat.rushingAttempts > 0 
        ? (Number(stat.rushingEPA) / Number(stat.rushingAttempts)) 
        : 0,
      rushing_success_rate: Number(stat.successRate) || 0,
      receiving_epa: Number(stat.receivingEPA) || 0,
      receiving_epa_per_play: stat.receptions > 0 
        ? (Number(stat.receivingEPA) / Number(stat.receptions)) 
        : 0,
      receiving_success_rate: Number(stat.successRate) || 0,
      epa: (Number(stat.passingEPA) || 0) + (Number(stat.rushingEPA) || 0) + (Number(stat.receivingEPA) || 0),
      success_rate: Number(stat.successRate) || 0,
      cpoe: Number(stat.cpoe) || 0,
    }));
  }, [allPlayerStats]);

  // Filter and prepare data for chart
  const chartData = useMemo(() => {
    const xMetric = METRICS.find(m => m.value === xAxis);
    const yMetric = METRICS.find(m => m.value === yAxis);

    if (!xMetric || !yMetric) return [];

    // Determine threshold based on both axes
    const thresholdField = xMetric.category === 'passing' ? 'passing_attempts'
      : xMetric.category === 'rushing' ? 'rushing_attempts'
      : xMetric.category === 'receiving' ? 'receptions'
      : null;

    const threshold = xMetric.threshold;

    // Filter by threshold
    let filtered = combinedData.filter(player => {
      if (!thresholdField) return true;
      return (player[thresholdField] || 0) >= threshold;
    });

    // Also check y-axis threshold
    const yThresholdField = yMetric.category === 'passing' ? 'passing_attempts'
      : yMetric.category === 'rushing' ? 'rushing_attempts'
      : yMetric.category === 'receiving' ? 'receptions'
      : null;

    if (yThresholdField && yThresholdField !== thresholdField) {
      filtered = filtered.filter(player => {
        return (player[yThresholdField] || 0) >= yMetric.threshold;
      });
    }

    // Sort by y-axis value and take top 32
    const sorted = filtered
      .sort((a, b) => (b[yAxis] || 0) - (a[yAxis] || 0))
      .slice(0, 32);

    // Always include the selected player, even if they don't meet threshold
    const selectedPlayerData = combinedData.find(p => p.playerId === selectedPlayerId);
    if (selectedPlayerData && !sorted.find(p => p.playerId === selectedPlayerId)) {
      // Remove the last player to make room for selected player
      sorted.pop();
      sorted.push(selectedPlayerData);
    }

    return sorted.map(player => ({
      name: player.name,
      position: player.position,
      playerId: player.playerId,
      x: player[xAxis] || 0,
      y: player[yAxis] || 0,
      isSelected: player.playerId === selectedPlayerId,
    }));
  }, [combinedData, xAxis, yAxis, selectedPlayerId]);

  const xMetricLabel = METRICS.find(m => m.value === xAxis)?.label || 'X-Axis';
  const yMetricLabel = METRICS.find(m => m.value === yAxis)?.label || 'Y-Axis';
  const xThreshold = METRICS.find(m => m.value === xAxis)?.threshold || 0;

  // Calculate axis domains with padding for better readability
  const xDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    const xValues = chartData.map(d => d.x);
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const xRange = xMax - xMin;
    
    // Use 15% padding on each side
    const xPadding = xRange * 0.15;
    return [xMin - xPadding, xMax + xPadding];
  }, [chartData]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    const yValues = chartData.map(d => d.y);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const yRange = yMax - yMin;
    
    // Use 15% padding on each side
    const yPadding = yRange * 0.15;
    return [yMin - yPadding, yMax + yPadding];
  }, [chartData]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            backgroundColor: '#1e293b',
            border: '1px solid rgba(25, 118, 210, 0.5)',
            borderRadius: '4px',
            padding: '8px 12px',
            color: '#fff',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{data.name}</div>
          <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{data.position}</div>
          <div style={{ marginTop: '8px', fontSize: '0.875rem' }}>
            <div>{xMetricLabel}: {typeof data.x === 'number' ? (Number.isInteger(data.x) ? data.x : data.x.toFixed(3)) : data.x}</div>
            <div>{yMetricLabel}: {typeof data.y === 'number' ? (Number.isInteger(data.y) ? data.y : data.y.toFixed(3)) : data.y}</div>
          </div>
        </Box>
      );
    }
    return null;
  };

  return (
    <Card sx={{ mb: 4 }}>
      <CardHeader
        title="Player Comparison"
        subheader={`Top 32 players for ${selectedYear} (min ${xThreshold}+ qualifying stat)`}
        titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
        subheaderTypographyProps={{ variant: 'body2' }}
        action={
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Year</InputLabel>
            <Select
              value={selectedYear}
              onChange={(e) => onYearChange(e.target.value)}
              label="Year"
            >
              {availableYears.map(year => (
                <MenuItem key={year} value={year}>{year}</MenuItem>
              ))}
            </Select>
          </FormControl>
        }
      />
      <CardContent>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth size="small">
              <InputLabel>X-Axis</InputLabel>
              <Select 
                value={xAxis} 
                onChange={(e) => setXAxis(e.target.value)}
                label="X-Axis"
              >
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main' }}>
                  Passing Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'passing').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main', mt: 1 }}>
                  Rushing Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'rushing').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main', mt: 1 }}>
                  Receiving Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'receiving').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main', mt: 1 }}>
                  Overall Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'overall').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Y-Axis</InputLabel>
              <Select 
                value={yAxis} 
                onChange={(e) => setYAxis(e.target.value)}
                label="Y-Axis"
              >
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main' }}>
                  Passing Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'passing').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main', mt: 1 }}>
                  Rushing Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'rushing').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main', mt: 1 }}>
                  Receiving Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'receiving').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
                <MenuItem disabled sx={{ fontWeight: 600, color: 'primary.main', mt: 1 }}>
                  Overall Stats
                </MenuItem>
                {METRICS.filter(m => m.category === 'overall').map(m => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {chartData.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
            No players meet the threshold criteria
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height={500}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis
                type="number"
                dataKey="x"
                domain={xDomain}
                stroke="#fff"
                tick={{ fill: '#fff', fontSize: 12 }}
                tickFormatter={(value) => {
                  // Round to 1 decimal if less than 10, otherwise round to integer
                  return Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value).toString();
                }}
              >
                <Label
                  value={xMetricLabel}
                  position="bottom"
                  style={{ fill: '#fff', fontSize: 14 }}
                  offset={40}
                />
              </XAxis>
              <YAxis
                type="number"
                dataKey="y"
                domain={yDomain}
                stroke="#fff"
                tick={{ fill: '#fff', fontSize: 12 }}
                tickFormatter={(value) => {
                  // Round to 1 decimal if less than 10, otherwise round to integer
                  return Math.abs(value) < 10 ? value.toFixed(1) : Math.round(value).toString();
                }}
              >
                <Label
                  value={yMetricLabel}
                  angle={-90}
                  position="left"
                  style={{ fill: '#fff', fontSize: 14, textAnchor: 'middle' }}
                  offset={60}
                />
              </YAxis>
              <Tooltip content={<CustomTooltip />} />
              
              {/* All players - single scatter component */}
              <Scatter
                data={chartData}
                fill="#1976d2"
                shape={(props) => {
                  const { cx, cy, payload } = props;
                  const isSelected = payload.isSelected;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={isSelected ? '#ffc107' : '#1976d2'}
                      fillOpacity={isSelected ? 1 : 0.6}
                      stroke={isSelected ? '#ff9800' : '#1976d2'}
                      strokeWidth={isSelected ? 3 : 1}
                    />
                  );
                }}
              >
                <LabelList
                  dataKey="name"
                  position="top"
                  content={({ x, y, value, index }) => {
                    const isSelected = chartData[index]?.isSelected;
                    return (
                      <text
                        x={x}
                        y={y - 8}
                        textAnchor="middle"
                        fill={isSelected ? '#ffc107' : '#fff'}
                        fontSize={isSelected ? 12 : 10}
                        fontWeight={isSelected ? 700 : 500}
                      >
                        {value}
                      </text>
                    );
                  }}
                />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
