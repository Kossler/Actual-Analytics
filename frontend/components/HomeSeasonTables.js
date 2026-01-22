import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TableHead, TableBody, TableRow, TableCell, TableSortLabel, Box, Skeleton } from '@mui/material';
import StatsTableWrapper from './StatsTableWrapper';
import { displayStat } from '../utils/statsUtils';

const pct = (value) => (value === '-' ? '-' : `${value}%`);
const completionPct = (comp, att) => (att ? pct(((comp / att) * 100).toFixed(1)) : '-');
const catchPct = (rec, tgt) => (tgt ? pct(((rec / tgt) * 100).toFixed(1)) : '-');
const yardsPerAttempt = (yards, att) => (att ? (yards / att).toFixed(2) : '-');
const roundEPA = (val) => (val !== null && val !== undefined && !Number.isNaN(Number(val)) ? Number(val).toFixed(3) : '-');
const roundCPOE = (val) => (val !== null && val !== undefined && !Number.isNaN(Number(val)) ? pct(Number(val).toFixed(3)) : '-');
const epaPerPlay = (epa, att) => (att ? (Number(epa) / Number(att)).toFixed(3) : '-');

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sortRows = (rows, sortKey, direction, columns) => {
  const col = columns.find((c) => c.key === sortKey);
  if (!col) return rows;

  const dir = direction === 'asc' ? 1 : -1;
  const get = col.sortValue;

  return [...rows].sort((a, b) => {
    const av = get(a);
    const bv = get(b);

    const aNum = typeof av === 'number' && Number.isFinite(av);
    const bNum = typeof bv === 'number' && Number.isFinite(bv);
    if (aNum && bNum) return (av - bv) * dir;

    return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' }) * dir;
  });
};

