import { TableHead, TableBody, TableRow, TableCell, Box, Chip, Tooltip } from '@mui/material';
import StatsTableWrapper from './StatsTableWrapper';
import {
  displayStat,
  shouldShowPassingColumns,
  shouldShowRushingColumns,
  shouldShowReceivingColumns,
} from '../utils/statsUtils';

/**
 * YearlyStatsTable component - displays season-aggregated stats
 */
export default function YearlyStatsTable({ playerStats, position, loading }) {

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
  const pct = (value) => (value === '-' ? '-' : `${value}%`);
  const completionPct = (comp, att) => (att ? pct(((comp / att) * 100).toFixed(1)) : '-');
  const yardsPerAttempt = (yards, att) => att ? (yards / att).toFixed(2) : '-';
  const roundEPA = val => (val !== null && val !== undefined && !isNaN(val)) ? Number(val).toFixed(3) : '-';
  const roundCPOE = val => (val !== null && val !== undefined && !isNaN(val)) ? pct(Number(val).toFixed(3)) : '-';
  const epaPerPlay = (epa, att) => att ? (Number(epa) / Number(att)).toFixed(3) : '-';
  const catchPct = (rec, tgt) => (tgt ? pct(((rec / tgt) * 100).toFixed(1)) : '-');
  const receivingYdsPerAttempt = (yards, att) => att ? (yards / att).toFixed(2) : '-';
  // Table columns by position
  const columnsQB = [
    { label: 'Games', value: stat => Number(stat.game_count) },
    { label: 'Cmp', value: stat => displayStat(stat.completions) },
    { label: 'Att', value: stat => displayStat(stat.attempts) },
    { label: 'Cmp %', value: stat => completionPct(stat.completions, stat.attempts) },
    { label: 'Yds/Att', value: stat => yardsPerAttempt(stat.passing_yards, stat.attempts) },
    { label: 'Pass TD', value: stat => displayStat(stat.passing_tds) },
    { label: 'INT', value: stat => displayStat(stat.passing_interceptions) },
    { label: 'Sacks', value: stat => displayStat(stat.sacks_suffered) },
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
    { label: 'Receiving TD', value: stat => displayStat(stat.receiving_tds) },
    { label: 'Rec EPA', value: stat => roundEPA(stat.receiving_epa) },
    { label: 'Rec EPA/Rec', value: stat => epaPerPlay(stat.receiving_epa, stat.receptions) },
  ];
  const columnsRB = [
    { label: 'Games', value: stat => Number(stat.game_count) },
    { label: 'Rec', value: stat => displayStat(stat.receptions) },
    { label: 'Tgt', value: stat => displayStat(stat.targets) },
    { label: 'Catch %', value: stat => catchPct(stat.receptions, stat.targets) },
    { label: 'Yds/Catch', value: stat => receivingYdsPerAttempt(stat.receiving_yards, stat.receptions) },
    { label: 'Receiving Yds', value: stat => displayStat(stat.receiving_yards) },
    { label: 'Receiving TD', value: stat => displayStat(stat.receiving_tds) },
    { label: 'Rec EPA', value: stat => roundEPA(stat.receiving_epa) },
    { label: 'Rec EPA/Rec', value: stat => epaPerPlay(stat.receiving_epa, stat.receptions) },
    { label: 'Carries', value: stat => displayStat(stat.carries) },
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
      // Only include seasons with at least one pass attempt
      const epaVals = stats.filter(s => Number(s.attempts) > 0).map(s => Number(s.passing_epa)).filter(v => !isNaN(v));
      if (epaVals.length === 0) return '-';
      const avg = epaVals.reduce((a, b) => a + b, 0) / epaVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'Rush EPA') {
      // Only include seasons with at least one carry
      const epaVals = stats.filter(s => Number(s.carries) > 0).map(s => Number(s.rushing_epa)).filter(v => !isNaN(v));
      if (epaVals.length === 0) return '-';
      const avg = epaVals.reduce((a, b) => a + b, 0) / epaVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'EPA/Play') {
      // Only include seasons with at least one pass attempt
      const epaPlayVals = stats.filter(s => Number(s.attempts) > 0)
        .map(s => {
          const att = Number(s.attempts) || 0;
          const epa = Number(s.passing_epa) || 0;
          return att ? epa / att : null;
        })
        .filter(v => v !== null && !isNaN(v));
      if (epaPlayVals.length === 0) return '-';
      const avg = epaPlayVals.reduce((a, b) => a + b, 0) / epaPlayVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'Rush EPA/Play') {
      // Only include seasons with at least one carry
      const rushEpaPlayVals = stats.filter(s => Number(s.carries) > 0)
        .map(s => {
          const carries = Number(s.carries) || 0;
          const epa = Number(s.rushing_epa) || 0;
          return carries ? epa / carries : null;
        })
        .filter(v => v !== null && !isNaN(v));
      if (rushEpaPlayVals.length === 0) return '-';
      const avg = rushEpaPlayVals.reduce((a, b) => a + b, 0) / rushEpaPlayVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'Rec EPA/Rec') {
      // Only include seasons with at least one reception
      const recEpaRecVals = stats.filter(s => Number(s.receptions) > 0)
        .map(s => {
          const rec = Number(s.receptions) || 0;
          const epa = Number(s.receiving_epa) || 0;
          return rec ? epa / rec : null;
        })
        .filter(v => v !== null && !isNaN(v));
      if (recEpaRecVals.length === 0) return '-';
      const avg = recEpaRecVals.reduce((a, b) => a + b, 0) / recEpaRecVals.length;
      return avg.toFixed(3);
    }
    if (col.label === 'CPOE') {
      // Only include seasons with at least one pass attempt
      const cpoeVals = stats.filter(s => Number(s.attempts) > 0)
        .map(s => Number(s.passing_cpoe))
        .filter(v => !isNaN(v));
      if (cpoeVals.length === 0) return '-';
      const avg = cpoeVals.reduce((a, b) => a + b, 0) / cpoeVals.length;
      return pct(avg.toFixed(3));
    }
    if (col.label === 'Catch %') {
      // Only include seasons with at least one target
      const catchVals = stats.filter(s => Number(s.targets) > 0)
        .map(s => {
          const rec = Number(s.receptions) || 0;
          const tgt = Number(s.targets) || 0;
          return tgt ? (rec / tgt) * 100 : null;
        })
        .filter(v => v !== null && !isNaN(v));
      if (catchVals.length === 0) return '-';
      const avg = catchVals.reduce((a, b) => a + b, 0) / catchVals.length;
      return avg.toFixed(1);
    }
    if (col.label === 'Yds/Catch') {
      // Only include seasons with at least one reception
      const ypcVals = stats.filter(s => Number(s.receptions) > 0)
        .map(s => {
          const yds = Number(s.receiving_yards) || 0;
          const rec = Number(s.receptions) || 0;
          return rec ? yds / rec : null;
        })
        .filter(v => v !== null && !isNaN(v));
      if (ypcVals.length === 0) return '-';
      const avg = ypcVals.reduce((a, b) => a + b, 0) / ypcVals.length;
      return avg.toFixed(2);
    }
    if (col.label === 'Completion %') {
      const totalComp = stats.reduce((sum, s) => sum + (Number(s.completions) || 0), 0);
      const totalAtt = stats.reduce((sum, s) => sum + (Number(s.attempts) || 0), 0);
      return totalAtt ? ((totalComp / totalAtt) * 100).toFixed(1) : '-';
    }
    return col.value(totals);
  };

  const averageIndicatorByLabel = {
    // These are explicitly averaged across seasons in getCareerValue
    'Pass EPA': 'Average per season',
    'Rush EPA': 'Average per season',
    'EPA/Play': 'Average per season',
    'Rush EPA/Play': 'Average per season',
    'Rec EPA/Rec': 'Average per season',
    CPOE: 'Average per season',

    // These are rates/derived values in the summary row (not simple sums)
    'Cmp %': 'Rate/average (not a sum)',
    'Yds/Att': 'Rate/average (not a sum)',
    'Rush Yds/Att': 'Rate/average (not a sum)',
    'Catch %': 'Rate/average (not a sum)',
    'Yds/Catch': 'Rate/average (not a sum)',
    'Pass EPA/Play': 'Rate/average (not a sum)',
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
              <TableCell key={col.label} align="right">
                {averageIndicatorByLabel[col.label] ? (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                    <Tooltip title={averageIndicatorByLabel[col.label]} arrow>
                      <Chip
                        label="avg"
                        size="small"
                        variant="outlined"
                        sx={{
                          height: 18,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          borderColor: 'divider',
                          color: 'text.secondary',
                        }}
                      />
                    </Tooltip>
                    <span>{getCareerValue(col, playerStats, careerTotals)}</span>
                  </Box>
                ) : (
                  getCareerValue(col, playerStats, careerTotals)
                )}
              </TableCell>
            ))}
          </TableRow>
        )}
      </TableBody>
    </StatsTableWrapper>
  );
}
