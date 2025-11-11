import { useEffect, useState } from 'react';
import {
  Container,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Autocomplete,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { createTheme, ThemeProvider } from '@mui/material/styles';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#1a0f2e',
      paper: '#251a45',
    },
    primary: {
      main: '#ff4444',
    },
    secondary: {
      main: '#ff8c00',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: 'none',
          transition: 'all 0.3s ease',
          '&:hover': {
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 0 20px rgba(255, 255, 255, 0.15)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: 'none',
          transition: 'all 0.3s ease',
          '&:hover': {
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 0 20px rgba(255, 255, 255, 0.15)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: '#ffffff',
          transition: 'all 0.3s ease',
          '&:hover': {
            background: 'rgba(255, 255, 255, 0.15)',
            boxShadow: '0 0 15px rgba(255, 255, 255, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.4)',
          },
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          '& thead': {
            background: 'rgba(255, 255, 255, 0.05)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          },
          '& tbody tr': {
            transition: 'all 0.2s ease',
            '&:hover': {
              background: 'rgba(255, 255, 255, 0.08)',
              boxShadow: 'inset 0 0 15px rgba(255, 255, 255, 0.1)',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '6px 8px', // Reduced from default 16px
          fontSize: '0.875rem', // Slightly smaller font
        },
        head: {
          padding: '8px 8px', // Slightly more padding for headers
          fontSize: '0.8125rem',
          fontWeight: 600,
        },
      },
    },
  },
});