function PositionSeasonTable({ title, subtitle, season, rows, defaultSortKey, columns, loading }) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [direction, setDirection] = useState('desc');

  const sortedRows = useMemo(() => {
    return sortRows(rows, sortKey, direction, columns);
  }, [rows, sortKey, direction, columns]);

  const handleSort = (key) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDirection('desc');
  };

  const displayedRows = useMemo(() => {
    return sortedRows.slice(0, 12);
  }, [sortedRows]);

  const activeCellSx = {
    bgcolor: 'action.hover',
  };

  return (
    <StatsTableWrapper
      title={title}
      subtitle={`${subtitle} (${season})`}
      loading={loading}
      dataLength={displayedRows.length}
    >
      <TableHead>
        <TableRow>
          {columns.map((col, idx) => (
            <TableCell
              key={col.key}
              align={idx === 0 ? 'left' : 'right'}
              sx={sortKey === col.key ? activeCellSx : undefined}
            >
              <TableSortLabel
                active={sortKey === col.key}
                direction={sortKey === col.key ? direction : 'asc'}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
              </TableSortLabel>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {displayedRows.map((row) => (
          <TableRow key={row.player_id} hover>
            {columns.map((col, idx) => (
              <TableCell
                key={col.key}
                align={idx === 0 ? 'left' : 'right'}
                sx={sortKey === col.key ? activeCellSx : undefined}
              >
                {col.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </StatsTableWrapper>
  );
}

function playerLinkCell(row) {
  const name = row.player_display_name || 'Unknown';
  return (
    <Link
      href={{ pathname: '/players/[id]', query: { id: row.player_id } }}
      as={`/players/${row.player_id}`}
      style={{ color: 'inherit', textDecoration: 'underline' }}
    >
      {name}
    </Link>
  );
}

export default function HomeSeasonTables({ season, qbs = [], rbs = [], wrs = [], tes = [], loading }) {
  // Normalize rows for display
  const normalizeRows = (rows) =>
    Array.isArray(rows)
      ? rows.map((s) => ({
          ...s,
          game_count: toNum(s.game_count),
          completions: toNum(s.completions),
          attempts: toNum(s.attempts),
          passing_yards: toNum(s.passing_yards),
          passing_tds: toNum(s.passing_tds),
          passing_interceptions: toNum(s.passing_interceptions),
          sacks_suffered: toNum(s.sacks_suffered),
          passing_epa: toNum(s.passing_epa),
          passing_cpoe: s.passing_cpoe,
          carries: toNum(s.carries),
          rushing_yards: toNum(s.rushing_yards),
          rushing_tds: toNum(s.rushing_tds),
          rushing_epa: toNum(s.rushing_epa),
          receptions: toNum(s.receptions),
          targets: toNum(s.targets),
          receiving_yards: toNum(s.receiving_yards),
          receiving_tds: toNum(s.receiving_tds),
          receiving_epa: toNum(s.receiving_epa),
          // For display
          completionPct: s.attempts ? (toNum(s.completions) / toNum(s.attempts)) * 100 : 0,
          catchPct: s.targets ? (toNum(s.receptions) / toNum(s.targets)) * 100 : 0,
          passing_epa_per_play: s.attempts ? toNum(s.passing_epa) / toNum(s.attempts) : 0,
          rushing_epa_per_play: s.carries ? toNum(s.rushing_epa) / toNum(s.carries) : 0,
          receiving_epa_per_play: s.receptions ? toNum(s.receiving_epa) / toNum(s.receptions) : 0,
        }))
      : [];

  const qbRows = useMemo(() => normalizeRows(qbs), [qbs]);
  const rbRows = useMemo(() => normalizeRows(rbs), [rbs]);
  const wrRows = useMemo(() => normalizeRows(wrs), [wrs]);
  const teRows = useMemo(() => normalizeRows(tes), [tes]);

  const commonColumns = [
    {
      key: 'player',
      label: 'Player',
      sortValue: (r) => r.player_display_name || '',
      render: (r) => playerLinkCell(r),
    },
    {
      key: 'team',
      label: 'Team',
      sortValue: (r) => r.team || '',
      render: (r) => r.team || '-',
    },
    {
      key: 'games',
      label: 'Games',
      sortValue: (r) => toNum(r.game_count),
      render: (r) => displayStat(r.game_count),
    },
  ];

  const qbColumns = [
    ...commonColumns,
    { key: 'cmp', label: 'Cmp', sortValue: (r) => toNum(r.completions), render: (r) => displayStat(r.completions) },
    { key: 'att', label: 'Att', sortValue: (r) => toNum(r.attempts), render: (r) => displayStat(r.attempts) },
    {
      key: 'cmpPct',
      label: 'Cmp %',
      sortValue: (r) => (toNum(r.attempts) ? (toNum(r.completions) / toNum(r.attempts)) * 100 : 0),
      render: (r) => completionPct(r.completions, r.attempts),
    },
    { key: 'passYds', label: 'Pass Yds', sortValue: (r) => toNum(r.passing_yards), render: (r) => displayStat(r.passing_yards) },
    { key: 'passTd', label: 'Pass TD', sortValue: (r) => toNum(r.passing_tds), render: (r) => displayStat(r.passing_tds) },
    { key: 'int', label: 'INT', sortValue: (r) => toNum(r.passing_interceptions), render: (r) => displayStat(r.passing_interceptions) },
    { key: 'passEpa', label: 'Pass EPA', sortValue: (r) => toNum(r.passing_epa), render: (r) => roundEPA(r.passing_epa) },
    {
      key: 'passEpaPlay',
      label: 'Pass EPA/Play',
      sortValue: (r) => (toNum(r.attempts) ? toNum(r.passing_epa) / toNum(r.attempts) : 0),
      render: (r) => epaPerPlay(r.passing_epa, r.attempts),
    },
    {
      key: 'cpoe',
      label: 'CPOE',
      // Use the season average if available, else fallback to single value
      sortValue: (r) => toNum(r.passing_cpoe_avg ?? r.passing_cpoe),
      render: (r) => roundCPOE(r.passing_cpoe_avg ?? r.passing_cpoe),
    },
  ];

  const wrteColumns = [
    ...commonColumns,
    { key: 'rec', label: 'Rec', sortValue: (r) => toNum(r.receptions), render: (r) => displayStat(r.receptions) },
    { key: 'tgt', label: 'Tgt', sortValue: (r) => toNum(r.targets), render: (r) => displayStat(r.targets) },
    {
      key: 'catchPct',
      label: 'Catch %',
      sortValue: (r) => (toNum(r.targets) ? (toNum(r.receptions) / toNum(r.targets)) * 100 : 0),
      render: (r) => catchPct(r.receptions, r.targets),
    },
    {
      key: 'ydsCatch',
      label: 'Yds/Catch',
      sortValue: (r) => (toNum(r.receptions) ? toNum(r.receiving_yards) / toNum(r.receptions) : 0),
      render: (r) => yardsPerAttempt(r.receiving_yards, r.receptions),
    },
    { key: 'recYds', label: 'Receiving Yds', sortValue: (r) => toNum(r.receiving_yards), render: (r) => displayStat(r.receiving_yards) },
    { key: 'recTd', label: 'Rec TD', sortValue: (r) => toNum(r.receiving_tds), render: (r) => displayStat(r.receiving_tds) },
    { key: 'recEpa', label: 'Rec EPA', sortValue: (r) => toNum(r.receiving_epa), render: (r) => roundEPA(r.receiving_epa) },
    {
      key: 'recEpaPlay',
      label: 'Rec EPA/Play',
      sortValue: (r) => (toNum(r.receptions) ? toNum(r.receiving_epa) / toNum(r.receptions) : 0),
      render: (r) => epaPerPlay(r.receiving_epa, r.receptions),
    },
  ];

  const rbColumns = [
    ...commonColumns,
    { key: 'carries', label: 'Carries', sortValue: (r) => toNum(r.carries), render: (r) => displayStat(r.carries) },
    { key: 'rushYds', label: 'Rush Yds', sortValue: (r) => toNum(r.rushing_yards), render: (r) => displayStat(r.rushing_yards) },
    { key: 'rushTd', label: 'Rush TD', sortValue: (r) => toNum(r.rushing_tds), render: (r) => displayStat(r.rushing_tds) },
    { key: 'rushEpa', label: 'Rush EPA', sortValue: (r) => toNum(r.rushing_epa), render: (r) => roundEPA(r.rushing_epa) },
    {
      key: 'rushEpaPlay',
      label: 'Rush EPA/Play',
      sortValue: (r) => (toNum(r.carries) ? toNum(r.rushing_epa) / toNum(r.carries) : 0),
      render: (r) => epaPerPlay(r.rushing_epa, r.carries),
    },
    { key: 'rec', label: 'Rec', sortValue: (r) => toNum(r.receptions), render: (r) => displayStat(r.receptions) },
    { key: 'tgt', label: 'Tgt', sortValue: (r) => toNum(r.targets), render: (r) => displayStat(r.targets) },
    {
      key: 'catchPct',
      label: 'Catch %',
      sortValue: (r) => (toNum(r.targets) ? (toNum(r.receptions) / toNum(r.targets)) * 100 : 0),
      render: (r) => catchPct(r.receptions, r.targets),
    },
    { key: 'recYds', label: 'Receiving Yds', sortValue: (r) => toNum(r.receiving_yards), render: (r) => displayStat(r.receiving_yards) },
    { key: 'recTd', label: 'Rec TD', sortValue: (r) => toNum(r.receiving_tds), render: (r) => displayStat(r.receiving_tds) },
    { key: 'recEpa', label: 'Rec EPA', sortValue: (r) => toNum(r.receiving_epa), render: (r) => roundEPA(r.receiving_epa) },
    {
      key: 'recEpaPlay',
      label: 'Rec EPA/Play',
      sortValue: (r) => (toNum(r.receptions) ? toNum(r.receiving_epa) / toNum(r.receptions) : 0),
      render: (r) => epaPerPlay(r.receiving_epa, r.receptions),
    },
  ];

  if (!season) return null;
  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 2 }} />
      </Box>
    );
  }

  return (
    <Box>
      <PositionSeasonTable
        title="Quarterbacks"
        subtitle="Latest season yearly stats"
        season={season}
        rows={qbRows}
        defaultSortKey="passYds"
        columns={qbColumns}
        loading={loading}
      />
      <PositionSeasonTable
        title="Running Backs"
        subtitle="Latest season yearly stats"
        season={season}
        rows={rbRows}
        defaultSortKey="rushYds"
        columns={rbColumns}
        loading={loading}
      />
      <PositionSeasonTable
        title="Wide Receivers"
        subtitle="Latest season yearly stats"
        season={season}
        rows={wrRows}
        defaultSortKey="recYds"
        columns={wrteColumns}
        loading={loading}
      />
      <PositionSeasonTable
        title="Tight Ends"
        subtitle="Latest season yearly stats"
        season={season}
        rows={teRows}
        defaultSortKey="recYds"
        columns={wrteColumns}
        loading={loading}
      />
    </Box>
  );
}
