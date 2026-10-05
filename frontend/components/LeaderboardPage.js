import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import DataTable, { sortRows } from './DataTable';
import { ButtonGroup, EmptyState, Field, LeaderCard, PageHeader, Segmented, Select, Stepper, TeamTag, toneOf } from './ui';
import { loadProps, queryString } from '../lib/api';
import { formatValue, shortName } from '../lib/format';
import { METRICS, groupStats, metricValue, sortValue } from '../lib/metrics';
import { LEADERBOARD_POSITIONS, POSITIONS, flattenColumns, qualifierMinimum } from '../lib/positions';
import { downloadCsv, readStorage, recentPlayers, writeStorage } from '../lib/storage';

export async function getLeaderboardProps({ query }) {
  const pos = LEADERBOARD_POSITIONS.includes(String(query.pos).toUpperCase()) ? String(query.pos).toUpperCase() : 'QB';
  const meta = await loadProps({ meta: '/api/meta' });
  if (meta.notFound) return meta;
  const { season: currentSeason, week, seasons } = meta.props.meta;
  // Before week 1 the current season has no stats yet; default to the previous one.
  const defaultSeason = week === 0 && seasons.length > 1 ? seasons[1] : currentSeason;
  const season = query.season || defaultSeason;
  const result = await loadProps({
    board: `/api/leaderboard/${pos}${queryString({ season, from: query.from, to: query.to })}`,
  });
  if (result.notFound) return result;
  return { props: { meta: meta.props.meta, board: result.props.board } };
}

function weekOptions(maxWeek) {
  if (!maxWeek) return [{ value: '1-18', label: 'All weeks' }];
  const opts = [{ value: `1-${maxWeek}`, label: `1 – ${maxWeek} (all)` }];
  if (maxWeek > 4) opts.push({ value: `${maxWeek - 3}-${maxWeek}`, label: `Last 4 (${maxWeek - 3} – ${maxWeek})` });
  if (maxWeek > 8) opts.push({ value: `${maxWeek - 7}-${maxWeek}`, label: `Last 8 (${maxWeek - 7} – ${maxWeek})` });
  if (maxWeek >= 10) {
    opts.push({ value: '1-9', label: 'First half (1 – 9)' });
    opts.push({ value: `10-${maxWeek}`, label: `Second half (10 – ${maxWeek})` });
  }
  for (let w = maxWeek; w >= 1; w -= 1) opts.push({ value: `${w}-${w}`, label: `Week ${w} only` });
  return opts;
}

