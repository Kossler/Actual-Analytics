export const runtime = 'experimental-edge';
// Enable Edge Runtime for Cloudflare Pages Functions (Next.js 15.x)
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useState, useMemo, useCallback } from 'react';
import { Container, Box } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import theme from '../../theme/theme';
import Header from '../../components/Header';
import SearchBar from '../../components/SearchBar';
import PlayerInfo from '../../components/PlayerInfo';
import WeeklyStatsTable from '../../components/WeeklyStatsTable';
import YearlyStatsTable from '../../components/YearlyStatsTable';
import AdvancedMetricsTable from '../../components/AdvancedMetricsTable';
import { sortWeeklyStats } from '../../utils/statsUtils';
import {
  useAllPlayerStats,
  useAvailableYears,
  useBackgroundImage,
} from '../../hooks/usePlayerData';

// The scatter plot sits below the fold and pulls in recharts; load it after the tables.
const PlayerScatterPlot = dynamic(() => import('../../components/PlayerScatterPlot'), {
  ssr: false,
  loading: () => <Box sx={{ minHeight: 480 }} />,
});

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

export default function PlayerPage({ profile }) {
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Background image (with 1% chance of special variant)
  const backgroundImage = useBackgroundImage(0.01);

  // Everything except the league-wide scatter data arrives server-side in one /profile request.
  const { seasons = [], weekly: allWeeklyStats = [], advanced = [] } = profile;
  const normalizedSelectedPlayer = useMemo(() => normalizePlayer(profile.player), [profile.player]);
  const playerId = normalizedSelectedPlayer.gsis_id;

  const [searchQuery, setSearchQuery] = useState('');

  const availableYearsFromWeekly = useMemo(
    () => [...new Set(allWeeklyStats.map((s) => s.season))].sort((a, b) => Number(b) - Number(a)),
    [allWeeklyStats]
  );
  // Only needed as a fallback for players without any weekly rows.
  const { availableYears } = useAvailableYears(availableYearsFromWeekly.length > 0 ? null : apiUrl);

  // The year picker resets to the player's latest season whenever the player changes. Deriving it
  // (instead of syncing it in an effect) avoids fetching the scatter data for a stale year first.
  const [yearChoice, setYearChoice] = useState({ playerId, year: null });
  const defaultYear = availableYearsFromWeekly[0] ?? availableYears[0];
  const selectedYear = yearChoice.playerId === playerId && yearChoice.year != null ? yearChoice.year : defaultYear;
  const setSelectedYear = useCallback((year) => setYearChoice({ playerId, year }), [playerId]);

  const { allStats } = useAllPlayerStats(apiUrl, selectedYear);

  // `seasons` already comes from the backend as season-aggregated rows.
  // Re-aggregating it via groupStatsBySeason() drops newer fields (e.g. TFL, QB hits).
  const playerStats = useMemo(
    () => [...seasons].sort((a, b) => (Number(b.season) || 0) - (Number(a.season) || 0)),
    [seasons]
  );

  const weeklyStats = useMemo(
    () => sortWeeklyStats(allWeeklyStats.filter((s) => String(s.season) === String(selectedYear))),
    [allWeeklyStats, selectedYear]
  );

  const advancedMetrics = useMemo(
    () => [...advanced].sort((a, b) => b.season - a.season),
    [advanced]
  );

  const handleSelectPlayer = useCallback(
    (player) => {
      setSearchQuery('');
      if (player?.gsis_id) {
        router.push(
          { pathname: '/players/[id]', query: { id: player.gsis_id } },
          `/players/${player.gsis_id}`
        );
      }
    },
    [router]
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
              selectedPlayer={normalizedSelectedPlayer}
              onSelectPlayer={handleSelectPlayer}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            {/* Selected Player Info and Stats */}
            {normalizedSelectedPlayer && (
              <>
                <PlayerInfo player={normalizedSelectedPlayer} />
                <WeeklyStatsTable
                  weeklyStats={weeklyStats}
                  position={normalizedSelectedPlayer.position}
                  playerStats={playerStats}
                  loading={false}
                  selectedYear={selectedYear}
                  onYearChange={setSelectedYear}
                  availableYears={availableYearsFromWeekly}
                />
                <YearlyStatsTable
                  playerStats={playerStats}
                  position={normalizedSelectedPlayer.position}
                  loading={false}
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
                  playerStats={seasons}
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

  // One request for metadata, season totals, weekly rows and advanced metrics.
  const res = await fetch(`${apiUrl}/api/players/${encodeURIComponent(id)}/profile`);
  if (res.status === 404) {
    return { notFound: true };
  }
  if (!res.ok) {
    throw new Error(`Failed to load player ${id}: ${res.status}`);
  }

  return {
    props: {
      profile: await res.json(),
    },
  };
}
