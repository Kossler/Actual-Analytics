import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import BarChart from './charts/BarChart';
import ScatterPlot from './charts/ScatterPlot';
import DataTable from './DataTable';
import { Breadcrumbs, Card, EmptyState, Segmented, Select, Tabs, RankTrack, toneOf } from './ui';
import { useApi } from '../lib/api';
import { formatValue, height as formatHeight, initials, money, ordinal, pctLabel, shortName } from '../lib/format';
import { METRICS, aggregate, groupStats, metricValue, playerGroup } from '../lib/metrics';
import { LEADERBOARD_POSITIONS, POSITIONS, flattenColumns, qualifierMinimum } from '../lib/positions';
import { gameLabel, gameResult, ngsBySeason, opponentLabel, seasonGames, seasonsOf, splitRows } from '../lib/player';
import { rememberPlayer } from '../lib/storage';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'gamelog', label: 'Game log' },
  { value: 'splits', label: 'Splits' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'career', label: 'Career' },
];

const BEST_GAME = {
  QB: [
    { label: 'Cmp/Att', value: (g) => `${Math.round(g.completions || 0)}/${Math.round(g.attempts || 0)}` },
    { label: 'Pass yds', metric: 'passing_yards' },
    { label: 'TD / INT', value: (g) => `${Math.round(g.passing_tds || 0)} / ${Math.round(g.interceptions || 0)}` },
    { label: 'Pass EPA', metric: 'pass_epa', tone: true },
    { label: 'EPA/play', metric: 'epa_per_play', tone: true },
    { label: 'Rush yds', metric: 'rushing_yards' },
  ],
  RB: [
    { label: 'Carries', metric: 'carries' },
    { label: 'Rush yds', metric: 'rushing_yards' },
    { label: 'Total TD', value: (g) => String(Math.round((g.rushing_tds || 0) + (g.receiving_tds || 0))) },
    { label: 'Rush EPA', metric: 'rushing_epa', tone: true },
    { label: 'EPA/carry', metric: 'rush_epa_per', tone: true },
    { label: 'Rec yds', metric: 'receiving_yards' },
  ],
  REC: [
    { label: 'Rec/Tgt', value: (g) => `${Math.round(g.receptions || 0)}/${Math.round(g.targets || 0)}` },
    { label: 'Rec yds', metric: 'receiving_yards' },
    { label: 'TD', metric: 'receiving_tds' },
    { label: 'Rec EPA', metric: 'receiving_epa', tone: true },
    { label: 'EPA/target', metric: 'epa_per_target', tone: true },
    { label: 'Yds/rec', metric: 'ypr' },
  ],
};

