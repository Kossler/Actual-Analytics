import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import WinProbabilityChart from '../components/charts/WinProbabilityChart';
import { EmptyState, MatchupBar, PageHeader } from '../components/ui';
import { fetchJson, loadProps, queryString, useApi, usePolling } from '../lib/api';
import { fixed, int, pctLabel, shortWeekLabel, signed, weekLabel } from '../lib/format';
import { matchupColors } from '../lib/teams';

export const runtime = 'experimental-edge';

export async function getServerSideProps({ query }) {
  const result = await loadProps({ data: `/api/games${queryString({ season: query.season, week: query.week })}`, meta: '/api/meta' });
  if (result.notFound) return result;
  const { games } = result.props.data;
  const chosen =
    games.find((g) => g.game_id === query.game) || games.find((g) => g.home_score != null) || games[0] || null;
  const detail = chosen ? await fetchJson(`/api/games/${chosen.game_id}`).catch(() => null) : null;
  // Only the colours are needed from the team list.
  const teamColors = Object.fromEntries(result.props.meta.teams.map((t) => [t.abbr, { color: t.color, color2: t.color2 }]));
  return { props: { data: result.props.data, teamColors, detail } };
}

const isFinal = (g) => g.home_score != null && g.away_score != null;
const LIVE_POLL_MS = 15000;

// Merges live scores into a scheduled game until the nightly ingest records its result.
function withLive(g, live) {
  if (!live || isFinal(g) || live.state === 'pre') return g;
  if (live.state === 'in') return { ...g, live };
  return { ...g, home_score: live.home_score, away_score: live.away_score };
}

function pregame(g) {
  if (g.home_wp == null) return null;
  const homeFav = g.home_wp >= 0.5;
  return { team: homeFav ? g.home_team : g.away_team, prob: homeFav ? g.home_wp : 1 - g.home_wp, homeFav };
}

function isUpset(g) {
  const p = pregame(g);
  if (!p || !isFinal(g) || g.home_score === g.away_score) return false;
  return (g.home_score > g.away_score) !== p.homeFav;
}

export default function GamesPage({ data, teamColors, detail }) {
  const colorsFor = (g) => matchupColors(teamColors[g.away_team], teamColors[g.home_team]);
  const router = useRouter();
  const { weeks, games, season, week } = data;
  const index = weeks.findIndex((w) => w.week === week);
  const prev = weeks[index - 1];
  const next = weeks[index + 1];
  const current = weeks[index];
  const status = !current ? '' : current.completed === current.games ? 'Final' : current.completed > 0 ? 'In progress' : 'Upcoming';
  const gameType = games[0]?.game_type;

  const go = (q) => router.push({ pathname: '/games', query: { season, ...q } }, undefined, { scroll: false });

  // Poll live scores while this week has games without a recorded result.
  const pending = games.some((g) => !isFinal(g));
  const liveData = usePolling(pending ? '/api/live' : null, LIVE_POLL_MS);
  const liveById = new Map((liveData?.games || []).map((l) => [l.game_id, l]));
  const shown = games.map((g) => withLive(g, liveById.get(g.game_id)));

  return (
    <>
      <Head>
        <title>{`${weekLabel(week, gameType)} Games · Second Level Analytics`}</title>
      </Head>
      <PageHeader
        eyebrow={`${season} ${gameType && gameType !== 'REG' ? 'Postseason' : 'Regular season'}`}
        title={`${weekLabel(week, gameType)} Games`}
        right={
          <div className="flex items-center gap-2">
            {prev && (
              <button type="button" className="btn h-auto py-1.5 text-xs" onClick={() => go({ week: prev.week })}>
                ← {shortWeekLabel(prev.week, prev.game_type)}
              </button>
            )}
            <span className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-page">
              {shortWeekLabel(week, gameType).replace('Wk', 'Week')} · {status}
            </span>
            {next && (
              <button type="button" className="btn h-auto py-1.5 text-xs" onClick={() => go({ week: next.week })}>
                {shortWeekLabel(next.week, next.game_type)} {next.completed === 0 ? 'preview ' : ''}→
              </button>
            )}
          </div>
        }
      />

      {games.length === 0 ? (
        <EmptyState title="No games scheduled this week" />
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((g) => (
            <GameCard key={g.game_id} game={g} colors={colorsFor(g)} selected={detail?.game.game_id === g.game_id} onSelect={() => go({ week, game: g.game_id })} />
          ))}
        </div>
      )}

      {detail && <GameDetail key={detail.game.game_id} detail={detail} live={liveById.get(detail.game.game_id)} colors={colorsFor(detail.game)} />}
    </>
  );
}

