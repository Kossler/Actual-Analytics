export const runtime = 'experimental-edge';
// Enable Edge Runtime for Cloudflare Pages Functions (Next.js 15.x)
import { useRouter } from 'next/router';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { sortWeeklyStats } from '../../utils/statsUtils';
import {
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
  const lastResolvedPlayerIdRef = useRef(null);

  // Background image (with 1% chance of special variant)
  const backgroundImage = useBackgroundImage(0.01);

  // Search and player selection state
  const [selectedPlayer, setSelectedPlayer] = useState(initialPlayer || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const { players: searchPlayers } = usePlayerSearch(apiUrl, searchQuery);
  const { stats: rawPlayerStats, loading: statsLoading } = usePlayerStats(selectedPlayer?.gsis_id || gsis_id, apiUrl);
  const { weeklyStats: rawWeeklyStats } = useWeeklyStats(selectedPlayer?.gsis_id || gsis_id, apiUrl, selectedYear);
  const { allWeeklyStats } = useAllWeeklyStats(selectedPlayer?.gsis_id || gsis_id, apiUrl);
  const { advancedMetrics } = useAdvancedMetrics(selectedPlayer?.gsis_id || gsis_id, apiUrl);
  const { allStats } = useAllPlayerStats(apiUrl, selectedYear);
  const { availableYears } = useAvailableYears(apiUrl);

  // Resolve selected player when navigating directly to /players/:id.
  // Prefer SSR-provided initialPlayer; otherwise fetch minimal metadata once per gsis_id.
  useEffect(() => {
    if (!gsis_id) return;

    const currentId = String(gsis_id);
    if (lastResolvedPlayerIdRef.current === currentId) return;

    // If SSR already provided the correct player, use it and skip fetch.
    if (initialPlayer && initialPlayer.gsis_id === currentId) {
      setSelectedPlayer(initialPlayer);
      lastResolvedPlayerIdRef.current = currentId;
      return;
    }

    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/players/${currentId}`, { signal: controller.signal });
        if (!res.ok) return;
        const player = await res.json();
        setSelectedPlayer(player);
        lastResolvedPlayerIdRef.current = currentId;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        // eslint-disable-next-line no-console
        console.error('[PlayerPage] Error fetching player by gsis_id:', err);
      }
    })();

    return () => controller.abort();
  }, [gsis_id, apiUrl, initialPlayer]);

  const availableYearsFromWeekly = useMemo(() => {
    if (!allWeeklyStats || allWeeklyStats.length === 0) return [];
    return [...new Set(allWeeklyStats.map(s => s.season))].sort((a, b) => b - a);
  }, [allWeeklyStats]);

  // Update selectedYear when player changes to most recent available year (but don't fight user changes).
  useEffect(() => {
    const playerId = selectedPlayer?.gsis_id || gsis_id;
    if (!playerId || availableYearsFromWeekly.length === 0) return;
    if (lastResolvedPlayerIdRef.current !== String(playerId)) return;

    if (!availableYearsFromWeekly.includes(selectedYear)) {
      setSelectedYear(availableYearsFromWeekly[0]);
    }
  }, [selectedPlayer?.gsis_id, gsis_id, availableYearsFromWeekly, selectedYear]);

    // Process stats data
    // `rawPlayerStats` already comes from the backend as season-aggregated rows.
    // Re-aggregating it via groupStatsBySeason() drops newer fields (e.g. TFL, QB hits).
  const playerStats = useMemo(() => {
    if (!Array.isArray(rawPlayerStats)) return [];
    return [...rawPlayerStats].sort((a, b) => (Number(b.season) || 0) - (Number(a.season) || 0));
  }, [rawPlayerStats]);

  const weeklyStats = useMemo(() => sortWeeklyStats(rawWeeklyStats), [rawWeeklyStats]);

  const normalizePlayer = useCallback((player) => {
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
  }, []);

  const normalizedSearchPlayers = useMemo(
    () => (Array.isArray(searchPlayers) ? searchPlayers.map(normalizePlayer) : []),
    [searchPlayers, normalizePlayer]
  );

    // Handle player selection
  const handleSelectPlayer = useCallback(
    (player) => {
      const normalized = normalizePlayer(player);
      setSelectedPlayer(normalized);
      setSearchQuery('');

      if (normalized && normalized.gsis_id) {
        router.replace(`/players/${normalized.gsis_id}`, undefined, { shallow: true });
      }
    },
    [normalizePlayer, router]
  );

    // Always normalize selectedPlayer before passing to UI components
  const normalizedSelectedPlayer = useMemo(
    () => normalizePlayer(selectedPlayer),
    [selectedPlayer, normalizePlayer]
  );

  const isDefensivePlayer = useMemo(() => {
    const pos = String(normalizedSelectedPlayer?.position || '').toUpperCase();
    const defensivePositions = new Set([
      // Secondary
      'CB', 'S', 'FS', 'SS', 'DB', 'SAF', 'COR',
      // Linebackers
      'LB', 'ILB', 'OLB', 'MLB', 'WLB', 'SLB',
      // Defensive line / front
      'DL', 'DE', 'DT', 'NT', 'EDGE',
      // Team defenses / misc
      'DEF', 'DST',
    ]);

    if (defensivePositions.has(pos)) return true;

    // Some feeds provide compound labels like "LB/EDGE" or similar.
    return pos.includes('LB') || pos.includes('DL') || pos.includes('DB') || pos.includes('EDGE');
  }, [normalizedSelectedPlayer?.position]);

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
              players={normalizedSearchPlayers}
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
                  availableYears={availableYearsFromWeekly}
                />
                <YearlyStatsTable
                  playerStats={playerStats}
                  position={normalizedSelectedPlayer.position}
                  loading={statsLoading}
                />
                {!isDefensivePlayer && (
                  <AdvancedMetricsTable
                    advancedMetrics={advancedMetrics}
                    position={normalizedSelectedPlayer.position}
                    playerStats={playerStats}
                    loading={false}
                  />
                )}
                <PlayerScatterPlot
                  playerStats={rawPlayerStats}
                  weeklyStats={weeklyStats}
                  advancedMetrics={advancedMetrics}
                  selectedPlayerId={normalizedSelectedPlayer.gsis_id}
                  allPlayerStats={allStats}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                  availableYears={availableYearsFromWeekly.length > 0 ? availableYearsFromWeekly : availableYears}
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