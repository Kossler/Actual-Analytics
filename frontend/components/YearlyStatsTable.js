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

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  // Calculate career totals using new schema
  const careerTotals = playerStats.reduce((totals, stat) => ({
    game_count: toNumber(totals.game_count) + toNumber(stat.game_count),
    passing_yards: toNumber(totals.passing_yards) + toNumber(stat.passing_yards),
    passing_tds: toNumber(totals.passing_tds) + toNumber(stat.passing_tds),
    passing_interceptions: toNumber(totals.passing_interceptions) + toNumber(stat.passing_interceptions),
    sacks_suffered: toNumber(totals.sacks_suffered) + toNumber(stat.sacks_suffered),
    attempts: toNumber(totals.attempts) + toNumber(stat.attempts),
    completions: toNumber(totals.completions) + toNumber(stat.completions),
    pressures: toNumber(totals.pressures) + toNumber(stat.pressures),
    rushing_yards: toNumber(totals.rushing_yards) + toNumber(stat.rushing_yards),
    rushing_tds: toNumber(totals.rushing_tds) + toNumber(stat.rushing_tds),
    carries: toNumber(totals.carries) + toNumber(stat.carries),
    targets: toNumber(totals.targets) + toNumber(stat.targets),
    receptions: toNumber(totals.receptions) + toNumber(stat.receptions),
    receiving_yards: toNumber(totals.receiving_yards) + toNumber(stat.receiving_yards),
    receiving_tds: toNumber(totals.receiving_tds) + toNumber(stat.receiving_tds),
    receiving_epa: toNumber(totals.receiving_epa) + toNumber(stat.receiving_epa),
    // Defensive totals
    def_tackles_solo: toNumber(totals.def_tackles_solo) + toNumber(stat.def_tackles_solo),
    def_tackle_assists: toNumber(totals.def_tackle_assists) + toNumber(stat.def_tackle_assists),
    def_tackles_for_loss: toNumber(totals.def_tackles_for_loss) + toNumber(stat.def_tackles_for_loss),
    def_tackles_for_loss_yards: toNumber(totals.def_tackles_for_loss_yards) + toNumber(stat.def_tackles_for_loss_yards),
    def_fumbles_forced: toNumber(totals.def_fumbles_forced) + toNumber(stat.def_fumbles_forced),
    def_sacks: toNumber(totals.def_sacks) + toNumber(stat.def_sacks),
    def_sack_yards: toNumber(totals.def_sack_yards) + toNumber(stat.def_sack_yards),
    def_qb_hits: toNumber(totals.def_qb_hits) + toNumber(stat.def_qb_hits),
    def_interceptions: toNumber(totals.def_interceptions) + toNumber(stat.def_interceptions),
    def_interception_yards: toNumber(totals.def_interception_yards) + toNumber(stat.def_interception_yards),
    def_pass_defended: toNumber(totals.def_pass_defended) + toNumber(stat.def_pass_defended),
    def_tds: toNumber(totals.def_tds) + toNumber(stat.def_tds),
    def_fumbles: toNumber(totals.def_fumbles) + toNumber(stat.def_fumbles),
    def_safeties: toNumber(totals.def_safeties) + toNumber(stat.def_safeties),
    fumble_recovery_own: toNumber(totals.fumble_recovery_own) + toNumber(stat.fumble_recovery_own),
    fumble_recovery_opp: toNumber(totals.fumble_recovery_opp) + toNumber(stat.fumble_recovery_opp),
  }), {});

  // Helper calculations
  const completionPct = (comp, att) => att ? ((comp / att) * 100).toFixed(1) : '-';
  const yardsPerAttempt = (yards, att) => att ? (yards / att).toFixed(2) : '-';
  const roundEPA = val => (val !== null && val !== undefined && !isNaN(val)) ? Number(val).toFixed(3) : '-';
  const roundCPOE = val => (val !== null && val !== undefined && !isNaN(val)) ? Number(val).toFixed(3) : '-';
  const epaPerPlay = (epa, att) => att ? (Number(epa) / Number(att)).toFixed(3) : '-';
  const pressureRatePct = (pressures, attempts, sacks) => {
    const p = Number(pressures) || 0;
    const dropbacks = (Number(attempts) || 0) + (Number(sacks) || 0);
    return dropbacks ? ((p / dropbacks) * 100).toFixed(1) : '-';
  };
  const catchPct = (rec, tgt) => tgt ? ((rec / tgt) * 100).toFixed(1) : '-';
  const receivingYdsPerAttempt = (yards, att) => att ? (yards / att).toFixed(2) : '-';
  // Table columns by position
  const columnsQB = [
    { label: 'Games', value: stat => Number(stat.game_count) },
    { label: 'Cmp', value: stat => displayStat(stat.completions) },
    { label: 'Att', value: stat => displayStat(stat.attempts) },
    { label: 'Completion %', value: stat => completionPct(stat.completions, stat.attempts) },
    { label: 'Yds/Att', value: stat => yardsPerAttempt(stat.passing_yards, stat.attempts) },
    { label: 'Pass TD', value: stat => displayStat(stat.passing_tds) },
    { label: 'INT', value: stat => displayStat(stat.passing_interceptions) },
    { label: 'Sacks', value: stat => displayStat(stat.sacks_suffered) },
    { label: 'Pressure %', value: stat => pressureRatePct(stat.pressures, stat.attempts, stat.sacks_suffered) },
    { label: 'Pass EPA', value: stat => roundEPA(stat.passing_epa) },
    { label: 'EPA/Play', value: stat => epaPerPlay(stat.passing_epa, stat.attempts) },
    { label: 'CPOE', value: stat => roundCPOE(stat.passing_cpoe) },
    { label: 'Carries', value: stat => displayStat(stat.carries) },
    { label: 'Rush Yds/Att', value: stat => yardsPerAttempt(stat.rushing_yards, stat.carries) },
    { label: 'Rush TD', value: stat => displayStat(stat.rushing_tds) },
    { label: 'Rush EPA', value: stat => roundEPA(stat.rushing_epa) },
    { label: 'Rush EPA/Play', value: stat => epaPerPlay(stat.rushing_epa, stat.carries) },
  ];
  const columnsWRTE = [
    { label: 'Games', value: stat => Number(stat.game_count) },
    { label: 'Rec', value: stat => displayStat(stat.receptions) },
    { label: 'Tgt', value: stat => displayStat(stat.targets) },
    { label: 'Catch %', value: stat => catchPct(stat.receptions, stat.targets) },
    { label: 'Yds/Catch', value: stat => receivingYdsPerAttempt(stat.receiving_yards, stat.receptions) },
    { label: 'Receiving Yds', value: stat => displayStat(stat.receiving_yards) },
    { label: 'Rec EPA', value: stat => roundEPA(stat.receiving_epa) },
    { label: 'Pass EPA/Play', value: stat => epaPerPlay(stat.passing_epa, stat.attempts) },
  ];
  const columnsRB = [
    { label: 'Games', value: stat => Number(stat.game_count) },
    { label: 'Rec', value: stat => displayStat(stat.receptions) },
    { label: 'Tgt', value: stat => displayStat(stat.targets) },
    { label: 'Catch %', value: stat => catchPct(stat.receptions, stat.targets) },
    { label: 'Yds/Catch', value: stat => receivingYdsPerAttempt(stat.receiving_yards, stat.receptions) },
    { label: 'Receiving Yds', value: stat => displayStat(stat.receiving_yards) },
    { label: 'Rec EPA', value: stat => roundEPA(stat.receiving_epa) },
    { label: 'Rush Yds/Att', value: stat => yardsPerAttempt(stat.rushing_yards, stat.carries) },
    { label: 'Rush Yds', value: stat => displayStat(stat.rushing_yards) },
    { label: 'Rush TD', value: stat => displayStat(stat.rushing_tds) },
    { label: 'Rush EPA/Play', value: stat => epaPerPlay(stat.rushing_epa, stat.carries) },
  ];
  // Defensive positions (case-insensitive)
  const defensivePositions = [
    'CB', 'S', 'FS', 'SS', 'LB', 'ILB', 'OLB', 'DE', 'DT', 'NT', 'DL', 'DB', 'SAF', 'COR', 'MLB', 'WLB', 'SLB', 'EDGE'
  ];
  // Defensive columns
  const columnsDEF = [
    { label: 'Games', value: stat => Number(stat.game_count) },
    { label: 'Solo Tackles', value: stat => displayStat(stat.def_tackles_solo) },
    { label: 'Tackle Assists', value: stat => displayStat(stat.def_tackle_assists) },
    { label: 'TFL', value: stat => displayStat(stat.def_tackles_for_loss) },
    { label: 'TFL Yards', value: stat => displayStat(stat.def_tackles_for_loss_yards) },
    { label: 'Fumbles Forced', value: stat => displayStat(stat.def_fumbles_forced) },
    { label: 'Sacks', value: stat => displayStat(stat.def_sacks) },
    { label: 'Sack Yards', value: stat => displayStat(stat.def_sack_yards) },
    { label: 'QB Hits', value: stat => displayStat(stat.def_qb_hits) },
    { label: 'INT', value: stat => displayStat(stat.def_interceptions) },
    { label: 'INT Yards', value: stat => displayStat(stat.def_interception_yards) },
    { label: 'Passes Defended', value: stat => displayStat(stat.def_pass_defended) },
    { label: 'Def TD', value: stat => displayStat(stat.def_tds) },
    { label: 'Fumbles', value: stat => displayStat(stat.def_fumbles) },
    { label: 'Safeties', value: stat => displayStat(stat.def_safeties) },
  ];
  let columns;
  if (position === 'QB') columns = columnsQB;
  else if (position === 'WR' || position === 'TE') columns = columnsWRTE;
  else if (position === 'RB') columns = columnsRB;
  else if (position && defensivePositions.includes(position.toUpperCase())) columns = columnsDEF;
  else columns = columnsQB; // fallback

  // Helper to calculate averages for career row for EPA/Play and CPOE
  const getCareerValue = (col, stats, totals) => {
    // Average per season for EPA and EPA/Play columns
    if (col.label === 'Pass EPA') {
      const epaVals = stats.map(s => Number(s.passing_epa)).filter(v => !isNaN(v));
      if (epaVals.length === 0) return '-';
      const avg = epaVals.reduce((a, b) => a + b, 0) / epaVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'Rush EPA') {
      const epaVals = stats.map(s => Number(s.rushing_epa)).filter(v => !isNaN(v));
      if (epaVals.length === 0) return '-';
      const avg = epaVals.reduce((a, b) => a + b, 0) / epaVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'EPA/Play') {
      // Average EPA/Play per season
      const epaPlayVals = stats.map(s => {
        const att = Number(s.attempts) || 0;
        const epa = Number(s.passing_epa) || 0;
        return att ? epa / att : null;
      }).filter(v => v !== null && !isNaN(v));
      if (epaPlayVals.length === 0) return '-';
      const avg = epaPlayVals.reduce((a, b) => a + b, 0) / epaPlayVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'Rush EPA/Play') {
      // Average Rush EPA/Play per season
      const rushEpaPlayVals = stats.map(s => {
        const carries = Number(s.carries) || 0;
        const epa = Number(s.rushing_epa) || 0;
        return carries ? epa / carries : null;
      }).filter(v => v !== null && !isNaN(v));
      if (rushEpaPlayVals.length === 0) return '-';
      const avg = rushEpaPlayVals.reduce((a, b) => a + b, 0) / rushEpaPlayVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'CPOE') {
      // Average CPOE
      const cpoeVals = stats.map(s => Number(s.passing_cpoe)).filter(v => !isNaN(v));
      if (cpoeVals.length === 0) return '-';
      const avg = cpoeVals.reduce((a, b) => a + b, 0) / cpoeVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'Completion %') {
      const totalComp = stats.reduce((sum, s) => sum + (Number(s.completions) || 0), 0);
      const totalAtt = stats.reduce((sum, s) => sum + (Number(s.attempts) || 0), 0);
      return totalAtt ? ((totalComp / totalAtt) * 100).toFixed(1) : '-';
    }
    if (col.label === 'Pressure %') {
      return pressureRatePct(totals.pressures, totals.attempts, totals.sacks_suffered);
    }
    return col.value(totals);
  };

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
          {columns.map(col => (
            <TableCell key={col.label} align="right">{col.label}</TableCell>
          ))}
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
            {columns.map(col => (
              <TableCell key={col.label} align="right">{col.value(stat)}</TableCell>
            ))}
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
            {columns.map(col => (
              <TableCell key={col.label} align="right">{getCareerValue(col, playerStats, careerTotals)}</TableCell>
            ))}
          </TableRow>
        )}
      </TableBody>
    </StatsTableWrapper>
  );
}
