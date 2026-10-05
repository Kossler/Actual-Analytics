import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import WinProbabilityChart from '../components/charts/WinProbabilityChart';
import { EmptyState, PageHeader, ProbabilityBar } from '../components/ui';
import { fetchJson, loadProps, queryString } from '../lib/api';
import { fixed, int, pctLabel, shortWeekLabel, signed, weekLabel } from '../lib/format';

export const runtime = 'experimental-edge';

export async function getServerSideProps({ query }) {
  const result = await loadProps({ data: `/api/games${queryString({ season: query.season, week: query.week })}` });
  if (result.notFound) return result;
  const { games } = result.props.data;
  const chosen =
    games.find((g) => g.game_id === query.game) || games.find((g) => g.home_score != null) || games[0] || null;
  const detail = chosen ? await fetchJson(`/api/games/${chosen.game_id}`).catch(() => null) : null;
  return { props: { ...result.props, detail } };
}

const isFinal = (g) => g.home_score != null && g.away_score != null;

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

export default function GamesPage({ data, detail }) {
  const router = useRouter();
  const { weeks, games, season, week } = data;
  const index = weeks.findIndex((w) => w.week === week);
  const prev = weeks[index - 1];
  const next = weeks[index + 1];
  const current = weeks[index];
  const status = !current ? '' : current.completed === current.games ? 'Final' : current.completed > 0 ? 'In progress' : 'Upcoming';
  const gameType = games[0]?.game_type;

  const go = (q) => router.push({ pathname: '/games', query: { season, ...q } }, undefined, { scroll: false });

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
          {games.map((g) => (
            <GameCard key={g.game_id} game={g} selected={detail?.game.game_id === g.game_id} onSelect={() => go({ week, game: g.game_id })} />
          ))}
        </div>
      )}

      {detail && <GameDetail detail={detail} />}
    </>
  );
}

function GameCard({ game: g, selected, onSelect }) {
  const final = isFinal(g);
  const p = pregame(g);
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
      {p && (
        <>
          <div className="mt-3 text-xs text-muted">
            {final ? 'Pregame model' : 'Model'}: {p.team} {pctLabel(p.prob)}
          </div>
          <ProbabilityBar left={1 - g.home_wp} className="mt-1.5" />
        </>
      )}
    </button>
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

function GameDetail({ detail }) {
  const { game, series, teams } = detail;
  const final = isFinal(game);
  const home = teams.find((t) => t.team === game.home_team);
  const away = teams.find((t) => t.team === game.away_team);
  const title = final
    ? `${game.away_team} ${game.away_score} @ ${game.home_team} ${game.home_score}`
    : `${game.away_team} @ ${game.home_team}`;

  return (
    <section className="card grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <div className="label">Game detail · {final ? 'Final' : series.length ? 'In progress' : 'Preview'}</div>
        <h2 className="mt-1 text-3xl font-extrabold">{title}</h2>
        {series.length ? (
          <>
            <p className="mb-3 text-sm text-muted">Win probability for {game.home_team} over the game</p>
            <WinProbabilityChart series={series} home={game.home_team} away={game.away_team} />
          </>
        ) : (
          <Preview game={game} />
        )}
      </div>
      <div>
        <h3 className="mb-3 font-sans text-[17px] font-bold">Team comparison</h3>
        {home && away ? (
          <>
            <div className="mb-3 flex justify-between text-sm font-bold">
              <span className="text-bad">{game.away_team}</span>
              <span className="text-good">{game.home_team}</span>
            </div>
            <Compare label="EPA / play" a={away.epa / away.plays} b={home.epa / home.plays} format={(v) => signed(v, 2)} diverging />
            <Compare label="Success rate" a={away.success / away.plays} b={home.success / home.plays} format={(v) => pctLabel(v)} />
            <Compare label="Total yards" a={away.yards} b={home.yards} format={int} />
            <Compare label="Turnovers" a={away.turnovers} b={home.turnovers} format={int} />
            <p className="mt-4 text-xs text-faint">Passing and rushing plays only; yards exclude penalties and returns.</p>
          </>
        ) : (
          <p className="text-sm text-muted">Available once the game starts.</p>
        )}
        <Link href={`/teams/${game.home_team}`} className="link mt-4 inline-block text-sm">
          {game.home_team} team page →
        </Link>
      </div>
    </section>
  );
}

function Preview({ game }) {
  if (game.pregame_home_wp == null) return <p className="mt-3 text-sm text-muted">No prediction for this game yet.</p>;
  const homeFav = game.pregame_home_wp >= 0.5;
  return (
    <div className="mt-4 max-w-lg space-y-4">
      <div className="flex justify-between text-sm">
        <span>
          {game.away_team} <span className="font-semibold">{pctLabel(1 - game.pregame_home_wp)}</span>
        </span>
        <span>
          <span className="font-semibold">{pctLabel(game.pregame_home_wp)}</span> {game.home_team}
        </span>
      </div>
      <ProbabilityBar left={1 - game.pregame_home_wp} />
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

function Compare({ label, a, b, format, diverging }) {
  const share = diverging ? Math.max(0.05, Math.min(0.95, 0.5 + (a - b) * 1.5)) : a + b > 0 ? a / (a + b) : 0.5;
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{format(a)}</span>
        <span className="text-xs text-muted">{label}</span>
        <span className="font-semibold">{format(b)}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div className="bg-[#5c3c22]" style={{ width: `${share * 100}%` }} />
        <div className="flex-1 bg-[#4a8ef0]" />
      </div>
    </div>
  );
}