function GameCard({ game: g, colors, selected, onSelect }) {
  if (g.live) return <LiveCard game={g} colors={colors} selected={selected} onSelect={onSelect} />;
  const final = isFinal(g);
  const awayWon = final && g.away_score > g.home_score;
  const homeWon = final && g.home_score > g.away_score;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card p-4 text-left transition-colors hover:border-line-strong ${selected ? 'border-ink/80 bg-raised' : ''}`}
    >
      <div className="label mb-2 flex justify-between">
        <span>{final ? 'Final' : kickoff(g)}</span>
        {isUpset(g) && <span className="text-warn">Upset</span>}
      </div>
      <TeamLine abbr={g.away_team} score={g.away_score} won={awayWon} final={final} />
      <TeamLine abbr={g.home_team} score={g.home_score} won={homeWon} final={final} />
      {g.home_wp != null && (
        <MatchupBar away={g.away_team} home={g.home_team} homeWp={g.home_wp} colors={colors} caption={final ? 'Pregame model' : 'Model'} className="mt-3" />
      )}
    </button>
  );
}

function LiveCard({ game: g, colors, selected, onSelect }) {
  const { live } = g;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`card p-4 text-left transition-colors hover:border-line-strong ${selected ? 'border-ink/80 bg-raised' : ''}`}
    >
      <div className="label mb-2 flex justify-between">
        <LiveBadge />
        <span className="num normal-case tracking-normal text-muted">{live.detail}</span>
      </div>
      <LiveTeamLine abbr={live.away_team} score={live.away_score} ball={live.possession === live.away_team} />
      <LiveTeamLine abbr={live.home_team} score={live.home_score} ball={live.possession === live.home_team} />
      <MatchupBar away={live.away_team} home={live.home_team} homeWp={live.home_wp} colors={colors} caption="Live model" className="mt-3" />
    </button>
  );
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-1.5 text-bad">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bad" />
      Live
    </span>
  );
}

function LiveTeamLine({ abbr, score, ball }) {
  return (
    <div className="flex items-baseline justify-between text-ink">
      <span className="text-[17px]">
        {abbr}
        {ball && <span className="ml-1.5 align-middle text-[9px] text-warn" title="Possession">●</span>}
      </span>
      <span className="font-display text-xl">{score}</span>
    </div>
  );
}

function kickoff(g) {
  if (!g.gameday) return 'Scheduled';
  const d = new Date(`${g.gameday}T12:00:00`);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!g.gametime) return day;
  // nflverse kickoff times are 24-hour Eastern time ("16:25").
  const [h, m] = g.gametime.split(':').map(Number);
  return `${day} · ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'} ET`;
}

function TeamLine({ abbr, score, won, final }) {
  return (
    <div className={`flex items-baseline justify-between ${final && !won ? 'text-muted' : 'text-ink'}`}>
      <span className={`text-[17px] ${won ? 'font-bold' : ''}`}>{abbr}</span>
      <span className={`font-display text-xl ${won ? 'font-bold' : ''}`}>{final ? score : ''}</span>
    </div>
  );
}

