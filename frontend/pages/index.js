import { useState } from 'react';
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

// Custom Hooks
import {
  useAllPlayers,
  usePlayerStats,
  useWeeklyStats,
  useAdvancedMetrics,
  useBackgroundImage,
} from '../hooks/usePlayerData';

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
  const [searchQuery, setSearchQuery] = useState('');

  // Data fetching hooks
  const { players: allPlayers } = useAllPlayers(apiUrl);
  const { stats: rawPlayerStats, loading: statsLoading } = usePlayerStats(
    selectedPlayer?.id,
    apiUrl
  );
  const { weeklyStats: rawWeeklyStats } = useWeeklyStats(
    selectedPlayer?.id,
    apiUrl,
    2025
  );
  const { advancedMetrics } = useAdvancedMetrics(selectedPlayer?.id, apiUrl);

  // Process stats data
  const playerStats = groupStatsBySeason(rawPlayerStats);
  const weeklyStats = sortWeeklyStats(rawWeeklyStats);

  // Handle player selection
  const handleSelectPlayer = (player) => {
    setSelectedPlayer(player);
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
            players={allPlayers}
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
            </>
          )}
        </Container>
      </Box>
    </ThemeProvider>
  );
}
