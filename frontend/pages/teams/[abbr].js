import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DataTable from '../../components/DataTable';
import { Breadcrumbs, Card, RankTrack } from '../../components/ui';
import { loadProps, queryString } from '../../lib/api';
import { formatValue, initials, int, ordinal, pctLabel, record, shortName, signed, signedInt, weekLabel } from '../../lib/format';
import { rememberTeam } from '../../lib/storage';
import { divisionStanding, rankOf, teamMetrics } from '../../lib/teams';

export const runtime = 'experimental-edge';

export async function getServerSideProps({ params, query }) {
  return loadProps({ data: `/api/teams/${encodeURIComponent(params.abbr)}${queryString({ season: query.season })}` });
}

// Per-game EPA is centred on zero (league average); the scale sets how quickly shading saturates.
const GAME_SHADING = {
  off_epa: { mean: 0, sd: 0.15 },
  def_epa: { mean: 0, sd: 0.15 },
  net: { mean: 0, sd: 0.2 },
  qb: { mean: 0, sd: 0.25 },
};

const RANKS = [
  { key: 'off_epa', label: 'Offense EPA/play', format: 'signed2' },
  { key: 'def_epa', label: 'Defense EPA/play', format: 'signed2', better: 'low', suffix: ' allowed' },
  { key: 'pass_off_epa', label: 'Pass offense', format: 'signed2' },
  { key: 'rush_off_epa', label: 'Rush offense', format: 'signed2' },
  { key: 'off_success', label: 'Success rate', format: 'pctLabel' },
  { key: 'point_diff', label: 'Point differential', format: 'signedInt' },
];

