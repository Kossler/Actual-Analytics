export const runtime = 'experimental-edge';
// Enable Edge Runtime for Cloudflare Pages Functions (Next.js 15.x)
import { useRouter } from 'next/router';
import { useState, useEffect, useMemo } from 'react';
import { Container, Box } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../../theme/theme';
import Header from '../../components/Header';
import SearchBar from '../../components/SearchBar';
import PlayerInfo from '../../components/PlayerInfo';
import WeeklyStatsTable from '../../components/WeeklyStatsTable';
import YearlyStatsTable from '../../components/YearlyStatsTable';
import AdvancedMetricsTable from '../../components/AdvancedMetricsTable';
import PlayerScatterPlot from '../../components/PlayerScatterPlot';
import { groupStatsBySeason, sortWeeklyStats } from '../../utils/statsUtils';
import {
  useAllPlayers,
  usePlayerStats,
  useWeeklyStats,
  useAllWeeklyStats,
  useAdvancedMetrics,
  useAllPlayerStats,
  useAvailableYears,
  useBackgroundImage,
} from '../../hooks/usePlayerData';
import { usePlayerSearch } from '../../hooks/usePlayerSearch';




export default function PlayerPage({ initialPlayer }) {
  const router = useRouter();
  const { id: gsis_id } = router.query;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Background image (with 1% chance of special variant)
  const backgroundImage = useBackgroundImage(0.01);

  // Search and player selection state
  const [selectedPlayer, setSelectedPlayer] = useState(initialPlayer || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const { players: searchPlayers } = usePlayerSearch(apiUrl, searchQuery);
  const { players: allPlayers } = useAllPlayers(apiUrl);
  const { stats: rawPlayerStats, loading: statsLoading } = usePlayerStats(selectedPlayer?.gsis_id || gsis_id, apiUrl);
  const { weeklyStats: rawWeeklyStats } = useWeeklyStats(selectedPlayer?.gsis_id || gsis_id, apiUrl, selectedYear);
  const { allWeeklyStats } = useAllWeeklyStats(selectedPlayer?.gsis_id || gsis_id, apiUrl);
  const { advancedMetrics } = useAdvancedMetrics(selectedPlayer?.gsis_id || gsis_id, apiUrl);
  const { allStats } = useAllPlayerStats(apiUrl, selectedYear);
  const { availableYears } = useAvailableYears(apiUrl);


    // Robust player selection and fallback logic
    useEffect(() => {
      if (!gsis_id) return;
      // Debug: log the gsis_id and allPlayers
      // eslint-disable-next-line no-console
      console.log('[PlayerPage] gsis_id from URL:', gsis_id);
      // eslint-disable-next-line no-console
      console.log('[PlayerPage] allPlayers:', allPlayers);
      // Log all gsis_id values for debugging
      if (allPlayers.length > 0) {
        const allGsisIds = allPlayers.map(p => p.gsis_id);
        console.log('[PlayerPage] allPlayers gsis_ids:', allGsisIds);
        // Try strict match, then fallback to trimmed match
        let found = allPlayers.find(p => p.gsis_id === gsis_id);
        if (!found) {
          found = allPlayers.find(p => (p.gsis_id || '').trim() === (gsis_id || '').trim());
          if (found) {
            console.log('[PlayerPage] found player with trimmed match:', found);
          }
        }
        console.log('[PlayerPage] found player:', found);
        if (found) {
          if (!selectedPlayer || selectedPlayer.gsis_id !== found.gsis_id) {
            setSelectedPlayer(found);
          }
          // removed invalid bare return
        }
      }
      // Fallback: fetch player metadata from backend if not found in allPlayers
      const fetchPlayerById = async () => {
        try {
          const res = await fetch(`${apiUrl}/api/players/${gsis_id}`);
          if (res.ok) {
            const player = await res.json();
            console.log('[PlayerPage] fetched player from /api/players/:gsis_id:', player);
            if (!selectedPlayer || selectedPlayer.gsis_id !== player.gsis_id) {
              setSelectedPlayer(player);
            }
          } else {
            console.warn('[PlayerPage] Player not found in backend:', gsis_id);
          }
        } catch (err) {
          console.error('[PlayerPage] Error fetching player by gsis_id:', err);
        }
      };
      fetchPlayerById();
      // Fallback: if stats loaded and no selectedPlayer, build from stats
      if (allPlayers.length > 0 && rawPlayerStats && rawPlayerStats.length > 0) {
        const base = rawPlayerStats[0];
        if (!selectedPlayer || selectedPlayer.gsis_id !== (base.gsis_id || gsis_id)) {
          setSelectedPlayer({
            id: base.gsis_id || gsis_id || 'unknown',
            gsis_id: base.gsis_id || gsis_id || 'unknown',
            name: base.display_name || base.name || 'Unknown Player',
            display_name: base.display_name || base.name || 'Unknown Player',
            team: base.latest_team || base.team_name || base.team || 'Unknown',
            position: base.position || 'N/A',
            ...base,
          });
        }
      }
    }, [gsis_id, allPlayers, rawPlayerStats]);

    // If navigated directly, set selectedPlayer from allPlayers or fallback to stats
    useEffect(() => {
      if (!gsis_id) return;
      // Try to find player in allPlayers and merge with stats if available
      if (allPlayers.length > 0) {
        const found = allPlayers.find(p => p.gsis_id === gsis_id);
        if (found) {
          // If stats are loaded, merge stats fields into found
          let merged = { ...found };
          if (rawPlayerStats && rawPlayerStats.length > 0) {
            const base = rawPlayerStats[0];
            merged = {
              ...merged,
              ...base,
              // Prefer allPlayers for these fields if present
              display_name: found.display_name || base.display_name || base.name || 'Unknown Player',
              name: found.display_name || base.display_name || base.name || 'Unknown Player',
              team: found.latest_team || found.team || base.latest_team || base.team_name || base.team || 'Unknown',
              team_name: found.latest_team || found.team || base.latest_team || base.team_name || base.team || 'Unknown',
              position: found.position || base.position || 'N/A',
            };
          }
          setSelectedPlayer(merged);
          // removed invalid bare return
        }
      }
      // Fallback: if stats loaded and no selectedPlayer, build from stats
      if (!selectedPlayer && rawPlayerStats && rawPlayerStats.length > 0) {
        const base = rawPlayerStats[0];
        setSelectedPlayer({
          id: base.gsis_id || gsis_id || 'unknown',
          gsis_id: base.gsis_id || gsis_id || 'unknown',
          name: base.display_name || base.name || 'Unknown Player',
          display_name: base.display_name || base.name || 'Unknown Player',
          team: base.latest_team || base.team_name || base.team || 'Unknown',
          team_name: base.latest_team || base.team_name || base.team || 'Unknown',
          position: base.position || 'N/A',
          ...base,
        });
      }
    }, [gsis_id, allPlayers, rawPlayerStats]);

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
        id: player.gsis_id,
        gsis_id: player.gsis_id,
        name: player.display_name || player.name || 'Unknown Player',
        display_name: player.display_name || player.name || 'Unknown Player',
        team: player.latest_team || player.team || player.team_name || 'Unknown',
        team_name: player.latest_team || player.team || player.team_name || 'Unknown',
        position: player.position || 'N/A',
      };
    }
    const normalizedSearchPlayers = searchPlayers.map(normalizePlayer);
    const normalizedAllPlayers = allPlayers.map(normalizePlayer);

    // Handle player selection
    const handleSelectPlayer = (player) => {
      const normalized = normalizePlayer(player);
      setSelectedPlayer(normalized);
      setSearchQuery('');
      // Update URL to reflect selected player
      if (normalized && normalized.gsis_id) {
        router.replace(`/players/${normalized.gsis_id}`, undefined, { shallow: true });
      }
    };

    // Always normalize selectedPlayer before passing to UI components
    const normalizedSelectedPlayer = normalizePlayer(selectedPlayer);

    // If no player is selected, show search and allow navigation back to homepage
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
            <Header />

            {/* Search Bar */}
            <SearchBar
              players={searchQuery ? normalizedSearchPlayers : normalizedAllPlayers}
              selectedPlayer={normalizedSelectedPlayer}
              onSelectPlayer={handleSelectPlayer}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {/* If no player is selected, show a message and link to homepage */}
            {!normalizedSelectedPlayer && (
              <Box sx={{ mt: 4, textAlign: 'center' }}>
                <h2>Select a player to view stats</h2>
                <a href="/" style={{ color: '#42a5f5', textDecoration: 'underline' }}>Back to homepage</a>
              </Box>
            )}

            {/* Selected Player Info and Stats */}
            {normalizedSelectedPlayer && (
              <>
                <PlayerInfo player={normalizedSelectedPlayer} />
                <WeeklyStatsTable
                  weeklyStats={weeklyStats}
                  position={normalizedSelectedPlayer.position}
                  playerStats={playerStats}
                  loading={statsLoading}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                  availableYears={allWeeklyStats.length > 0 ? [...new Set(allWeeklyStats.map(s => s.season))].sort((a, b) => b - a) : []}
                />
                <YearlyStatsTable
                  playerStats={playerStats}
                  position={normalizedSelectedPlayer.position}
                  loading={statsLoading}
                />
                <AdvancedMetricsTable
                  advancedMetrics={advancedMetrics}
                  position={normalizedSelectedPlayer.position}
                  playerStats={playerStats}
                  loading={false}
                />
                <PlayerScatterPlot
                  playerStats={rawPlayerStats}
                  weeklyStats={weeklyStats}
                  advancedMetrics={advancedMetrics}
                  selectedPlayerId={normalizedSelectedPlayer.gsis_id}
                  allPlayerStats={allStats}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                  availableYears={
                    allWeeklyStats.length > 0
                      ? [...new Set(allWeeklyStats.map(s => s.season))].sort((a, b) => b - a)
                      : []
                  }
                />
              </>
            )}
          </Container>
        </Box>
      </ThemeProvider>
    );
  }

// Force SSR for dynamic route on Cloudflare Pages
export async function getServerSideProps(context) {
  const { id } = context.params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Fetch player data from your backend API
  const res = await fetch(`${apiUrl}/api/players/${id}`);
  if (!res.ok) {
    // If not found, show 404
    return { notFound: true };
  }
  const player = await res.json();

  return {
    props: {
      initialPlayer: player,
    },
  };
}