export default function LeaderboardPage({ meta, board }) {
  const router = useRouter();
  const pos = board.position;
  const config = POSITIONS[pos];
  const weeks = board.to - board.from + 1;

  const [minVolume, setMinVolume] = useState(qualifierMinimum(pos, weeks));
  const [team, setTeam] = useState('');
  const [columnSet, setColumnSet] = useState('Standard');
  const [customColumns, setCustomColumns] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [sort, setSort] = useState({ key: config.defaultSort, dir: 'desc' });
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [recent, setRecent] = useState(null);

  // Position or week range changed: reset the qualifier and sort to that view's defaults.
  useEffect(() => {
    setMinVolume(qualifierMinimum(pos, weeks));
    setSort({ key: POSITIONS[pos].defaultSort, dir: 'desc' });
    setSelected([]);
    setCustomColumns(readStorage(`sla:columns:${pos}`, null));
    if (columnSet === 'Custom' && !readStorage(`sla:columns:${pos}`, null)) setColumnSet('Standard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos, weeks]);

  useEffect(() => {
    setRecent(recentPlayers()[0] || null);
  }, []);

  const navigate = (changes) => {
    const next = { ...router.query, ...changes };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
    router.push({ pathname: router.pathname, query: next }, undefined, { scroll: false });
  };

  const qualifierKey = config.qualifier.metric;
  const qualifying = useMemo(
    () => board.players.filter((p) => (metricValue(qualifierKey, p) || 0) >= minVolume),
    [board.players, qualifierKey, minVolume]
  );
  const visible = useMemo(() => (team ? qualifying.filter((p) => p.team === team) : qualifying), [qualifying, team]);

  const groups =
    columnSet === 'Custom' && customColumns?.length
      ? [{ group: 'Custom', columns: customColumns }]
      : config.columnSets[columnSet] || config.columnSets.Standard;
  const columns = flattenColumns(groups);
  const shading = useMemo(() => {
    const out = {};
    for (const col of columns) if (col.shade) out[col.key] = groupStats(qualifying, col.key);
    return out;
  }, [columns, qualifying]);

  const sorted = useMemo(() => sortRows(visible, (r) => sortValue(sort.key, r), sort.dir), [visible, sort]);

  const onSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: METRICS[key]?.better === 'low' ? 'asc' : 'desc' }));
  };

  const leaders = config.leaderCards.map((card) => leaderFor(card, qualifying));

  const exportCsv = () => {
    downloadCsv(
      `${pos.toLowerCase()}-leaderboard-${board.season}-wk${board.from}-${board.to}.csv`,
      ['Rank', 'Player', 'Team', ...columns.map((c) => c.label)],
      sorted.map((r, i) => [i + 1, r.name, r.team, ...columns.map((c) => {
        const v = metricValue(c.key, r);
        return typeof v === 'number' ? Number(v.toFixed(4)) : v;
      })])
    );
  };

  const toggleSelected = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  const fullRange = board.from === 1 && board.to === board.maxWeek;
  const eyebrow = `${board.season} Regular season · ${
    fullRange ? `Through week ${board.maxWeek}` : board.from === board.to ? `Week ${board.from}` : `Weeks ${board.from}–${board.to}`
  }`;
  const shadedLabels = columns.filter((c) => c.shade).map((c) => c.short);

  return (
    <>
      <Head>
        <title>{`${config.title} Leaderboard · Second Level Analytics`}</title>
      </Head>
      <PageHeader
        eyebrow={eyebrow}
        title={`${config.title} Leaderboard`}
        right={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {recent && (
              <p className="text-xs text-muted">
                Recently viewed:{' '}
                <Link href={`/players/${recent.id}`} className="link">
                  {recent.name}
                </Link>
              </p>
            )}
            <Segmented options={LEADERBOARD_POSITIONS} value={pos} onChange={(p) => navigate({ pos: p === 'QB' ? undefined : p, from: undefined, to: undefined })} />
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {leaders.map((l) => (
          <LeaderCard key={l.label} {...l} />
        ))}
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-x-2.5 gap-y-3 px-4 py-3.5">
        <Field label="Season">
          <Select value={board.season} onChange={(s) => navigate({ season: s, from: undefined, to: undefined })} options={meta.seasons} className="w-[88px]" />
        </Field>
        <Field label="Weeks">
          <Select
            value={`${board.from}-${board.to}`}
            onChange={(v) => {
              const [from, to] = v.split('-');
              const all = from === '1' && Number(to) === board.maxWeek;
              navigate({ from: all ? undefined : from, to: all ? undefined : to });
            }}
            options={weekOptions(board.maxWeek)}
            className="w-[124px]"
          />
        </Field>
        <Field label={config.qualifier.label}>
          <Stepper value={minVolume} onChange={setMinVolume} step={5} className="w-[88px]" />
        </Field>
        <Field label="Team">
          <Select
            value={team}
            onChange={setTeam}
            options={[{ value: '', label: 'All teams' }, ...meta.teams.map((t) => ({ value: t.abbr, label: t.name }))]}
            className="w-[124px]"
          />
        </Field>
        <div className="relative flex flex-col gap-1.5">
          <span className="text-xs text-muted">Column set</span>
          <ButtonGroup
            options={['Standard', 'Efficiency', 'Advanced', { value: 'Custom', label: 'Custom…' }]}
            value={columnSet}
            onChange={(v) => {
              if (v === 'Custom') setShowCustom((s) => !s);
              setColumnSet(v);
            }}
          />
          {showCustom && (
            <CustomColumns
              options={config.customOptions}
              value={customColumns || flattenColumns(config.columnSets.Standard).map((c) => c.key)}
              onChange={(cols) => {
                setCustomColumns(cols);
                writeStorage(`sla:columns:${pos}`, cols);
              }}
              onClose={() => setShowCustom(false)}
            />
          )}
        </div>
        <div className="ml-auto flex items-end gap-2">
          <span className="pb-2 text-xs leading-tight text-faint">
            {visible.length}
            <br />
            players
          </span>
          {selecting ? (
            <>
              <button type="button" className="btn" onClick={() => { setSelecting(false); setSelected([]); }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={selected.length < 2}
                onClick={() => router.push(`/compare?ids=${selected.join(',')}&season=${board.season}`)}
              >
                Compare {selected.length ? `(${selected.length})` : ''}
              </button>
            </>
          ) : (
            <button type="button" className="btn px-3" onClick={() => setSelecting(true)} title="Pick 2–4 players to compare">
              Compare
            </button>
          )}
          <button type="button" className="btn px-3" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="No players match these filters">Lower the minimum or choose a different team or week range.</EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(r) => r.player_id}
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={onSort}
          shading={shading}
          lead={{
            header: 'Player',
            className: 'min-w-[200px]',
            render: (r, i) => (
              <div className="flex items-center gap-3">
                {selecting ? (
                  <input
                    type="checkbox"
                    checked={selected.includes(r.player_id)}
                    onChange={() => toggleSelected(r.player_id)}
                    className="h-4 w-4 accent-[#ed1c33]"
                    aria-label={`Select ${r.name}`}
                  />
                ) : (
                  <span className="num w-5 text-right text-xs text-faint">{i + 1}</span>
                )}
                <Link href={`/players/${r.player_id}`} className="font-semibold hover:underline">
                  {r.name}
                </Link>
                <TeamTag abbr={r.team} />
              </div>
            ),
          }}
        />
      )}

      <div className="mt-3 flex flex-col gap-2 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          {shadedLabels.length > 0 && (
            <>
              Shading ({shadedLabels.join(', ')}): below avg
              <span className="inline-flex h-2 overflow-hidden rounded-sm">
                {['#9a5a26', '#5c3c22', '#2a2f37', '#263f63', '#3d7ad6'].map((c) => (
                  <span key={c} className="w-4" style={{ backgroundColor: c }} />
                ))}
              </span>
              above avg
            </>
          )}
        </span>
        <span>
          Click a column to sort · hover a header for its definition ·{' '}
          <Link href="/glossary" className="link">
            Glossary
          </Link>
        </span>
      </div>
    </>
  );
}