export default function PlayerPage({ data, board }) {
  const router = useRouter();
  const { player, games, ngs, contracts } = data;
  const group = playerGroup(player, games);
  const config = POSITIONS[group] || POSITIONS.OTHER;
  const pc = config.player;

  const seasons = useMemo(() => seasonsOf(games), [games]);
  const season = Number(router.query.season) || seasons[0];
  const tab = TABS.some((t) => t.value === router.query.tab) ? router.query.tab : 'overview';

  useEffect(() => {
    rememberPlayer(player);
  }, [player]);

  const setQuery = (changes) => {
    const next = { ...router.query, ...changes };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const needsData = 'season' in changes && changes.season !== router.query.season;
    router.push({ pathname: router.pathname, query: next }, undefined, { scroll: false, shallow: !needsData });
  };

  const regular = useMemo(() => seasonGames(games, season), [games, season]);
  const totals = useMemo(() => aggregate(regular), [regular]);
  const previous = useMemo(() => {
    const prev = seasonGames(games, season - 1);
    return prev.length ? aggregate(prev) : null;
  }, [games, season]);

  // Peers: the season's qualifying leaderboard players, plus this player if they fell short.
  const { peers, self, qualifiedCount } = useMemo(() => {
    if (!board?.players?.length || !config.qualifier) return { peers: [], self: null, qualifiedCount: 0 };
    const min = qualifierMinimum(group, board.maxWeek);
    const qualified = board.players.filter((p) => (metricValue(config.qualifier.metric, p) || 0) >= min);
    const me = board.players.find((p) => p.player_id === player.gsis_id) || null;
    return {
      peers: me && !qualified.includes(me) ? [...qualified, me] : qualified,
      self: me,
      qualifiedCount: qualified.length,
    };
  }, [board, config, group, player.gsis_id]);

  const shading = useMemo(() => {
    const out = {};
    for (const key of Object.keys(METRICS)) if (METRICS[key].shade && peers.length >= 3) out[key] = groupStats(peers, key);
    return out;
  }, [peers]);

  const team = data.team;
  const teamName = team?.name || player.latest_team;
  const latestContract = contracts[0];

  return (
    <>
      <Head>
        <title>{`${player.display_name} · Second Level Analytics`}</title>
      </Head>
      <Breadcrumbs
        items={[
          { label: 'Players', href: '/' },
          ...(LEADERBOARD_POSITIONS.includes(group) ? [{ label: config.plural, href: group === 'QB' ? '/' : `/?pos=${group}` }] : []),
          { label: player.display_name },
        ]}
      />

      <section className="card mb-4 overflow-hidden" style={{ borderTop: `3px solid ${team?.color || '#2f3743'}` }}>
        <div className="flex flex-col gap-5 px-5 pb-4 pt-5 md:flex-row md:items-center">
          <Avatar player={player} />
          <div className="min-w-0 flex-1">
            <div className="label mb-1 text-muted">
              {player.position}
              {teamName && (
                <>
                  {' · '}
                  <Link href={`/teams/${player.latest_team}`} className="underline decoration-faint underline-offset-2 hover:text-ink">
                    {teamName}
                  </Link>
                </>
              )}
              {player.jersey_number ? ` · #${player.jersey_number}` : ''}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-extrabold leading-tight sm:text-[2.4rem]">{player.display_name}</h1>
              <StatusTags depth={data.depth} injury={data.injury} latestSeason={seasons[0]} />
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-7 gap-y-2 text-sm">
            <Fact label="College" value={player.college_name?.split(';').pop().trim()} />
            <Fact label="Height" value={formatHeight(player.height)} />
            <Fact label="Weight" value={player.weight ? `${Math.round(player.weight)} lb` : null} />
            <Fact label="Experience" value={experience(player, season)} />
          </dl>
          <div className="flex gap-2">
            <Link href={`/compare?ids=${player.gsis_id}&season=${season}`} className="btn">
              + Compare
            </Link>
            {latestContract && (
              <a href="#contract" className="btn btn-primary">
                Contract
              </a>
            )}
          </div>
        </div>
        <div className="px-5">
          <Tabs
            tabs={TABS}
            value={tab}
            onChange={(t) => setQuery({ tab: t === 'overview' ? undefined : t })}
            right={
              seasons.length > 0 && (
                <label className="flex items-center gap-2 py-2 text-xs text-muted">
                  Season
                  <Select value={season} onChange={(s) => setQuery({ season: s })} options={seasons} className="h-9 w-24" />
                </label>
              )
            }
          />
        </div>
      </section>

      {!regular.length ? (
        <EmptyState title={`No regular-season games for ${player.display_name}`}>
          {seasons.length ? 'Pick another season above.' : 'This player has no recorded NFL game stats yet.'}
        </EmptyState>
      ) : tab === 'overview' ? (
        <Overview
          {...{ player, games, regular, totals, previous, season, group, config, pc, peers, self, qualifiedCount, shading, contracts, setQuery, board }}
        />
      ) : tab === 'gamelog' ? (
        <GameLog games={seasonGames(games, season, { playoffs: true })} pc={pc} shading={shading} season={season} />
      ) : tab === 'splits' ? (
        <Splits games={games} season={season} pc={pc} shading={shading} playerId={player.gsis_id} group={group} />
      ) : tab === 'advanced' ? (
        <Advanced games={games} ngs={ngs} pc={pc} group={group} />
      ) : (
        <Career games={games} pc={pc} shading={shading} contracts={contracts} player={player} season={season} />
      )}
    </>
  );
}

// Depth-chart slot (e.g. "QB1") and the latest injury-report designation, when there is one.
function StatusTags({ depth, injury, latestSeason }) {
  const slot = depth?.[0];
  const injured = injury && injury.season === latestSeason && injury.report_status;
  const tone = injured === 'Out' ? 'border-bad/70 text-bad' : 'border-warn/60 text-warn';
  return (
    <>
      {slot && (
        <span className="rounded border border-line-strong px-1.5 py-0.5 text-xs font-bold text-muted" title={`${slot.pos_name}, current depth chart`}>
          {slot.pos_abb}
          {slot.pos_rank}
        </span>
      )}
      {injured && (
        <span className={`rounded border px-1.5 py-0.5 text-xs font-bold ${tone}`} title={injury.practice_status || undefined}>
          {injury.report_status}
          {injury.report_primary_injury ? ` · ${injury.report_primary_injury}` : ''}
          <span className="ml-1 font-normal opacity-80">wk {injury.week} report</span>
        </span>
      )}
    </>
  );
}