function GameDetail({ detail, live, colors }) {
  const [showDrives, setShowDrives] = useState(false);
  const { teams } = detail;
  // Until the nightly ingest loads its play-by-play, a started game's chart comes from the live feed.
  const useLiveFeed = !detail.series.length && !!live && live.state !== 'pre';
  const inProgress = useLiveFeed && live.state === 'in';
  const liveDetail = usePolling(useLiveFeed ? `/api/live/${detail.game.game_id}` : null, inProgress ? LIVE_POLL_MS : null);
  const game = useLiveFeed ? { ...detail.game, home_score: live.home_score, away_score: live.away_score } : detail.game;
  const series = useLiveFeed ? liveDetail?.series || [] : detail.series;
  const final = !inProgress && isFinal(game);
  const home = teams.find((t) => t.team === game.home_team);
  const away = teams.find((t) => t.team === game.away_team);
  const title = final || inProgress
    ? `${game.away_team} ${game.away_score} @ ${game.home_team} ${game.home_score}`
    : `${game.away_team} @ ${game.home_team}`;

  return (
    <>
    <section className="card grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="label flex items-center gap-2">
          {inProgress ? (
            <>
              <LiveBadge /> <span>· {live.detail}</span>
            </>
          ) : (
            `Game detail · ${final ? 'Final' : series.length ? 'In progress' : 'Preview'}`
          )}
        </div>
        <h2 className="mt-1 text-3xl font-extrabold">{title}</h2>
        {inProgress && <Situation live={live} />}
        {series.length ? (
          <>
            <p className="mb-3 text-sm text-muted">
              Win probability for {game.home_team} over the game
              {inProgress && ` · now ${pctLabel(live.home_wp)}, updating live`}
            </p>
            <WinProbabilityChart series={series} home={game.home_team} away={game.away_team} colors={colors} />
          </>
        ) : (
          <Preview game={game} colors={colors} />
        )}
      </div>
      <div>
        <h3 className="mb-3 font-sans text-[17px] font-bold">Team comparison</h3>
        {home && away ? (
          <>
            <div className="mb-3 flex justify-between text-sm font-bold">
              <span style={{ color: colors.away }}>{game.away_team}</span>
              <span style={{ color: colors.home }}>{game.home_team}</span>
            </div>
            <Compare colors={colors} label="EPA / play" a={away.epa / away.plays} b={home.epa / home.plays} format={(v) => signed(v, 2)} diverging />
            <Compare colors={colors} label="Success rate" a={away.success / away.plays} b={home.success / home.plays} format={(v) => pctLabel(v)} />
            <Compare colors={colors} label="Total yards" a={away.yards} b={home.yards} format={int} />
            <Compare colors={colors} label="Turnovers" a={away.turnovers} b={home.turnovers} format={int} />
            <p className="mt-4 text-xs text-faint">Passing and rushing plays only; yards exclude penalties and returns.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Available once the game starts.</p>
        )}
        {series.length > 0 && !useLiveFeed && (
          <button type="button" className="link mt-4 block text-sm" onClick={() => setShowDrives((v) => !v)}>
            {showDrives ? 'Hide play-by-play' : 'Play-by-play & drive chart →'}
          </button>
        )}
        <Link href={`/teams/${game.home_team}`} className="link mt-2 inline-block text-sm">
          {game.home_team} team page →
        </Link>
      </div>
    </section>
    {showDrives && <Drives game={game} colors={colors} />}
    </>
  );
}

function Situation({ live }) {
  return (
    <div className="mb-3 mt-1 space-y-1 text-sm">
      {live.possession && (
        <p className="text-ink">
          <span className="font-semibold">{live.possession}</span> ball
          {live.down_distance ? ` · ${live.down_distance}` : ''}
          {live.red_zone && <span className="ml-2 text-xs font-semibold text-bad">Red zone</span>}
        </p>
      )}
      {live.last_play && <p className="text-xs text-muted">Last play: {live.last_play}</p>}
    </div>
  );
}

const RESULT_TONE = { Touchdown: 'text-good', 'Field goal': 'text-good', Turnover: 'text-bad', 'Turnover on downs': 'text-bad', Safety: 'text-bad', 'Opp touchdown': 'text-bad' };

