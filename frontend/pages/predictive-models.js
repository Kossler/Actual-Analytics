import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import CalibrationChart from '../components/charts/CalibrationChart';
import ScatterPlot from '../components/charts/ScatterPlot';
import DataTable, { sortRows } from '../components/DataTable';
import { Card, EmptyState, Field, PageHeader, Segmented, Select, Tabs } from '../components/ui';
import { loadProps, useApi } from '../lib/api';
import { fixed, int, pctLabel, weekLabel } from '../lib/format';
import { TEAM_METRICS } from '../lib/metrics';

export const runtime = 'experimental-edge';

const TABS = [
  { value: 'win', label: 'Win probability', sub: 'Game outcomes' },
  { value: 'projections', label: 'Player projections', sub: 'Stat lines with ranges' },
  { value: 'lab', label: 'Regression lab', sub: 'Which metrics predict wins' },
];

export async function getServerSideProps({ query }) {
  const tab = TABS.some((t) => t.value === query.tab) ? query.tab : 'win';
  const props = await loadProps({ win: tab === 'win' ? '/api/models/win-probability' : null });
  if (props.props) props.props.tab = tab;
  return props;
}

export default function PredictiveModels({ tab, win }) {
  const router = useRouter();
  const setTab = (t) => router.push({ pathname: '/predictive-models', query: t === 'win' ? {} : { tab: t } }, undefined, { scroll: false });
  const winTab = TABS[0];
  const tabs = [{ ...winTab, sub: win?.week ? `Game outcomes, ${weekLabel(win.week, win.upcoming?.[0]?.game_type)}` : winTab.sub }, ...TABS.slice(1)];
  const trained = win?.validation?.trained_at;

  return (
    <>
      <Head>
        <title>Predictive Models · Second Level Analytics</title>
      </Head>
      <PageHeader
        eyebrow={trained ? `Updated ${new Date(trained).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Our models'}
        title="Predictive Models"
      />
      <div className="mb-5">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      {tab === 'win' && <WinProbability data={win} />}
      {tab === 'projections' && <Projections />}
      {tab === 'lab' && <RegressionLab />}
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// Win probability
// ------------------------------------------------------------------------------------------------

function WinProbability({ data }) {
  const perf = data.performance;
  const v = data.validation;
  const holdout = v?.holdout;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        {data.upcoming.length ? (
          <section className="card overflow-hidden">
            <div className="px-5 pt-4">
              <h2 className="font-sans text-[17px] font-bold">{weekLabel(data.week, data.upcoming[0].game_type)} win probabilities</h2>
              <p className="mt-0.5 text-xs text-muted">Bar shows the model’s chance for each side · favorite in bold</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="label border-y border-line text-left">
                    <th className="px-5 py-2.5">Away</th>
                    <th className="px-3 py-2.5 text-center">Win probability</th>
                    <th className="px-3 py-2.5">Home</th>
                    <th className="px-3 py-2.5 text-right">Proj. score</th>
                    <th className="px-5 py-2.5 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcoming.map((g) => {
                    const homeFav = g.home_wp >= 0.5;
                    const fav = homeFav ? g.home_team : g.away_team;
                    return (
                      <tr key={g.game_id} className="border-b border-line/70 last:border-0">
                        <td className={`px-5 py-3.5 text-[15px] ${homeFav ? 'text-muted' : 'font-bold'}`}>
                          <Link href={`/teams/${g.away_team}`} className="hover:underline">{g.away_team}</Link>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className="num w-9 text-right text-xs text-bad">{pctLabel(1 - g.home_wp)}</span>
                            <div className="flex h-2 flex-1 overflow-hidden rounded-full">
                              <div className="bg-bad" style={{ width: `${(1 - g.home_wp) * 100}%` }} />
                              <div className="flex-1 bg-[#4a8ef0]" />
                            </div>
                            <span className="num w-9 text-xs text-good">{pctLabel(g.home_wp)}</span>
                          </div>
                        </td>
                        <td className={`px-3 py-3.5 text-[15px] ${homeFav ? 'font-bold' : 'text-muted'}`}>
                          <Link href={`/teams/${g.home_team}`} className="hover:underline">{g.home_team}</Link>
                        </td>
                        <td className="num px-3 py-3.5 text-right text-muted">
                          {Math.round(g.away_proj)}–{Math.round(g.home_proj)}
                        </td>
                        <td className="num whitespace-nowrap px-5 py-3.5 text-right font-semibold">
                          {fav} +{fixed(Math.abs(g.proj_margin), 1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <EmptyState title="No upcoming games">Predictions return when the next week is scheduled.</EmptyState>
        )}

        <Card title="How the model works">
          <div className="space-y-3 text-sm leading-relaxed text-muted">
            <p>
              Every team carries three ratings, updated after each game: offensive EPA per play, defensive EPA per play allowed,
              and scoring margin. Recent games count more than old ones, and each new season starts from a regressed version of
              last season’s ratings{v?.params ? ` (decay ${v.params.decay}, prior weight ${v.params.prior_weight}, carry-over ${v.params.carry})` : ''}.
            </p>
            <p>
              Two regressions turn rating differences plus home field into a projected margin and total points. The win probability
              is the chance the actual margin lands on the right side of zero, given how far real games have scattered around our
              projections (σ ≈ {v?.sigma ? fixed(v.sigma, 1) : '13'} points).
            </p>
            <p>
              Only information available before kickoff is used: ratings come from earlier games, and the regression weights were
              fit on {v?.trained_seasons ? `${v.trained_seasons[0]}–${v.trained_seasons[1]}` : 'past seasons'}, so this season’s
              numbers are genuine pregame forecasts. Playoff odds come from simulating the rest of the season 10,000 times.
            </p>
            {holdout && (
              <div className="overflow-x-auto pt-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="label border-b border-line text-left">
                      <th className="py-2">Untouched test seasons {holdout.seasons?.join('–')}</th>
                      <th className="py-2 text-right">Picks</th>
                      <th className="py-2 text-right">Brier</th>
                      <th className="py-2 text-right">Log loss</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    <tr className="border-b border-line/70">
                      <td className="py-2 text-ink">Our model</td>
                      <td className="py-2 text-right">{pctLabel(holdout.accuracy, 1)}</td>
                      <td className="py-2 text-right">{fixed(holdout.brier, 3)}</td>
                      <td className="py-2 text-right">{fixed(holdout.log_loss, 3)}</td>
                    </tr>
                    {holdout.market?.games > 0 && (
                      <tr className="border-b border-line/70">
                        <td className="py-2">Betting market (closing moneyline)</td>
                        <td className="py-2 text-right">{pctLabel(holdout.market.accuracy, 1)}</td>
                        <td className="py-2 text-right">{fixed(holdout.market.brier, 3)}</td>
                        <td className="py-2 text-right">{fixed(holdout.market.log_loss, 3)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-2">Coin flip</td>
                      <td className="py-2 text-right">50.0%</td>
                      <td className="py-2 text-right">0.250</td>
                      <td className="py-2 text-right">0.693</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-faint">
                  Lower Brier score and log loss are better. Sportsbooks set the bar: their lines include injury news and
                  sharp money the model doesn’t see.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="How the model is doing" subtitle={`${data.season} season, ${perf.games} games`}>
          {perf.games ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted">Picks</div>
                <div className="whitespace-nowrap font-display text-[22px] font-bold">
                  {perf.correct}–{perf.games - perf.correct}
                </div>
                <div className="text-xs text-good">{pctLabel(perf.correct / perf.games, 1)}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Brier score</div>
                <div className="font-display text-[22px] font-bold">{fixed(perf.brier, 3)}</div>
                <div className="text-xs text-faint">coin flip 0.250</div>
              </div>
              <div>
                <div className="text-xs text-muted">Log loss</div>
                <div className="font-display text-[22px] font-bold">{fixed(perf.logLoss, 3)}</div>
                <div className="text-xs text-faint">coin flip 0.693</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">Results appear after the first games are played.</p>
          )}
          {v?.current_season?.market?.games > 0 && (
            <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
              Betting market on the same games: {pctLabel(v.current_season.market.accuracy, 1)} correct, Brier{' '}
              {fixed(v.current_season.market.brier, 3)}.
            </p>
          )}
        </Card>
        <Card title="Calibration" subtitle="When we say 70%, does the favorite win 70% of the time? Dots on the line = yes.">
          <CalibrationChart bins={perf.calibration} />
          <p className="mt-2 text-xs text-faint">Dot size grows with the number of games in each bucket.</p>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Player projections
// ------------------------------------------------------------------------------------------------

const PROJ_STATS = {
  QB: [
    ['passing_yards', 'Pass yds'], ['passing_tds', 'Pass TD'], ['passing_interceptions', 'INT'],
    ['completions', 'Cmp'], ['attempts', 'Att'], ['rushing_yards', 'Rush yds'],
  ],
  RB: [['rushing_yards', 'Rush yds'], ['carries', 'Carries'], ['rushing_tds', 'Rush TD'], ['receptions', 'Rec'], ['receiving_yards', 'Rec yds']],
  WR: [['receiving_yards', 'Rec yds'], ['receptions', 'Rec'], ['targets', 'Targets'], ['receiving_tds', 'Rec TD']],
  TE: [['receiving_yards', 'Rec yds'], ['receptions', 'Rec'], ['targets', 'Targets'], ['receiving_tds', 'Rec TD']],
};

function Projections() {
  const [pos, setPos] = useState('QB');
  const { data, loading } = useApi('/api/models/projections');
  if (loading || !data) return <EmptyState title="Loading projections…" />;
  const stats = PROJ_STATS[pos];
  const rows = sortRows(
    data.projections.filter((p) => p.position === pos || (pos === 'RB' && p.position === 'FB')),
    (p) => p.stats[stats[0][0]]?.mean,
    'desc'
  );
  const columns = stats.map(([key, label]) => ({
    key,
    short: label,
    label,
    value: (p) => p.stats[key]?.mean,
    render: (p) => {
      const s = p.stats[key];
      if (!s) return '–';
      return (
        <span className="inline-flex flex-col items-end leading-tight">
          <span className="font-semibold text-ink">{key.endsWith('tds') || key.includes('interceptions') ? fixed(s.mean, 1) : int(s.mean)}</span>
          <span className="text-2xs text-faint">
            {int(s.low)}–{int(s.high)}
          </span>
        </span>
      );
    },
  }));
  const bt = data.backtest || {};
  const coverage = stats.map(([key, label]) => bt[key] && `${label} ${pctLabel(bt[key].range_coverage)}`).filter(Boolean);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-sans text-[17px] font-bold">
            {data.week ? `${weekLabel(data.week)} projections` : 'Projections'}
          </h2>
          <p className="text-xs text-muted">Projection with an 80% range (10th–90th percentile) underneath</p>
        </div>
        <Segmented options={['QB', 'RB', 'WR', 'TE']} value={pos} onChange={setPos} />
      </div>
      {rows.length ? (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.player_id}
          lead={{
            header: 'Player',
            className: 'min-w-[240px]',
            render: (p) => (
              <div className="flex items-center gap-2">
                <Link href={`/players/${p.player_id}`} className="font-semibold hover:underline">{p.player_name}</Link>
                <span className="text-xs text-faint">
                  {p.team} {p.home ? 'vs' : '@'} {p.opponent}
                </span>
                {p.depth_rank > 1 && <span className="text-2xs font-semibold text-faint">{p.position}{p.depth_rank}</span>}
                {p.injury_status && (
                  <span className={`rounded border px-1 text-2xs font-bold ${p.injury_status === 'Doubtful' ? 'border-bad/60 text-bad' : 'border-warn/60 text-warn'}`}>
                    {p.injury_status === 'Questionable' ? 'Q' : p.injury_status === 'Doubtful' ? 'D' : p.injury_status}
                  </span>
                )}
              </div>
            ),
          }}
        />
      ) : (
        <EmptyState title="No projections this week" />
      )}
      <Card title="How projections work">
        <div className="space-y-2 text-sm text-muted">
          <p>
            Each player’s recent games are averaged with more weight on the latest ones (last season counts less), then adjusted for
            the opponent’s EPA allowed per pass or run so far this season. Players listed Out on the injury report, or not on
            their team’s current depth chart (quarterbacks must be QB1), are left off; Q and D mark questionable and doubtful.
          </p>
          <p>
            Ranges come from the player’s game-to-game variation, widened or narrowed so that last season roughly 80% of outcomes
            landed inside them. Touchdowns and interceptions use a Poisson distribution.
          </p>
          {coverage.length > 0 && (
            <p className="text-xs text-faint">
              Backtest on this season’s games so far — share of results inside the range: {coverage.join(' · ')}.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Regression lab
// ------------------------------------------------------------------------------------------------

const LAB_X = ['net_epa', 'off_epa', 'def_epa', 'pass_off_epa', 'rush_off_epa', 'pass_def_epa', 'rush_def_epa', 'off_success', 'turnover_diff', 'point_diff', 'win_pct'];
const LAB_Y = [
  { value: 'point_diff', label: 'Point diff per game, wk 10+' },
  { value: 'win_pct', label: 'Win %, wk 10+' },
];

function regression(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  const slope = sxy / sxx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { n, slope, intercept: my - slope * mx, r, r2: r * r };
}

function xLabel(key) {
  const m = TEAM_METRICS[key];
  return key === 'point_diff' ? 'Point differential per game' : m.label;
}

function RegressionLab() {
  const { data, loading } = useApi('/api/models/regression-lab');
  const [x, setX] = useState('net_epa');
  const [y, setY] = useState('point_diff');
  const [from, setFrom] = useState(2010);
  const rows = useMemo(() => (data ? data.rows.filter((r) => r.season >= from) : []), [data, from]);
  const ranking = useMemo(
    () =>
      LAB_X.map((key) => ({ key, ...regression(rows.map((r) => ({ x: r.first[key], y: r.second[y] })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) }))
        .filter((r) => r.n)
        .sort((a, b) => b.r2 - a.r2),
    [rows, y]
  );
  if (loading || !data) return <EmptyState title="Loading the lab…" />;
  const points = rows
    .map((r) => ({ id: `${r.season}-${r.team}`, x: r.first[x], y: r.second[y], name: `${r.season} ${r.team}` }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const fit = regression(points);
  const seasons = [...new Set(data.rows.map((r) => r.season))].sort((a, b) => a - b);
  const yFormat = y === 'win_pct' ? 'pct0' : 'signed1';
  const xFormat = x === 'off_success' || x === 'win_pct' ? 'pct0' : x === 'point_diff' ? 'signed1' : 'signed2';
  const best = ranking[0];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      <Card
        title="Does the first half predict the second?"
        subtitle={`Each dot is one team-season since ${from}: a weeks 1–9 stat against results from week 10 on.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Field label="First-half stat">
              <Select value={x} onChange={setX} options={LAB_X.map((k) => ({ value: k, label: xLabel(k) }))} className="h-9 w-52" />
            </Field>
            <Field label="Predicts">
              <Select value={y} onChange={setY} options={LAB_Y} className="h-9 w-56" />
            </Field>
            <Field label="Since">
              <Select value={from} onChange={(v) => setFrom(Number(v))} options={seasons.slice(0, -3)} className="h-9 w-24" />
            </Field>
          </div>
        }
      >
        <ScatterPlot
          points={points}
          xLabel={xLabel(x)}
          yLabel={LAB_Y.find((o) => o.value === y).label}
          xFormat={xFormat}
          yFormat={yFormat}
          invertY={false}
          fitLine={fit}
          height={420}
        />
        {fit && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4">
            <LabStat label="Team-seasons" value={int(fit.n)} />
            <LabStat label="Correlation (r)" value={fixed(fit.r, 2)} />
            <LabStat label="Variance explained (R²)" value={pctLabel(fit.r2)} />
            <LabStat
              label="Slope"
              value={`${fixed(fit.slope * (xFormat === 'signed2' ? 0.1 : xFormat === 'pct0' ? 0.05 : 1), y === 'win_pct' ? 3 : 2)}`}
              hint={xFormat === 'signed2' ? 'per +0.10 EPA/play' : xFormat === 'pct0' ? 'per +5 points' : 'per +1 point/game'}
            />
          </div>
        )}
      </Card>
      <Card title="Most predictive first-half stats" subtitle={`Share of ${y === 'win_pct' ? 'second-half win %' : 'second-half point differential'} explained`}>
        <ul className="space-y-2.5">
          {ranking.map((r) => (
            <li key={r.key}>
              <button type="button" onClick={() => setX(r.key)} className={`w-full text-left ${r.key === x ? 'text-ink' : 'text-muted hover:text-ink'}`}>
                <div className="flex justify-between text-sm">
                  <span className={r.key === x ? 'font-semibold' : ''}>{xLabel(r.key)}</span>
                  <span className="num">{pctLabel(r.r2)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-line">
                  <div className="h-full rounded-full bg-[#4a8ef0]" style={{ width: `${(r.r2 / (best?.r2 || 1)) * 100}%` }} />
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-faint">
          Win-loss record and point differential describe the past; EPA-based stats tend to say more about what happens next.
        </p>
      </Card>
    </div>
  );
}

function LabStat({ label, value, hint }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="font-display text-xl font-bold">{value}</div>
      {hint && <div className="text-2xs text-faint">{hint}</div>}
    </div>
  );
}