function Avatar({ player }) {
  const [failed, setFailed] = useState(false);
  if (player.headshot && !failed) {
    return (
      <img
        src={player.headshot}
        alt=""
        onError={() => setFailed(true)}
        className="h-20 w-20 shrink-0 rounded-full border border-line-strong bg-raised object-cover object-top"
      />
    );
  }
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised font-display text-2xl font-bold text-muted">
      {initials(player.display_name)}
    </div>
  );
}

function Fact({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function experience(player, season) {
  const rookie = player.rookie_season || player.draft_year;
  if (!rookie) return null;
  const n = season - rookie + 1;
  return n >= 1 ? `${ordinal(n)} season` : null;
}

// ------------------------------------------------------------------------------------------------
// Overview
// ------------------------------------------------------------------------------------------------

function Overview({ player, games, regular, totals, previous, season, group, config, pc, peers, self, qualifiedCount, shading, contracts, setQuery }) {
  const prevLabel = `'${String(season - 1).slice(2)}`;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {pc.cards.map((key) => (
          <MetricCard key={key} metricKey={key} totals={totals} previous={previous} prevLabel={prevLabel} peers={peers} self={self} pc={pc} group={group} config={config} />
        ))}
        {pc.summary && <SummaryCard summary={pc.summary} totals={totals} />}
      </div>
      {peers.length > 0 && self && (
        <p className="text-xs text-faint">
          Ranks compare against the {qualifiedCount} qualifying {config.plural.toLowerCase()} on the {season} leaderboard
          {peers.length > qualifiedCount ? ` plus ${shortName(player.display_name)}` : ''}
          {peers.length > qualifiedCount && shortName(player.display_name).endsWith('.') ? '' : '.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WeekByWeek games={regular} pc={pc} previous={previous} prevSeason={season - 1} className={pc.valueSplit ? 'lg:col-span-2' : 'lg:col-span-3'} />
        {pc.valueSplit && (
          <div className="space-y-4">
            <ValueSplit split={pc.valueSplit} totals={totals} season={season} />
            <BestGame games={regular} group={group} />
          </div>
        )}
      </div>

      <Card
        title={`${season} game log`}
        bodyClassName="p-0 pt-3"
        className="overflow-hidden"
        action={
          <button type="button" onClick={() => setQuery({ tab: 'gamelog' })} className="link text-sm">
            Full game log →
          </button>
        }
      >
        <GameLogTable games={regular} pc={pc} shading={shading} bare />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {pc.scatter && peers.length >= 3 ? (
          <Comparison peers={peers} self={self} pc={pc} config={config} season={season} className="lg:col-span-2" />
        ) : (
          <div className="lg:col-span-2" />
        )}
        <ContractCard contracts={contracts} player={player} season={season} />
      </div>

      <CareerTable games={games} pc={pc} shading={shading} />
    </div>
  );
}

function MetricCard({ metricKey, totals, previous, prevLabel, peers, self, pc, group, config }) {
  const posLabel = config.rankLabel || (LEADERBOARD_POSITIONS.includes(group) ? `${group}s` : '');
  const m = METRICS[metricKey];
  const value = metricValue(metricKey, totals);
  const prev = previous ? metricValue(metricKey, previous) : null;
  const delta = Number.isFinite(value) && Number.isFinite(prev) ? value - prev : null;
  const deltaGood = delta == null ? null : m.better === 'low' ? delta < 0 : delta > 0;

  let rank = null;
  let position = null;
  let tone;
  if (self && peers.length >= 3) {
    const values = peers.map((p) => metricValue(metricKey, p)).filter(Number.isFinite);
    const mine = metricValue(metricKey, self);
    if (Number.isFinite(mine) && values.length) {
      const better = values.filter((v) => (m.better === 'low' ? v < mine : v > mine)).length;
      rank = better + 1;
      position = values.length > 1 ? 1 - better / (values.length - 1) : 0.5;
      const stats = groupStats(peers, metricKey);
      if (stats) {
        const z = (mine - stats.mean) / stats.sd;
        const good = m.better === 'low' ? -z : z;
        tone = good > 0.5 ? 'good' : good < -0.5 ? 'bad' : undefined;
      }
      rank = { rank, of: values.length };
    }
  }
  const toneClass = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink';
  const display = m.format === 'pct' ? `${formatValue(value, 'pct')}%` : formatValue(value, m.format);
  const deltaDisplay = delta == null ? null : formatValue(Math.abs(delta), m.format === 'pct' ? 'pct' : m.format.replace('signed', 'dec'));

  return (
    <div className="card px-4 py-3.5">
      <div className="label mb-1.5">{m.card || (m.label.length > 22 ? m.short : m.label)}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-display text-[28px] font-bold leading-none ${toneClass}`}>{display}</span>
        {delta != null && Number(deltaDisplay) !== 0 && (
          <span className={`whitespace-nowrap text-xs ${deltaGood ? 'text-good' : 'text-bad'}`}>
            {delta > 0 ? '▲' : '▼'} {deltaDisplay} vs {prevLabel}
          </span>
        )}
      </div>
      {position != null && <RankTrack position={position} tone={tone} />}
      <div className="mt-1.5 text-xs text-muted">
        {rank ? `${ordinal(rank.rank)} of ${rank.of} ${posLabel}` : ''}
        {pc.cardDetail?.[metricKey] ? `${rank ? ' · ' : ''}${pc.cardDetail[metricKey](totals)}` : ''}
      </div>
    </div>
  );
}

function SummaryCard({ summary, totals }) {
  const main = metricValue(summary.main, totals);
  const rate = summary.rate ? metricValue(summary.rate, totals) : null;
  return (
    <div className="card px-4 py-3.5">
      <div className="label mb-1.5">{summary.title}</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap font-display text-[28px] font-bold leading-none">
          {formatValue(main, METRICS[summary.main].format)} <span className="font-sans text-sm font-normal text-muted">{summary.unit}</span>
        </span>
        {Number.isFinite(rate) && (
          <span className={`text-right text-xs ${toneOf(rate) === 'bad' ? 'text-bad' : 'text-good'}`}>
            {formatValue(rate, METRICS[summary.rate].format)} {METRICS[summary.rate].short}
          </span>
        )}
      </div>
      <div className="mt-3 text-xs text-muted">
        {summary.detail.map((k) => `${formatValue(metricValue(k, totals), METRICS[k].format)} ${METRICS[k].short.toLowerCase()}`).join(' · ')}
      </div>
    </div>
  );
}

function WeekByWeek({ games, pc, previous, prevSeason, className }) {
  const [metric, setMetric] = useState(pc.weekChart[0]);
  const m = METRICS[metric];
  // Rates compare with last season's rate; counting stats with last season's per-game average.
  const isVolume = m.format === 'int';
  const reference = previous ? metricValue(metric, previous) / (isVolume ? previous.games || 1 : 1) : null;
  return (
    <Card
      className={className}
      title="Week-by-week"
      subtitle={`${m.label} by game${Number.isFinite(reference) ? `, dashed line = ${prevSeason} ${isVolume ? 'per-game average' : 'season mark'}` : ''}`}
      action={pc.weekChart.length > 1 && <Segmented options={pc.weekChart.map((k) => ({ value: k, label: METRICS[k].short === 'EPA/PLAY' ? 'EPA/play' : METRICS[k].short }))} value={metric} onChange={setMetric} />}
    >
      <BarChart
        items={games.map((g) => ({
          key: `${g.season}-${g.week}`,
          label: games.length > 8 ? String(g.week) : g.game_type === 'REG' ? `Week ${g.week}` : gameLabel(g),
          value: metricValue(metric, { ...g, games: 1 }),
        }))}
        format={m.format === 'pct' ? 'pct' : m.format}
        better={m.better}
        reference={Number.isFinite(reference) ? reference : undefined}
        referenceLabel={Number.isFinite(reference) ? `${prevSeason}: ${formatValue(reference, m.format)}` : undefined}
        baseline={0}
      />
    </Card>
  );
}

function ValueSplit({ split, totals, season }) {
  const parts = split.map((s) => ({ ...s, value: metricValue(s.metric, totals) || 0 }));
  const max = Math.max(...parts.map((p) => Math.abs(p.value)), 1);
  const net = parts.reduce((s, p) => s + p.value, 0);
  return (
    <Card title="Where the value came from" subtitle={`Total EPA, ${season}`}>
      <div className="space-y-4">
        {parts.map((p) => (
          <div key={p.label}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-muted">{p.label}</span>
              <span className={`font-semibold ${p.value >= 0 ? 'text-good' : 'text-bad'}`}>{formatValue(p.value, 'signed1')}</span>
            </div>
            <div className="relative h-2.5 rounded-sm bg-line">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
              <div
                className={`absolute inset-y-0 rounded-sm ${p.value >= 0 ? 'bg-[#4a8ef0]' : 'bg-bad'}`}
                style={p.value >= 0 ? { left: '50%', width: `${(p.value / max) * 50}%` } : { right: '50%', width: `${(-p.value / max) * 50}%` }}
              />
            </div>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-3 text-sm">
          <span className="font-semibold">Net</span>
          <span className={`font-semibold ${net >= 0 ? 'text-good' : 'text-bad'}`}>{formatValue(net, 'signed1')}</span>
        </div>
      </div>
    </Card>
  );
}

function BestGame({ games, group }) {
  const spec = BEST_GAME[group] || (group === 'WR' || group === 'TE' ? BEST_GAME.REC : null);
  if (!spec) return null;
  const best = [...games].sort((a, b) => (metricValue('total_epa', { ...b, games: 1 }) || 0) - (metricValue('total_epa', { ...a, games: 1 }) || 0))[0];
  if (!best) return null;
  const row = { ...best, games: 1 };
  return (
    <Card title={null} bodyClassName="p-5">
      <div className="label mb-3">
        Best game · {gameLabel(best)} {opponentLabel(best)}
      </div>
      <div className="grid grid-cols-3 gap-x-4 gap-y-3">
        {spec.map((s) => {
          const v = s.metric ? metricValue(s.metric, row) : null;
          const text = s.value ? s.value(row) : formatValue(v, METRICS[s.metric].format);
          const tone = s.tone ? toneOf(v) : undefined;
          return (
            <div key={s.label}>
              <div className={`font-display text-xl font-bold ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : ''}`}>{text}</div>
              <div className="text-2xs text-faint">{s.label}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Comparison({ peers, self, pc, config, season, className }) {
  const [x, setX] = useState(pc.scatter.x);
  const [y, setY] = useState(pc.scatter.y);
  const points = peers.map((p) => ({
    id: p.player_id,
    x: metricValue(x, p),
    y: metricValue(y, p),
    label: p === self ? p.name : shortName(p.name),
    name: p.name,
    highlight: p === self,
  }));
  const axisName = (k) => METRICS[k].axis || (METRICS[k].label.length <= 18 ? METRICS[k].label : METRICS[k].short);
  const options = pc.scatterOptions.map((k) => ({ value: k, label: axisName(k) }));
  return (
    <Card
      className={className}
      title="How he compares"
      subtitle={`${season} ${config.plural.toLowerCase()} who qualify · dashed lines mark the group average`}
      action={
        <div className="flex gap-2">
          <label className="text-xs text-muted">
            X axis
            <Select value={x} onChange={setX} options={options} className="mt-1 h-9 w-36" />
          </label>
          <label className="text-xs text-muted">
            Y axis
            <Select value={y} onChange={setY} options={options} className="mt-1 h-9 w-36" />
          </label>
        </div>
      }
    >
      <ScatterPlot
        points={points}
        xLabel={axisName(x)}
        yLabel={axisName(y)}
        xFormat={METRICS[x].format}
        yFormat={METRICS[y].format}
        invertY={METRICS[y].better === 'low'}
        quadrants={
          METRICS[x].better && METRICS[y].better && METRICS[x].better !== 'low'
            ? { topRight: 'ABOVE AVG ON BOTH', bottomLeft: 'BELOW AVG ON BOTH' }
            : {}
        }
        height={400}
      />
    </Card>
  );
}

function ContractCard({ contracts, player, season }) {
  const [history, setHistory] = useState(false);
  const c = contracts[0];
  if (!c) {
    return (
      <Card title="Contract" className="h-fit">
        <p className="text-sm text-muted">No contract on file from Over The Cap.</p>
      </Card>
    );
  }
  const start = c.year_signed;
  const end = start + (c.years || 1) - 1;
  const rookie = player.draft_year && start === player.draft_year;
  const years = Array.from({ length: Math.max(c.years || 1, 1) }, (_, i) => start + i);
  const current = years.indexOf(season);
  const guaranteedPct = c.value ? c.guaranteed / c.value : null;
  const capYear = Array.isArray(c.season_history) ? c.season_history.find((h) => String(h.year) === String(season)) : null;
  return (
    <section id="contract" className="card h-fit scroll-mt-20 p-5">
      <h2 className="font-sans text-[17px] font-bold">Contract</h2>
      <p className="mt-0.5 text-xs text-muted">
        {rookie ? 'Rookie deal · ' : ''}signed {start}
        {c.team ? ` with ${c.team}` : ''}
      </p>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-4xl font-bold">{money(c.value)}</span>
        <span className="text-sm text-muted">over {c.years} {c.years === 1 ? 'year' : 'years'}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Avg. per year</dt>
          <dd className="font-display text-lg font-bold">{money(c.apy)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Guaranteed</dt>
          <dd className="font-display text-lg font-bold">
            {money(c.guaranteed)}{' '}
            {guaranteedPct != null && <span className="font-sans text-xs font-semibold text-good">{Math.round(guaranteedPct * 100)}%</span>}
          </dd>
        </div>
        {capYear?.cap_number != null && (
          <div className="col-span-2 rounded-lg border border-line bg-raised/40 px-3 py-2">
            <dt className="text-xs text-muted">{season} cap hit</dt>
            <dd className="font-display text-lg font-bold">
              {money(capYear.cap_number)}{' '}
              {capYear.cap_percent != null && <span className="font-sans text-xs font-normal text-muted">{pctLabel(capYear.cap_percent, 1)} of the cap</span>}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted">Signed</dt>
          <dd className="font-display text-lg font-bold">{start}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Runs through</dt>
          <dd className="font-display text-lg font-bold">{end}</dd>
        </div>
      </dl>
      <div className="mt-4 flex gap-1">
        {years.map((y, i) => (
          <div key={y} className="flex-1">
            <div className={`h-2 rounded-sm ${i === current ? 'bg-[#4a8ef0] ring-2 ring-white/80' : y < season ? 'bg-[#4a8ef0]' : 'bg-line'}`} />
            <div className={`mt-1 text-2xs ${i === current ? 'font-bold text-ink' : 'text-faint'}`}>{y}{i === current ? ' · now' : ''}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {current >= 0 && `Year ${current + 1} of ${years.length}`}
        {current >= 0 && contracts.length > 1 && ' · '}
        {contracts.length > 1 && (
          <button type="button" className="link" onClick={() => setHistory((h) => !h)}>
            {history ? 'Hide contract history' : 'Full contract history →'}
          </button>
        )}
      </div>
      {history && (
        <ul className="mt-3 space-y-2 text-sm">
          {contracts.map((k) => (
            <li key={`${k.year_signed}-${k.team}-${k.value}`} className="flex justify-between gap-2">
              <span className="text-muted">
                {k.year_signed} · {k.team}
              </span>
              <span className="font-semibold">
                {money(k.value)} / {k.years}y
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Tables
// ------------------------------------------------------------------------------------------------

function GameLogTable({ games, pc, shading, bare }) {
  const columns = flattenColumns(pc.gameLog);
  const rows = games.map((g) => ({ ...g, games: 1 }));
  const total = { ...aggregate(games), label: 'Season' };
  const table = (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => `${r.season}-${r.week}`}
      shading={shading}
      footerRows={games.length > 1 ? [total] : []}
      lead={{
        header: 'Game',
        className: 'min-w-[120px]',
        render: (r) =>
          r.label ? (
            <span>{r.label}</span>
          ) : (
            <span className="whitespace-nowrap">
              <span className="font-semibold">{gameLabel(r)}</span> <span className="text-xs text-faint">{opponentLabel(r)}</span>
              {gameResult(r) && (
                <span className={`ml-1.5 text-2xs font-bold ${gameResult(r).outcome === 'W' ? 'text-good' : gameResult(r).outcome === 'L' ? 'text-bad' : 'text-muted'}`}>
                  {gameResult(r).outcome}
                </span>
              )}
            </span>
          ),
      }}
    />
  );
  return bare ? <div className="-mx-px -mb-px [&>.card]:rounded-none [&>.card]:border-x-0 [&>.card]:border-b-0">{table}</div> : table;
}

function GameLog({ games, pc, shading, season }) {
  if (!games.length) return <EmptyState title={`No games in ${season}`} />;
  return (
    <div className="space-y-3">
      <h2 className="font-sans text-lg font-bold">{season} game log</h2>
      <GameLogTable games={games} pc={pc} shading={shading} />
      <p className="text-xs text-faint">Includes playoff games. Shading compares each game with the season rates of qualifying players at the position.</p>
    </div>
  );
}

function Splits({ games, season, pc, shading, playerId, group }) {
  const [scope, setScope] = useState('season');
  const pool = scope === 'season' ? seasonGames(games, season) : games.filter((g) => g.season_type === 'REG');
  const rows = splitRows(pool);
  const columns = flattenColumns([{ group: 'Splits', columns: pc.splits }]);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-lg font-bold">Splits</h2>
        <Segmented options={[{ value: 'season', label: String(season) }, { value: 'career', label: 'Career' }]} value={scope} onChange={setScope} />
      </div>
      <DataTable
        columns={columns.map((c) => ({ ...c, group: undefined }))}
        rows={rows}
        rowKey={(r) => r.key}
        shading={shading}
        lead={{ header: 'Split', className: 'min-w-[180px]', render: (r) => <span className="font-semibold">{r.label}</span> }}
      />
      <p className="text-xs text-faint">Regular season only. Dome and outdoor splits use the stadium roof recorded for each game.</p>
      {['QB', 'RB', 'WR', 'TE'].includes(group) && <ChartingSplits playerId={playerId} season={season} group={group} />}
    </div>
  );
}

const per = (a, b) => (b ? a / b : null);

function ChartingSplits({ playerId, season, group }) {
  const { data, loading } = useApi(`/api/players/${playerId}/charting?season=${season}`);
  if (loading) return <p className="text-sm text-muted">Loading charting splits…</p>;
  const charted = data && data.season === season;
  return (
    <section className="space-y-3 pt-4">
      <div>
        <h2 className="font-sans text-lg font-bold">Charting splits</h2>
        <p className="text-xs text-muted">Every play hand-charted by FTN: play-action, blitzes, pocket movement, box counts and ball quality (2022 onward).</p>
      </div>
      {!charted ? (
        <EmptyState title={`No FTN charting for ${season}`}>{data?.seasons?.length ? `Charted seasons: ${data.seasons.join(', ')}.` : 'FTN charting starts in 2022.'}</EmptyState>
      ) : (
        <>
          {group === 'QB' && data.passing.length > 0 && (
            <DataTable
              rows={data.passing}
              rowKey={(r) => r.split}
              lead={{ header: 'Dropbacks', className: 'min-w-[170px]', render: (r) => <span className={r.ord === 0 ? 'font-semibold' : ''}>{r.split}</span> }}
              columns={[
                { key: 'plays', short: 'DB', label: 'Dropbacks', format: 'int', value: (r) => r.plays },
                { key: 'share', short: 'SHARE', label: 'Share of dropbacks', format: 'pct', value: (r) => per(r.plays, data.passing[0].plays) },
                { key: 'epa', short: 'EPA/PLAY', label: 'EPA per dropback', format: 'signed2', better: 'high', value: (r) => per(r.epa, r.plays) },
                { key: 'success', short: 'SUCC%', label: 'Success rate', format: 'pct', value: (r) => per(r.success, r.plays) },
                { key: 'cmp', short: 'CMP%', label: 'Completion %', format: 'pct', value: (r) => per(r.completions, r.attempts) },
                { key: 'ypp', short: 'YDS/DB', label: 'Yards per dropback (incl. sacks and scrambles)', format: 'dec1', value: (r) => per(r.yards, r.plays) },
                { key: 'sacks', short: 'SK', label: 'Sacks', format: 'int', value: (r) => r.sacks },
                { key: 'int', short: 'INT', label: 'Interceptions', format: 'int', value: (r) => r.interceptions },
                { key: 'iw', short: 'INT-WORTHY', label: 'Interception-worthy throws', format: 'int', value: (r) => r.int_worthy },
              ]}
              shading={{ epa: { mean: 0, sd: 0.2 } }}
              dense
            />
          )}
          {group === 'RB' && data.rushing.length > 0 && (
            <DataTable
              rows={data.rushing}
              rowKey={(r) => r.split}
              lead={{ header: 'Carries', className: 'min-w-[200px]', render: (r) => <span className={r.ord === 0 ? 'font-semibold' : ''}>{r.split}</span> }}
              columns={[
                { key: 'plays', short: 'CAR', label: 'Carries', format: 'int', value: (r) => r.plays },
                { key: 'yards', short: 'YDS', label: 'Rushing yards', format: 'int', value: (r) => r.yards },
                { key: 'ypc', short: 'Y/C', label: 'Yards per carry', format: 'dec2', value: (r) => per(r.yards, r.plays) },
                { key: 'epa', short: 'EPA/CAR', label: 'EPA per carry', format: 'signed2', better: 'high', value: (r) => per(r.epa, r.plays) },
                { key: 'success', short: 'SUCC%', label: 'Success rate', format: 'pct', value: (r) => per(r.success, r.plays) },
              ]}
              shading={{ epa: { mean: -0.05, sd: 0.15 } }}
              dense
            />
          )}
          {(group === 'WR' || group === 'TE' || group === 'RB') && data.receiving && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <ChartStat label="Catchable targets" value={pctLabel(per(data.receiving.catchable, data.receiving.targets))} sub={`${Math.round(data.receiving.catchable)} of ${data.receiving.targets}`} />
              <ChartStat label="Catch rate on catchable" value={pctLabel(per(data.receiving.catchable_caught, data.receiving.catchable))} />
              <ChartStat label="Contested catches" value={`${Math.round(data.receiving.contested_caught)}/${Math.round(data.receiving.contested)}`} sub={pctLabel(per(data.receiving.contested_caught, data.receiving.contested))} />
              <ChartStat label="Drops (charted)" value={String(Math.round(data.receiving.drops))} />
              <ChartStat label="Created receptions" value={String(Math.round(data.receiving.created))} sub="Catches made on difficult balls" />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ChartStat({ label, value, sub }) {
  return (
    <div className="card px-4 py-3">
      <div className="label mb-1">{label}</div>
      <div className="font-display text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Advanced({ games, ngs, pc, group }) {
  const seasons = seasonsOf(games);
  const ngsSeasons = ngsBySeason(ngs);
  const rows = seasons.map((s) => ({ season: s, ...aggregate(seasonGames(games, s)), ngs: ngsSeasons.get(s) || {} }));
  const columns = [
    ...flattenColumns([{ group: 'Play-by-play', columns: pc.advanced || [] }]),
    ...(pc.ngs || []).map((n) => ({ key: `ngs_${n.key}`, short: n.label, label: n.label, group: 'Next Gen Stats', format: n.format, value: (r) => r.ngs?.[n.key] ?? null, description: METRICS[n.key]?.description })),
  ];
  if (!columns.length) return <EmptyState title="No advanced metrics for this position yet" />;
  return (
    <div className="space-y-3">
      <h2 className="font-sans text-lg font-bold">Advanced metrics by season</h2>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.season}
        lead={{ header: 'Season', render: (r) => <span className="font-semibold">{r.season}</span> }}
      />
      <p className="text-xs text-faint">
        Play-by-play metrics come from nflverse; Next Gen Stats from the NFL's player tracking{group === 'QB' || group === 'RB' || group === 'WR' || group === 'TE' ? ' (published from 2016, for players above the NFL’s volume threshold)' : ''}.
      </p>
    </div>
  );
}

function CareerTable({ games, pc, shading }) {
  if (!games) return null;
  const seasons = seasonsOf(games);
  const rows = seasons.map((s) => ({ season: s, ...aggregate(seasonGames(games, s)) }));
  const career = { label: 'Career', ...aggregate(games.filter((g) => g.season_type === 'REG')) };
  return (
    <Card title="Career by season" bodyClassName="p-0 pt-3" className="overflow-hidden" action={<span className="text-xs text-muted">Career rates are weighted by volume, not averaged across seasons</span>}>
      <div className="[&>.card]:rounded-none [&>.card]:border-x-0 [&>.card]:border-b-0">
        <DataTable
          columns={flattenColumns(pc.career)}
          rows={rows}
          rowKey={(r) => r.season}
          shading={shading}
          footerRows={rows.length > 1 ? [career] : []}
          lead={{ header: 'Season', render: (r) => <span className="font-semibold">{r.label || r.season}</span> }}
        />
      </div>
    </Card>
  );
}

function Career({ games, pc, shading, contracts, player, season }) {
  return (
    <div className="space-y-4">
      <CareerTable games={games} pc={pc} shading={shading} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ContractCard contracts={contracts} player={player} season={season} />
        <Card title="Draft" className="h-fit">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Drafted</dt>
              <dd className="font-semibold">{player.draft_year ? `${player.draft_year} · ${player.draft_team || ''}` : 'Undrafted'}</dd>
            </div>
            {player.draft_round && (
              <div>
                <dt className="text-xs text-muted">Round / pick</dt>
                <dd className="font-semibold">
                  Round {player.draft_round} · #{player.draft_pick}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted">Rookie season</dt>
              <dd className="font-semibold">{player.rookie_season || '–'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Status</dt>
              <dd className="font-semibold">{player.status || '–'}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