export default function Home() {
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [playerMedians, setPlayerMedians] = useState([]);
  const [advancedMetrics, setAdvancedMetrics] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statsLoading, setStatsLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState('url("/kukai-art-ZlC0wis-JeY-unsplash.jpg")');

  // Helper function to determine if columns should be shown based on position and data availability
  const shouldShowReceivingColumns = (position, stats) => {
    // Show receiving columns for: RB, WR, TE (always); QB (never)
    if (position === 'QB') {
      return false;
    }
    return true;
  };

  const shouldShowRushingColumns = (position, stats) => {
    // Show rushing columns for: RB, WR, TE (always); QB (only if has rushing data)
    if (position === 'QB') {
      const yearsWithRushing = stats.filter(s => s.rushing_attempts > 0).length;
      return yearsWithRushing > 0;
    }
    return true;
  };

  const shouldShowPassingColumns = (position, stats) => {
    // Show passing columns only for QBs
    return position === 'QB';
  };

  const shouldShowRushingColumnsWR = (position, stats) => {
    // This function is now only used for WR/TE filtering by shouldShowRushingColumns
    // Keep for backward compatibility but this logic is now handled above
    return shouldShowRushingColumns(position, stats);
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    // 1% chance to use the special background
    const isSpecialBackground = Math.random() < 0.01;
    if (isSpecialBackground) {
      setBackgroundImage('url("/yfbubuixmemvpeokmect.png")');
    }
  }, []);

  useEffect(() => {
    fetch(`${apiUrl}/api/players`)
      .then(r => r.json())
      .then(setAllPlayers)
      .catch(console.error);
  }, [apiUrl]);

  const handleSelectPlayer = (player) => {
    setSelectedPlayer(player);
    setSearchQuery('');
    setStatsLoading(true);
    
    // Fetch aggregated yearly stats
    fetch(`${apiUrl}/api/players/${player.id}/stats`)
      .then(r => r.json())
      .then(stats => {
        const grouped = Object.create(null); // Use null prototype to prevent prototype pollution
        stats.forEach(stat => {
          // Validate and sanitize season key to prevent prototype pollution
          const season = String(stat.season);
          if (!season || season === '__proto__' || season === 'constructor' || season === 'prototype') {
            return; // Skip invalid or dangerous keys
          }
          
          if (!grouped[season]) {
            grouped[season] = {
              season: stat.season,
              passingYds: 0,
              passing_tds: 0,
              passing_interceptions: 0,
              passing_attempts: 0,
              passing_completions: 0,
              passing_sacks: 0,
              rushingYds: 0,
              rushing_attempts: 0,
              rushing_tds: 0,
              receivingYds: 0,
              receptions: 0,
              targets: 0,
              receiving_tds: 0,
              gameCount: 0
            };
          }
          grouped[season].passingYds += stat.passingYds || 0;
          grouped[season].passing_tds += stat.passing_tds || 0;
          grouped[season].passing_interceptions += stat.passing_interceptions || 0;
          grouped[season].passing_attempts += stat.passing_attempts || 0;
          grouped[season].passing_completions += stat.passing_completions || 0;
          grouped[season].passing_sacks += stat.passing_sacks || 0;
          grouped[season].rushingYds += stat.rushingYds || 0;
          grouped[season].rushing_attempts += stat.rushing_attempts || 0;
          grouped[season].rushing_tds += stat.rushing_tds || 0;
          grouped[season].receivingYds += stat.receivingYds || 0;
          grouped[season].receptions += stat.receptions || 0;
          grouped[season].targets += stat.targets || 0;
          grouped[season].receiving_tds += stat.receiving_tds || 0;
          // Use the games field from season-level stats if available, otherwise count weeks
          if (stat.week === null && stat.games) {
            grouped[season].gameCount = stat.games;
          } else if (stat.week !== null) {
            grouped[season].gameCount += 1;
          }
        });
        const yearlyStats = Object.values(grouped).sort((a, b) => b.season - a.season);
        setPlayerStats(yearlyStats);
      })
      .catch(console.error)
      .finally(() => setStatsLoading(false));
    
    // Fetch weekly stats for current season
    fetch(`${apiUrl}/api/players/${player.id}/stats?season=2025`)
      .then(r => r.json())
      .then(stats => {
        const sorted = stats.sort((a, b) => (a.week || 999) - (b.week || 999));
        setWeeklyStats(sorted);
      })
      .catch(console.error);
    
    // Fetch median stats
    fetch(`${apiUrl}/api/players/${player.id}/medians`)
      .then(r => r.json())
      .then(medians => {
        setPlayerMedians(medians.sort((a, b) => b.season - a.season));
      })
      .catch(console.error);

    // Fetch advanced metrics
    fetch(`${apiUrl}/api/players/${player.id}/advanced`)
      .then(r => r.json())
      .then(metrics => {
        setAdvancedMetrics(metrics.sort((a, b) => b.season - a.season));
      })
      .catch(console.error);
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <Box sx={{ 
        bgcolor: 'background.default', 
        minHeight: '100vh', 
        py: 4,
        backgroundImage: backgroundImage,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.70)',
          pointerEvents: 'none',
          zIndex: 0,
        }
      }}>
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <Card sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
              <Box
                component="img"
                src="/Actual NFL Analytics icon - Alt.svg"
                alt="Actual NFL Analytics Logo"
                sx={{
                  height: '80px',
                  width: 'auto',
                }}
              />
              <Box sx={{ flex: 1 }}>
                <CardHeader
                  title={<span style={{ color: '#ffffff', fontWeight: 900, fontSize: '2.5rem', letterSpacing: '-0.5px' }}>Actual NFL Analytics</span>}
                  subheader="Search for a player to view their stats across all years since 2016"
                  titleTypographyProps={{ variant: 'h4', sx: { fontWeight: 900 } }}
                  sx={{ p: 0 }}
                />
              </Box>
            </Box>
          </Card>

          {/* Search Card */}
          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Box sx={{ maxWidth: '500px' }}>
                <Autocomplete
                  options={allPlayers}
                  getOptionLabel={(option) => `${option.name} - ${option.position} (${option.team})`}
                  filterOptions={(options, state) => {
                    if (!state.inputValue) return [];
                    return options.filter(option =>
                      option.name.toLowerCase().includes(state.inputValue.toLowerCase())
                    ).slice(0, 10);
                  }}
                  value={selectedPlayer}
                  onChange={(event, newValue) => {
                    if (newValue) {
                      handleSelectPlayer(newValue);
                    }
                  }}
                  inputValue={searchQuery}
                  onInputChange={(event, newInputValue) => {
                    setSearchQuery(newInputValue);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Search for a player..."
                      variant="outlined"
                      size="small"
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: <SearchIcon sx={{ mr: 1, color: 'rgb(25, 118, 210)' }} />,
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          color: '#ffffff',
                          background: 'rgba(25, 118, 210, 0.05)',
                          border: '1px solid rgba(25, 118, 210, 0.3)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            background: 'rgba(25, 118, 210, 0.08)',
                            boxShadow: '0 0 20px rgba(25, 118, 210, 0.2)',
                          },
                          '&.Mui-focused': {
                            background: 'rgba(25, 118, 210, 0.1)',
                            boxShadow: '0 0 30px rgba(25, 118, 210, 0.3)',
                            border: '1px solid rgba(25, 118, 210, 0.6)',
                          },
                          '& fieldset': {
                            borderColor: 'rgba(25, 118, 210, 0.3) !important',
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: 'rgb(25, 118, 210) !important',
                          },
                        },
                        '& .MuiOutlinedInput-input::placeholder': {
                          color: 'rgba(25, 118, 210, 0.5)',
                          opacity: 1,
                        },
                      }}
                    />
                  )}
                  renderOption={(props, option) => (
                    <Box
                      {...props}
                      component="li"
                      sx={{
                        py: 1.5,
                        px: 2,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {option.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {option.position} • {option.team}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  noOptionsText="No players found"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>

          {/* Selected Player Info */}
          {selectedPlayer && (
            <Card sx={{ mb: 4 }}>
              <CardHeader
                title={selectedPlayer.name}
                subheader={`${selectedPlayer.position} • ${selectedPlayer.team}`}
                avatar={
                  <Chip
                    label={selectedPlayer.position}
                    size="small"
                    variant="outlined"
                  />
                }
              />
            </Card>
          )}

          {/* Stats Table */}
          {selectedPlayer && (
            <>
              {/* Season Metrics Table (Weekly Stats) */}
              {weeklyStats.length > 0 && (
                <Card sx={{ mb: 4 }}>
                  <CardHeader
                    title="Season Metrics"
                    subheader="Week-by-week performance for 2025"
                    titleTypographyProps={{ variant: 'h6' }}
                  />
                  <CardContent sx={{ p: 0 }}>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ 
                            backgroundColor: 'rgba(0, 0, 0, 0.05)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
                          }}>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 'bold' }}>Week</TableCell>
                            {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Yds</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass TD</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass INT</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Sacks</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Att</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Cmp</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Cmp %</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass EPA</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass EPA/Pl</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass SR %</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>CPOE %</TableCell>
                              </>
                            )}
                            {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush Att</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush Yds</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush TD</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush EPA</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush EPA/Pl</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush SR %</TableCell>
                              </>
                            )}
                            {shouldShowReceivingColumns(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Tgt</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rec</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rec Yds</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rec TD</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rec EPA</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rec EPA/Pl</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rec SR %</TableCell>
                              </>
                            )}
                            <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Overall SR %</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {weeklyStats.filter(stat => stat.week !== null).map((stat) => (
                            <TableRow 
                              key={`${stat.season}-${stat.week}`}
                              hover
                              sx={{
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                  boxShadow: 'inset 0 0 15px rgba(255, 255, 255, 0.1)',
                                  borderRadius: '4px',
                                },
                              }}
                            >
                              <TableCell sx={{ fontWeight: 'bold', color: '#ffffff' }}>
                                Wk {stat.week}
                              </TableCell>
                              {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">{stat.passingYds > 0 ? stat.passingYds : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_tds > 0 ? stat.passing_tds : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_interceptions > 0 ? stat.passing_interceptions : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_sacks > 0 ? stat.passing_sacks : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_attempts > 0 ? stat.passing_attempts : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_completions > 0 ? stat.passing_completions : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_completions > 0 && stat.passing_attempts > 0 ? `${(stat.passing_completions / stat.passing_attempts * 100).toFixed(1)}%` : '-'}</TableCell>
                                  <TableCell align="right">
                                    {stat.passing_epa !== undefined && stat.passing_epa !== null ? stat.passing_epa.toFixed(1) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {stat.passing_epa_per_play !== undefined && stat.passing_epa_per_play !== null ? stat.passing_epa_per_play.toFixed(3) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {stat.passing_success_rate !== undefined && stat.passing_success_rate !== null ? stat.passing_success_rate.toFixed(1) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {stat.cpoe !== undefined && stat.cpoe !== null ? stat.cpoe.toFixed(1) : '-'}
                                  </TableCell>
                                </>
                              )}
                              {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">{stat.rushing_attempts > 0 ? stat.rushing_attempts : '-'}</TableCell>
                                  <TableCell align="right">{stat.rushingYds > 0 ? stat.rushingYds : '-'}</TableCell>
                                  <TableCell align="right">{stat.rushing_tds > 0 ? stat.rushing_tds : '-'}</TableCell>
                                  <TableCell align="right">
                                    {stat.rushing_epa !== undefined && stat.rushing_epa !== null ? stat.rushing_epa.toFixed(1) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {stat.rushing_epa_per_play !== undefined && stat.rushing_epa_per_play !== null ? stat.rushing_epa_per_play.toFixed(3) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {stat.rushing_success_rate !== undefined && stat.rushing_success_rate !== null ? stat.rushing_success_rate.toFixed(1) : '-'}
                                  </TableCell>
                                </>
                              )}
                              {shouldShowReceivingColumns(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">{stat.targets > 0 ? stat.targets : '-'}</TableCell>
                                  <TableCell align="right">{stat.receptions > 0 ? stat.receptions : '-'}</TableCell>
                                  <TableCell align="right">{stat.receivingYds > 0 ? stat.receivingYds : '-'}</TableCell>
                                  <TableCell align="right">{stat.receiving_tds > 0 ? stat.receiving_tds : '-'}</TableCell>
                                  <TableCell align="right">
                                    {stat.receiving_epa !== undefined && stat.receiving_epa !== null ? stat.receiving_epa.toFixed(1) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {stat.receiving_epa_per_play !== undefined && stat.receiving_epa_per_play !== null ? stat.receiving_epa_per_play.toFixed(3) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {stat.receiving_success_rate !== undefined && stat.receiving_success_rate !== null ? stat.receiving_success_rate.toFixed(1) : '-'}
                                  </TableCell>
                                </>
                              )}
                              <TableCell align="right">
                                {stat.success_rate !== undefined && stat.success_rate !== null ? stat.success_rate.toFixed(1) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              )}

              <Card sx={{ mb: 4 }}>
                <CardHeader
                  title="Yearly Statistics"
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <CardContent sx={{ p: 0 }}>
                  {statsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                      <CircularProgress />
                    </Box>
                  ) : playerStats.length === 0 ? (
                    <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
                      No stats available for this player
                    </Box>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ 
                            backgroundColor: 'rgba(0, 0, 0, 0.05)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
                          }}>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 'bold' }}>Season</TableCell>
                            <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Games</TableCell>
                            {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Yds</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass TD</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Int</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Sacks</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Att</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Comp</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Comp %</TableCell>
                              </>
                            )}
                            {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right">Rush Yds</TableCell>
                                <TableCell align="right">Rush TD</TableCell>
                                <TableCell align="right">Rush Att</TableCell>
                              </>
                            )}
                            {shouldShowReceivingColumns(selectedPlayer.position, playerStats) && (
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
                                backgroundColor: stat.season === 2025 ? 'rgba(25, 118, 210, 0.15)' : 'inherit',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                                  boxShadow: 'inset 0 0 15px rgba(255, 255, 255, 0.1)',
                                  borderRadius: '4px',
                                },
                              }}
                            >
                              <TableCell sx={{ fontWeight: 'bold', color: '#ffffff' }}>
                                {stat.season === 2025 ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <span>{stat.season}</span>
                                    <Chip 
                                      label="Active" 
                                      size="small" 
                                      color="primary" 
                                      variant="outlined"
                                      sx={{ height: 20 }}
                                    />
                                  </Box>
                                ) : (
                                  stat.season
                                )}
                              </TableCell>
                              <TableCell align="right">{stat.gameCount}</TableCell>
                              {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">{stat.passingYds > 0 ? stat.passingYds : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_tds > 0 ? stat.passing_tds : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_interceptions > 0 ? stat.passing_interceptions : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_sacks > 0 ? stat.passing_sacks : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_attempts > 0 ? stat.passing_attempts : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_completions > 0 ? stat.passing_completions : '-'}</TableCell>
                                  <TableCell align="right">{stat.passing_completions > 0 && stat.passing_attempts > 0 ? `${(stat.passing_completions / stat.passing_attempts * 100).toFixed(1)}%` : '-'}</TableCell>
                                </>
                              )}
                              {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">{stat.rushingYds > 0 ? stat.rushingYds : '-'}</TableCell>
                                  <TableCell align="right">{stat.rushing_tds > 0 ? stat.rushing_tds : '-'}</TableCell>
                                  <TableCell align="right">{stat.rushing_attempts > 0 ? stat.rushing_attempts : '-'}</TableCell>
                                </>
                              )}
                              {shouldShowReceivingColumns(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">{stat.targets > 0 ? stat.targets : '-'}</TableCell>
                                  <TableCell align="right">{stat.receptions > 0 ? stat.receptions : '-'}</TableCell>
                                  <TableCell align="right">{stat.receivingYds > 0 ? stat.receivingYds : '-'}</TableCell>
                                  <TableCell align="right">{stat.receiving_tds > 0 ? stat.receiving_tds : '-'}</TableCell>
                                </>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </CardContent>
              </Card>

              {/* Median Stats Table */}
              {playerMedians.length > 0 && (
                <Card sx={{ mb: 4 }}>
                  <CardHeader
                    title="Per-Attempt Performance Metrics"
                    subheader="Median and average yards per pass attempt, rushing attempt, and reception"
                    titleTypographyProps={{ variant: 'h6' }}
                  />
                  <CardContent sx={{ p: 0 }}>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ 
                            backgroundColor: 'rgba(0, 0, 0, 0.05)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
                          }}>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 'bold' }}>Season</TableCell>
                            {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Att (Med)</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass Att (Avg)</TableCell>
                              </>
                            )}
                            {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush Att (Med)</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush Att (Avg)</TableCell>
                              </>
                            )}
                            {shouldShowReceivingColumns(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Reception (Med)</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Reception (Avg)</TableCell>
                              </>
                            )}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {playerMedians.map((median) => (
                            <TableRow 
                              key={median.season} 
                              hover
                              sx={{
                                backgroundColor: median.season === 2025 ? 'rgba(25, 118, 210, 0.15)' : 'inherit',
                              }}
                            >
                              <TableCell sx={{ fontWeight: 'bold' }}>
                                {median.season === 2025 ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <span>{median.season}</span>
                                    <Chip 
                                      label="Active" 
                                      size="small" 
                                      color="primary" 
                                      variant="outlined"
                                      sx={{ height: 20 }}
                                    />
                                  </Box>
                                ) : (
                                  median.season
                                )}
                              </TableCell>
                              {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">
                                    {median.median_yards_per_pass_attempt 
                                      ? median.median_yards_per_pass_attempt.toFixed(1)
                                      : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {median.average_yards_per_pass_attempt 
                                      ? median.average_yards_per_pass_attempt.toFixed(1)
                                      : '-'}
                                  </TableCell>
                                </>
                              )}
                              {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">
                                    {median.median_yards_per_rushing_attempt 
                                      ? median.median_yards_per_rushing_attempt.toFixed(1)
                                      : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {median.average_yards_per_rushing_attempt 
                                      ? median.average_yards_per_rushing_attempt.toFixed(1)
                                      : '-'}
                                  </TableCell>
                                </>
                              )}
                              {shouldShowReceivingColumns(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">
                                    {median.median_yards_per_reception 
                                      ? median.median_yards_per_reception.toFixed(1)
                                      : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {median.average_yards_per_reception 
                                      ? median.average_yards_per_reception.toFixed(1)
                                      : '-'}
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              )}

              {/* Advanced Metrics Table */}
              {advancedMetrics.length > 0 && (
                <Card sx={{ mb: 4 }}>
                  <CardHeader
                    title="Advanced Metrics"
                    subheader="EPA, EPA per play, CPOE, and success rates"
                    titleTypographyProps={{ variant: 'h6' }}
                  />
                  <CardContent sx={{ p: 0 }}>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ 
                            backgroundColor: 'rgba(0, 0, 0, 0.05)',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
                          }}>
                            <TableCell sx={{ color: '#ffffff', fontWeight: 'bold' }}>Season</TableCell>
                            <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>EPA</TableCell>
                            {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass EPA</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass EPA/Pl</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Pass SR %</TableCell>
                              </>
                            )}
                            {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                              <>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush EPA</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush EPA/Pl</TableCell>
                                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Rush SR %</TableCell>
                              </>
                            )}
                            {selectedPlayer.position === 'QB' && (
                              <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>CPOE %</TableCell>
                            )}
                            <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 'bold' }}>Overall SR %</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {advancedMetrics.map((metric) => (
                            <TableRow
                              key={`${metric.playerId}-${metric.season}`}
                              hover
                              sx={{
                                backgroundColor: metric.season === 2025 ? 'rgba(25, 118, 210, 0.15)' : 'inherit',
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
                                      sx={{ height: 20 }}
                                    />
                                  </Box>
                                ) : (
                                  metric.season
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {metric.epa !== null ? metric.epa.toFixed(1) : '-'}
                              </TableCell>
                              {shouldShowPassingColumns(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">
                                    {metric.passing_epa !== null ? metric.passing_epa.toFixed(1) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {metric.passing_epa_per_play !== null ? metric.passing_epa_per_play.toFixed(3) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {metric.passing_success_rate !== null ? metric.passing_success_rate.toFixed(1) : '-'}
                                  </TableCell>
                                </>
                              )}
                              {shouldShowRushingColumnsWR(selectedPlayer.position, playerStats) && (
                                <>
                                  <TableCell align="right">
                                    {metric.rushing_epa !== null ? metric.rushing_epa.toFixed(1) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {metric.rushing_epa_per_play !== null ? metric.rushing_epa_per_play.toFixed(3) : '-'}
                                  </TableCell>
                                  <TableCell align="right">
                                    {metric.rushing_success_rate !== null ? metric.rushing_success_rate.toFixed(1) : '-'}
                                  </TableCell>
                                </>
                              )}
                              {selectedPlayer.position === 'QB' && (
                                <TableCell align="right">
                                  {metric.cpoe !== null ? metric.cpoe.toFixed(1) : '-'}
                                </TableCell>
                              )}
                              <TableCell align="right">
                                {metric.success_rate !== null ? metric.success_rate.toFixed(1) : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}