// One row per drive: a bar across the field from where the drive started to where it ended,
// measured from the offense's own goal line, so every drive reads left to right.
function Drives({ game, colors }) {
  const { data, loading } = useApi(`/api/games/${game.game_id}/drives`);
  const [open, setOpen] = useState(null);
  if (loading || !data) return <div className="card mt-4 p-5 text-sm text-muted">Loading drives…</div>;
  if (!data.drives.length) return <div className="card mt-4 p-5 text-sm text-muted">No play-by-play for this game yet.</div>;
  let quarter = null;
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-2 px-5 pt-4">
        <div>
          <h2 className="font-sans text-[17px] font-bold">Drive chart</h2>
          <p className="text-xs text-muted">Each bar runs from the drive's start to its end, measured from the offense's own goal line. Click a drive for its plays.</p>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ backgroundColor: colors.away }} />{game.away_team}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm" style={{ backgroundColor: colors.home }} />{game.home_team}</span>
        </div>
      </div>
      <div className="mt-3">
        <div className="grid grid-cols-[64px_44px_1fr_150px] gap-3 border-y border-line px-5 py-2 text-2xs font-semibold uppercase tracking-label text-faint max-md:grid-cols-[56px_40px_1fr]">
          <span>Start</span>
          <span>Team</span>
          <span className="flex justify-between"><span>Own goal</span><span>50</span><span>Opp goal</span></span>
          <span className="max-md:hidden">Result</span>
        </div>
        {data.drives.map((d) => {
          const header = d.quarter !== quarter ? (quarter = d.quarter) : null;
          const home = d.team === game.home_team;
          const lo = Math.min(d.from ?? 0, d.to ?? d.from ?? 0);
          const hi = Math.max(d.from ?? 0, d.to ?? d.from ?? 0);
          const isOpen = open === d.number;
          return (
            <div key={d.number}>
              {header != null && (
                <div className="bg-white/[0.02] px-5 py-1 text-2xs font-semibold uppercase tracking-label text-faint">
                  {header > 4 ? 'Overtime' : `Quarter ${header}`}
                </div>
              )}
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : d.number)}
                className={`grid w-full grid-cols-[64px_44px_1fr_150px] items-center gap-3 border-b border-line/60 px-5 py-2 text-left text-sm hover:bg-white/[0.02] max-md:grid-cols-[56px_40px_1fr] ${isOpen ? 'bg-white/[0.03]' : ''}`}
              >
                <span className="num text-xs text-muted">Q{d.quarter} {d.start_time}</span>
                <span className="text-xs font-bold">{d.team}</span>
                <span className="relative h-4 rounded-sm bg-[#10151b]">
                  {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((y) => (
                    <span key={y} className={`absolute inset-y-0 w-px ${y === 50 ? 'bg-line-strong' : 'bg-line/70'}`} style={{ left: `${y}%` }} />
                  ))}
                  {d.from != null && (
                    <span
                      className="absolute inset-y-[3px] rounded-sm"
                      style={{ left: `${lo}%`, width: `${Math.max(1, hi - lo)}%`, backgroundColor: home ? colors.home : colors.away }}
                    />
                  )}
                </span>
                <span className="max-md:col-span-3 max-md:pl-[112px]">
                  <span className={`text-xs font-semibold ${RESULT_TONE[d.result] || 'text-muted'}`}>{d.result}</span>
                  <span className="block text-2xs text-faint">
                    {d.plays} plays · {d.yards} yds · {d.top}
                  </span>
                </span>
              </button>
              {isOpen && (
                <ol className="border-b border-line bg-[#0f1319] px-5 py-2">
                  {d.list.map((p, i) => (
                    <li key={i} className="grid grid-cols-[110px_1fr_60px] gap-3 py-1.5 text-xs">
                      <span className="text-faint">
                        {p.down ? `${p.down}${['', 'st', 'nd', 'rd', 'th'][p.down]} & ${p.ydstogo}` : p.type === 'kickoff' ? 'Kickoff' : ''}
                        {p.yrdln ? ` · ${p.yrdln}` : ''}
                      </span>
                      <span className="text-muted">{p.description}</span>
                      <span className={`num text-right ${p.epa > 0 ? 'text-good' : p.epa < 0 ? 'text-bad' : 'text-faint'}`}>{p.epa != null ? signed(p.epa, 2) : ''}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
      <p className="px-5 py-3 text-xs text-faint">EPA per play is from the offense's perspective.</p>
    </section>
  );
}

function Preview({ game, colors }) {
  if (game.pregame_home_wp == null) return <p className="mt-3 text-sm text-muted">No prediction for this game yet.</p>;
  const homeFav = game.pregame_home_wp >= 0.5;
  return (
    <div className="mt-4 max-w-lg space-y-4">
      <MatchupBar away={game.away_team} home={game.home_team} homeWp={game.pregame_home_wp} colors={colors} caption="Model win probability" className="[&>div:first-child]:text-sm" />
      <p className="text-sm text-muted">
        Model projection: {game.away_team} {fixed(game.away_proj, 0)}, {game.home_team} {fixed(game.home_proj, 0)} ·{' '}
        {homeFav ? game.home_team : game.away_team} by {fixed(Math.abs(game.home_proj - game.away_proj), 1)}
      </p>
      <Link href="/predictive-models" className="link text-sm">
        How the model works →
      </Link>
    </div>
  );
}

function Compare({ label, a, b, format, diverging, colors }) {
  const share = diverging ? Math.max(0.05, Math.min(0.95, 0.5 + (a - b) * 1.5)) : a + b > 0 ? a / (a + b) : 0.5;
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{format(a)}</span>
        <span className="text-xs text-muted">{label}</span>
        <span className="font-semibold">{format(b)}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div style={{ width: `${share * 100}%`, backgroundColor: colors.away }} />
        <div className="flex-1" style={{ backgroundColor: colors.home }} />
      </div>
    </div>
  );
}