function leaderFor(card, rows) {
  const metric = METRICS[card.metric];
  const ranked = sortRows(rows, (r) => metricValue(card.metric, r), metric.better === 'low' ? 'asc' : 'desc').filter(
    (r) => Number.isFinite(metricValue(card.metric, r))
  );
  const label = card.label;
  if (!ranked.length) return { label, value: '–', title: 'No qualifiers' };
  const top = metricValue(card.metric, ranked[0]);
  const display = (v) => formatValue(v, metric.format);
  const tone = metric.format.startsWith('signed') ? toneOf(top, metric.better) : undefined;
  const tied = ranked.filter((r) => display(metricValue(card.metric, r)) === display(top));
  if (tied.length > 1) {
    return {
      label,
      value: display(top),
      tone,
      title: `${tied.length}-way tie`,
      sub: tied.slice(0, 4).map((r) => shortName(r.name)).join(' · '),
    };
  }
  const second = ranked[1];
  return {
    label,
    value: display(top),
    tone,
    title: ranked[0].name,
    tag: ranked[0].team,
    href: `/players/${ranked[0].player_id}`,
    sub: second ? `2nd · ${second.name} ${display(metricValue(card.metric, second))}` : undefined,
  };
}

function CustomColumns({ options, value, onChange, onClose }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="absolute left-0 top-full z-30 mt-2 w-[340px] rounded-xl border border-line-strong bg-raised p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Choose columns</span>
        <button type="button" onClick={onClose} className="text-xs text-muted hover:text-ink">
          Done
        </button>
      </div>
      <div className="grid max-h-72 grid-cols-2 gap-x-3 gap-y-1.5 overflow-y-auto">
        {options.map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-muted hover:text-ink">
            <input type="checkbox" checked={value.includes(key)} onChange={() => toggle(key)} className="accent-[#ed1c33]" />
            {METRICS[key].label}
          </label>
        ))}
      </div>
    </div>
  );
}