export default function TeamPage({ data }) {
  const teams = useMemo(() => data.teams.map(teamMetrics), [data.teams]);
  const team = teams.find((t) => t.abbr === data.team.abbr) || teamMetrics(data.team);
  const names = Object.fromEntries(teams.map((t) => [t.abbr, t.name]));
  const [allGames, setAllGames] = useState(false);
  useEffect(() => rememberTeam(team.abbr), [team.abbr]);

  const played = data.schedule.filter((g) => g.points_for != null);
  const upcoming = data.schedule.filter((g) => g.points_for == null);
  const standing = team.division ? divisionStanding(teams.filter((t) => t.offense || t.games), team) : null;
  const odds = team.odds;

  // Name the QB column after the starter when one quarterback took every snap that mattered.
  const qbs = new Set(played.map((g) => g.qb?.player_id).filter(Boolean));
  const qbName = qbs.size === 1 ? played.find((g) => g.qb)?.qb.name : null;

  const results = allGames ? data.schedule : played;
  const resultColumns = [
    { key: 'off_epa', short: 'Off EPA/P', label: 'Offense EPA/play', format: 'signed2', better: 'high', value: (g) => g.off_epa },
    { key: 'def_epa', short: 'Def EPA/P', label: 'Defense EPA/play allowed', format: 'signed2', better: 'low', value: (g) => g.def_epa },
    { key: 'net', short: 'Net', label: 'Net EPA/play', format: 'signed2', better: 'high', value: (g) => (g.off_epa != null && g.def_epa != null ? g.off_epa - g.def_epa : null), render: (g) => <span className="font-semibold">{formatValue(g.off_epa != null && g.def_epa != null ? g.off_epa - g.def_epa : null, 'signed2')}</span> },
    { key: 'qb', short: qbName ? `${shortName(qbName)} EPA/P` : 'QB EPA/P', label: 'Starting QB EPA per dropback', format: 'signed2', better: 'high', value: (g) => g.qb?.epa_per_play ?? null, render: (g) => (g.qb ? (qbName ? formatValue(g.qb.epa_per_play, 'signed2') : <span title={g.qb.name}>{formatValue(g.qb.epa_per_play, 'signed2')} <span className="text-faint">{shortName(g.qb.name)}</span></span>) : '–') },
  ];
  return (
    <>
      <Head>
        <title>{`${team.name} · Second Level Analytics`}</title>
      </Head>
      <Breadcrumbs items={[{ label: 'Teams', href: '/teams' }, { label: team.name }]} />

      <section className="card mb-4 flex flex-col gap-5 p-5 md:flex-row md:items-center" style={{ borderTop: `3px solid ${team.color || '#2f3743'}` }}>
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl font-display text-2xl font-extrabold text-white" style={{ backgroundColor: team.color || '#1f2a44' }}>
          {team.abbr}
        </div>
        <div className="min-w-0 flex-1">
          <div className="label mb-1 text-muted">
            {team.division}
            {standing ? ` · ${ordinal(standing)}` : ''}
          </div>
          <h1 className="text-3xl font-extrabold sm:text-[2.4rem]">{team.name}</h1>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <HeaderStat label="Record" value={record(team.wins, team.losses, team.ties)} />
          <HeaderStat label="Point diff" value={signedInt(team.point_diff)} tone={team.point_diff} />
          <HeaderStat label="Net EPA/play" value={signed(team.net_epa, 2)} tone={team.net_epa} />
          {odds && <HeaderStat label="Playoff odds" value={pctLabel(odds.playoff_pct)} />}
        </dl>
      </section>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="League ranks" subtitle="Out of 32 · marker further right is better">
          <div className="space-y-4">
            {RANKS.map((r) => {
              const rank = rankOf(teams.filter((t) => t[r.key] != null), r.key, team, r.better);
              const tone = rank == null ? undefined : rank <= 10 ? 'good' : rank >= 23 ? 'bad' : undefined;
              const value = r.format === 'pctLabel' ? pctLabel(team[r.key], 1) : formatValue(team[r.key], r.format);
              return (
                <div key={r.key}>
                  <div className="flex justify-between text-sm">
                    <span>{r.label}</span>
                    <span className="text-muted">
                      <span className={`font-semibold ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink'}`}>{rank ? ordinal(rank) : '–'}</span> · {value}
                      {r.suffix || ''}
                    </span>
                  </div>
                  {rank && <RankTrack position={1 - (rank - 1) / 31} tone={tone} />}
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Team leaders" subtitle={`${data.season} regular season`}>
          <div className="space-y-3">
            <Leader kind="Passing" p={data.leaders.passing} main={(p) => `${int(p.passing_yards)} yds`} detail={(p) => `${int(p.passing_tds)} TD · ${int(p.interceptions)} INT · ${signed(p.dropbacks ? p.dropback_epa / p.dropbacks : null, 2)} EPA/P`} />
            <Leader kind="Rushing" p={data.leaders.rushing} main={(p) => `${int(p.rushing_yards)} yds`} detail={(p) => `${int(p.carries)} car · ${int(p.rushing_tds)} TD · ${signed(p.pbp_carries ? p.pbp_rush_epa / p.pbp_carries : null, 2)} EPA/C`} />
            <Leader kind="Receiving" p={data.leaders.receiving} main={(p) => `${int(p.receiving_yards)} yds`} detail={(p) => `${int(p.receptions)} rec · ${int(p.receiving_tds)} TD · ${signed(p.pbp_targets ? p.target_epa / p.pbp_targets : null, 2)} EPA/T`} />
          </div>
        </Card>
      </div>

      {(data.depth?.length > 0 || data.injuries?.length > 0) && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.depth?.length > 0 && <DepthChart depth={data.depth} />}
          <InjuryReport injuries={data.injuries || []} />
        </div>
      )}

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-sans text-[17px] font-bold">{data.season} results</h2>
          {upcoming.length > 0 && (
            <button type="button" className="link text-sm" onClick={() => setAllGames((a) => !a)}>
              {allGames ? 'Played games only' : 'All games →'}
            </button>
          )}
        </div>
        {results.length ? (
          <DataTable
            columns={resultColumns}
            rows={results}
            rowKey={(g) => g.game_id}
            shading={GAME_SHADING}
            lead={{
              header: 'Week / opponent / result',
              className: 'min-w-[340px]',
              render: (g) => {
                const outcome = g.points_for == null ? null : g.points_for > g.points_against ? 'W' : g.points_for < g.points_against ? 'L' : 'T';
                return (
                  <div className="flex items-center gap-3">
                    <span className="w-11 font-semibold">{g.game_type === 'REG' ? `Wk${g.week}` : g.game_type}</span>
                    <Link href={`/games?season=${data.season}&week=${g.week}&game=${g.game_id}`} className="flex-1 truncate hover:underline">
                      <span className="text-faint">{g.home ? 'vs' : '@'}</span> {names[g.opponent] || g.opponent}
                    </Link>
                    {outcome ? (
                      <>
                        <span className={`rounded px-1.5 text-2xs font-bold ${outcome === 'W' ? 'bg-[#1d3a6b] text-good' : 'bg-[#3a2a1c] text-bad'}`}>{outcome}</span>
                        <span className="num w-14 text-right">{`${g.points_for}–${g.points_against}`}</span>
                      </>
                    ) : (
                      <span className="text-xs text-faint">{g.win_prob != null ? `Model ${pctLabel(g.win_prob)}` : g.gameday}</span>
                    )}
                  </div>
                );
              },
            }}
          />
        ) : (
          <Card>
            <p className="text-sm text-muted">No games played yet this season.</p>
          </Card>
        )}
      </div>

      {upcoming.length > 0 && (
        <Card
          title={upcoming.length > 1 ? `Next ${Math.min(3, upcoming.length)} games` : 'Next game'}
          action={<Link href="/predictive-models" className="link text-sm">Model details →</Link>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {upcoming.slice(0, 3).map((g) => (
              <div key={g.game_id} className="rounded-lg border border-line bg-raised/40 p-4">
                <div className="label mb-1">{weekLabel(g.week, g.game_type)}</div>
                <div className="mb-3 font-display text-lg font-bold">
                  <span className="font-sans text-sm font-normal text-faint">{g.home ? 'vs' : '@'}</span> {names[g.opponent] || g.opponent}
                </div>
                {g.win_prob != null ? (
                  <>
                    <div className="mb-1.5 flex justify-between text-xs text-muted">
                      <span>Model win probability</span>
                      <span className="font-semibold text-ink">{pctLabel(g.win_prob)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-line">
                      <div className={`h-full ${g.win_prob >= 0.5 ? 'bg-[#4a8ef0]' : 'bg-bad'}`} style={{ width: `${g.win_prob * 100}%` }} />
                    </div>
                    {g.proj_for != null && (
                      <div className="mt-2 text-xs text-faint">
                        Projected {Math.round(g.proj_for)}–{Math.round(g.proj_against)}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted">Prediction available closer to kickoff.</p>
                )}
              </div>
            ))}
          </div>
          {odds && (
            <p className="mt-4 text-xs text-muted">
              Season simulation: {pctLabel(odds.playoff_pct)} to make the playoffs, {pctLabel(odds.division_pct)} to win the division,{' '}
              {pctLabel(odds.top_seed_pct)} for the No. 1 seed · projected {odds.proj_wins.toFixed(1)}–{odds.proj_losses.toFixed(1)}.
            </p>
          )}
        </Card>
      )}
    </>
  );
}

// Starters (rank 1 at each slot) from the latest depth chart, grouped by unit.
function DepthChart({ depth }) {
  const starters = depth.filter((d) => d.pos_rank === 1);
  const unit = (d) => (d.pos_grp === 'Special Teams' ? 'Special teams' : / D$/.test(d.pos_grp) ? 'Defense' : 'Offense');
  const units = ['Offense', 'Defense', 'Special teams'].map((u) => ({ u, rows: starters.filter((d) => unit(d) === u) })).filter((x) => x.rows.length);
  const updated = depth[0]?.dt ? new Date(depth[0].dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  return (
    <Card title="Depth chart" subtitle={`Starters${updated ? ` · updated ${updated}` : ''}`}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
        {units.map(({ u, rows }) => (
          <div key={u}>
            <div className="label mb-2">{u}</div>
            <ul className="space-y-1 text-sm">
              {rows.map((d) => (
                <li key={`${d.pos_abb}-${d.pos_slot}`} className="flex gap-2">
                  <span className="w-10 shrink-0 text-xs font-semibold text-faint">{d.pos_abb}</span>
                  {d.gsis_id ? (
                    <Link href={`/players/${d.gsis_id}`} className="min-w-0 break-words hover:underline">{d.player_name}</Link>
                  ) : (
                    <span className="min-w-0 break-words">{d.player_name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

function InjuryReport({ injuries }) {
  const week = injuries[0]?.week;
  const tone = { Out: 'border-bad/70 text-bad', Doubtful: 'border-bad/50 text-bad', Questionable: 'border-warn/60 text-warn' };
  return (
    <Card title="Injury report" subtitle={week ? `Week ${week} game designations` : 'No designations this week'}>
      {injuries.length === 0 ? (
        <p className="text-sm text-muted">No players listed as out, doubtful or questionable.</p>
      ) : (
        <ul className="divide-y divide-line/70 text-sm">
          {injuries.map((i) => (
            <li key={i.gsis_id} className="flex items-center gap-3 py-2">
              <span className={`w-24 shrink-0 rounded border px-1.5 py-0.5 text-center text-2xs font-bold uppercase ${tone[i.report_status] || 'border-line-strong text-muted'}`}>
                {i.report_status}
              </span>
              <Link href={`/players/${i.gsis_id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{i.full_name}</Link>
              <span className="text-xs text-faint">{i.position}</span>
              <span className="w-24 truncate text-right text-xs text-muted">{i.report_primary_injury || ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HeaderStat({ label, value, tone }) {
  const color = typeof tone === 'number' ? (tone > 0 ? 'text-good' : tone < 0 ? 'text-bad' : '') : '';
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-display text-xl font-bold ${color}`}>{value}</dd>
    </div>
  );
}

function Leader({ kind, p, main, detail }) {
  if (!p) return null;
  return (
    <Link href={`/players/${p.player_id}`} className="flex items-center gap-3 rounded-lg border border-line p-3 hover:border-line-strong">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold text-muted">{initials(p.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="label">{kind}</div>
        <div className="truncate font-semibold">{p.name}</div>
      </div>
      <div className="text-right">
        <div className="font-display text-lg font-bold">{main(p)}</div>
        <div className="text-xs text-muted">{detail(p)}</div>
      </div>
    </Link>
  );
}
