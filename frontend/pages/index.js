import { useState, useEffect } from 'react';
import { Container, Box } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';

// Theme
import theme from '../theme/theme';

// Components
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import PlayerInfo from '../components/PlayerInfo';
import WeeklyStatsTable from '../components/WeeklyStatsTable';
import YearlyStatsTable from '../components/YearlyStatsTable';
import AdvancedMetricsTable from '../components/AdvancedMetricsTable';
import PlayerScatterPlot from '../components/PlayerScatterPlot';

// Custom Hooks
import {
  useAllPlayers,
  usePlayerStats,
  useWeeklyStats,
  useAllWeeklyStats,
  useAdvancedMetrics,
  useBackgroundImage,
  useAllPlayerStats,
  useAvailableYears,
} from '../hooks/usePlayerData';
import { usePlayerSearch } from '../hooks/usePlayerSearch';

// Utils
import { groupStatsBySeason, sortWeeklyStats } from '../utils/statsUtils';

/**
 * Main application component
 * Simplified to orchestrate components and manage high-level state
 */
export default function Home() {
  // API URL configuration
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Background image with 1% chance of special variant
  const backgroundImage = useBackgroundImage(0.01);

  // Search state
  const [selectedPlayer, setSelectedPlayer] = useState(null);
    // ...existing code...

    // (moved below allPlayers declaration)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(2025);

  // Data fetching hooks
  const { players: searchPlayers, loading: searchLoading } = usePlayerSearch(apiUrl, searchQuery);
  const { players: allPlayers } = useAllPlayers(apiUrl);

  // No player is selected by default. Only setSelectedPlayer when a player is searched/selected.
  const { stats: rawPlayerStats, loading: statsLoading } = usePlayerStats(
    selectedPlayer?.gsis_id,
    apiUrl
  );
  const { weeklyStats: rawWeeklyStats } = useWeeklyStats(
    selectedPlayer?.gsis_id,
    apiUrl,
    selectedYear
  );
  const { allWeeklyStats } = useAllWeeklyStats(
    selectedPlayer?.gsis_id,
    apiUrl
  );
  const { advancedMetrics } = useAdvancedMetrics(selectedPlayer?.id, apiUrl);
  const { allStats } = useAllPlayerStats(apiUrl, selectedYear);
  const { availableYears } = useAvailableYears(apiUrl);

  // Update selectedYear when player changes to most recent available year
  useEffect(() => {
    if (selectedPlayer && allWeeklyStats.length > 0) {
      const years = [...new Set(allWeeklyStats.map(s => s.season))].sort((a, b) => b - a);
      if (years.length > 0) {
        setSelectedYear(years[0]);
      }
    }
  }, [selectedPlayer, allWeeklyStats]);
  // Process stats data
  const playerStats = groupStatsBySeason(rawPlayerStats);
  const weeklyStats = sortWeeklyStats(rawWeeklyStats);

  // Helper to normalize player object for UI compatibility
  function normalizePlayer(player) {
    if (!player) return null;
    return {
      ...player,
      id: player.gsis_id, // Use gsis_id for navigation and API
      name: player.display_name,
      team: player.latest_team,
      gsis_id: player.gsis_id,
    };
  }

  // Normalize player arrays for SearchBar
  const normalizedSearchPlayers = searchPlayers.map(normalizePlayer);
  const normalizedAllPlayers = allPlayers.map(normalizePlayer);

  // Handle player selection
  const handleSelectPlayer = (player) => {
    console.log('[handleSelectPlayer] raw player:', player);
    const normalized = normalizePlayer(player);
    console.log('[handleSelectPlayer] normalized player:', normalized);
    setSelectedPlayer(normalized);
    setSearchQuery('');
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
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
          },
        }}
      >
        <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <Header />

          {/* Search Bar */}
          <SearchBar
            players={searchQuery ? normalizedSearchPlayers : normalizedAllPlayers}
            selectedPlayer={selectedPlayer}
            onSelectPlayer={handleSelectPlayer}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          {/* Selected Player Info */}
          {selectedPlayer && <PlayerInfo player={selectedPlayer} />}

          {/* Stats Tables */}
          {selectedPlayer && (
            <>
              {/* Weekly Stats for Current Season */}
              <WeeklyStatsTable
                weeklyStats={weeklyStats}
                position={selectedPlayer.position}
                playerStats={playerStats}
                loading={false}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
                availableYears={allWeeklyStats.length > 0 ? [...new Set(allWeeklyStats.map(s => s.season))].sort((a, b) => b - a) : []}
              />

              {/* Yearly Aggregated Stats */}
              <YearlyStatsTable
                playerStats={playerStats}
                position={selectedPlayer.position}
                loading={statsLoading}
              />

              {/* Advanced Metrics (EPA, Success Rate, etc.) */}
              <AdvancedMetricsTable
                advancedMetrics={advancedMetrics}
                position={selectedPlayer.position}
                playerStats={playerStats}
                loading={false}
              />

              {/* Player Comparison Scatter Plot */}
              <PlayerScatterPlot
                playerStats={rawPlayerStats}
                weeklyStats={rawWeeklyStats}
                advancedMetrics={advancedMetrics}
                selectedPlayerId={selectedPlayer.gsis_id}
                allPlayerStats={allStats}
                selectedYear={selectedYear}
                onYearChange={setSelectedYear}
                availableYears={availableYears}
              />
            </>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}
