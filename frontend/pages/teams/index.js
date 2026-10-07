import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import ScatterPlot from '../../components/charts/ScatterPlot';
import DataTable, { sortRows } from '../../components/DataTable';
import { ButtonGroup, Card, Field, PageHeader, Select } from '../../components/ui';
import { loadProps, queryString } from '../../lib/api';
import { record, signedInt } from '../../lib/format';
import { TEAM_METRICS, groupStats } from '../../lib/metrics';
import { recentTeam } from '../../lib/storage';
import { SITUATIONS, teamMetrics } from '../../lib/teams';

export const runtime = 'experimental-edge';

export async function getServerSideProps({ query }) {
  return loadProps({
    meta: '/api/meta',
    data: `/api/teams${queryString({ season: query.season, situation: query.situation })}`,
  });
}

const col = (key, group, extra = {}) => ({ key, group, ...TEAM_METRICS[key], value: (t) => t[key], ...extra });

const RECORD = { key: 'record', group: 'Results', short: 'Record', label: 'Record', sortable: false, value: () => null, render: (t) => record(t.wins, t.losses, t.ties) };

// Column sets. Efficiency follows the situation filter; the others are season totals over all plays.
const VIEWS = {
  efficiency: {
    label: 'Efficiency',
    sort: 'net_epa',
    shaded: ['off_epa', 'def_epa', 'net_epa'],
    note: 'Defense EPA/play is what opponents gained, so negative is good (shaded blue)',
    columns: [
      RECORD,
      col('point_diff', 'Results', { render: (t) => signedInt(t.point_diff) }),
      col('off_epa', 'EPA / play'),
      col('def_epa', 'EPA / play'),
      col('net_epa', 'EPA / play'),
      col('pass_off_epa', 'Offense detail'),
      col('rush_off_epa', 'Offense detail'),
      col('off_success', 'Offense detail'),
      col('pass_def_epa', 'Defense detail'),
      col('rush_def_epa', 'Defense detail'),
    ],
  },
  drives: {
    label: 'Drives',
    sort: 'ppd',
    columns: [
      col('ppd', 'Offense'), col('scoring_drive_pct', 'Offense'), col('three_out_pct', 'Offense'), col('rz_td_pct', 'Offense'), col('giveaway_drive_pct', 'Offense'),
      col('def_ppd', 'Defense'), col('def_scoring_drive_pct', 'Defense'), col('def_three_out_pct', 'Defense'), col('def_rz_td_pct', 'Defense'), col('takeaway_drive_pct', 'Defense'),
    ],
    note: 'Every possession counts, including end-of-half drives',
  },
  big_plays: {
    label: 'Big plays',
    sort: 'explosive_pct',
    columns: [
      col('explosive_pct', 'Offense'), col('stuffed_pct', 'Offense'),
      col('def_explosive_pct', 'Defense'), col('def_stuff_pct', 'Defense'),
    ],
    note: 'Explosive: 20+ yard pass or 10+ yard run · stuffed: designed run stopped at or behind the line',
  },
  style: {
    label: 'Style',
    sort: 'proe',
    columns: [
      col('proe', 'Play calling'), col('early_pass_pct', 'Play calling'), col('fourth_go_pct', 'Play calling'),
      col('sec_per_play', 'Tempo & formation'), col('shotgun_pct', 'Tempo & formation'), col('no_huddle_pct', 'Tempo & formation'),
      col('motion_pct', 'Pre-snap (FTN)'), col('play_action_pct', 'Pre-snap (FTN)'),
      col('blitz_pct', 'Defense'),
    ],
    note: 'Style stats have no better or worse, so they are not shaded · FTN charting starts in 2022',
  },
  tracking: {
    label: 'Next Gen Stats',
    sort: 'ngs_ryoe_per',
    columns: [
      col('ngs_time_to_throw', 'Offense'), col('ngs_air_yards_to_sticks', 'Offense'), col('ngs_ryoe_per', 'Offense'),
      col('ngs_rush_beat_pct', 'Offense'), col('ngs_box_faced', 'Offense'), col('ngs_separation', 'Offense'),
      col('ngs_def_time_to_throw', 'Defense'), col('ngs_def_ryoe_per', 'Defense'), col('ngs_def_rush_beat_pct', 'Defense'),
      col('ngs_def_separation', 'Defense'), col('ngs_def_tight_window', 'Defense'), col('ngs_def_box', 'Defense'),
    ],
    note: "NFL player tracking for each team's main players (the NFL publishes weekly figures only above a volume threshold) · season totals over all plays",
  },
  luck: {
    label: 'Luck & special teams',
    sort: 'wins_over_pythag',
    columns: [
      RECORD,
      col('pythag_wins', 'Expected record'), col('wins_over_pythag', 'Expected record'),
      col('fumble_recovery_pct', 'Turnover luck'), col('int_per_worthy', 'Turnover luck'), col('def_int_per_worthy', 'Turnover luck'),
      col('turnover_diff', 'Turnover luck'),
      col('st_epa_pg', 'Special teams'),
    ],
    note: 'Luck stats tend to even out over time; teams far from average usually regress',
  },
};

export default function TeamsPage({ meta, data }) {
  const router = useRouter();
  const viewKey = VIEWS[router.query.view] ? router.query.view : 'efficiency';
  const view = VIEWS[viewKey];
  const [sort, setSort] = useState({ key: view.sort, dir: TEAM_METRICS[view.sort]?.better === 'low' ? 'asc' : 'desc' });
  useEffect(() => setSort({ key: view.sort, dir: TEAM_METRICS[view.sort]?.better === 'low' ? 'asc' : 'desc' }), [view.sort]);
  const [highlight, setHighlight] = useState(null);
  useEffect(() => setHighlight(recentTeam()), []);

  const teams = useMemo(() => data.teams.map(teamMetrics).filter((t) => t.offense), [data.teams]);
  // Shade every column with a better direction (style stats have none).
  const shading = useMemo(
    () => Object.fromEntries(view.columns.filter((c) => (view.shaded || [c.key]).includes(c.key) && c.better).map((c) => [c.key, groupStats(teams, c.key, (t) => t[c.key])])),
    [teams, view]
  );
  const sorted = sortRows(teams, (t) => t[sort.key], sort.dir);
  const week = Math.max(0, ...teams.map((t) => t.games));

  const navigate = (changes, shallow = false) => {
    const query = { ...router.query, ...changes };
    for (const k of Object.keys(query)) if (query[k] === undefined) delete query[k];
    router.push({ pathname: '/teams', query }, undefined, { scroll: false, shallow });
  };

  return (
    <>
      <Head>
        <title>Team Rankings · Second Level Analytics</title>
      </Head>
      <PageHeader
        eyebrow={`${data.season} Regular season${week ? ` · Through week ${meta.season === data.season ? meta.week : week}` : ''}`}
        title="Team Rankings"
        right={
          <div className="flex gap-3">
            {viewKey === 'efficiency' && (
              <Field label="Situation">
                <Select value={data.situation} onChange={(v) => navigate({ situation: v })} options={SITUATIONS} className="w-48" />
              </Field>
            )}
            <Field label="Season">
              <Select value={data.season} onChange={(v) => navigate({ season: v })} options={meta.seasons.filter((s) => s >= 1999)} className="w-24" />
            </Field>
          </div>
        }
      />

      {teams.length === 0 ? (
        <Card title="No games yet">
          <p className="text-sm text-muted">Rankings appear after the first week of the season.</p>
        </Card>
      ) : (
        <>
          <Card
            className="mb-4"
            title="Offense vs. defense"
            subtitle="EPA per play. Up and right is better on both sides of the ball; dashed lines mark the league average."
          >
            <ScatterPlot
              points={teams.map((t) => ({ id: t.abbr, x: t.off_epa, y: t.def_epa, label: t.abbr, name: t.name, highlight: t.abbr === highlight }))}
              xLabel="Better offense (EPA/play)"
              yLabel="Better defense (EPA/play allowed)"
              invertY
              quadrants={{ topRight: 'GOOD ON BOTH SIDES', bottomLeft: 'STRUGGLING ON BOTH' }}
              onPointClick={(p) => router.push(`/teams/${p.id}`)}
              height={420}
            />
          </Card>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <ButtonGroup
              options={Object.entries(VIEWS).map(([value, v]) => ({ value, label: v.label }))}
              value={viewKey}
              onChange={(v) => navigate({ view: v === 'efficiency' ? undefined : v }, true)}
            />
            {viewKey !== 'efficiency' && <span className="text-xs text-faint">Season totals, all plays</span>}
          </div>
          <DataTable
            columns={view.columns}
            rows={sorted}
            rowKey={(t) => t.abbr}
            sortKey={sort.key}
            sortDir={sort.dir}
            onSort={(key) =>
              setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: TEAM_METRICS[key]?.better === 'low' ? 'asc' : 'desc' }))
            }
            shading={shading}
            lead={{
              header: 'Team',
              className: 'min-w-[200px]',
              render: (t, i) => (
                <div className="flex items-center gap-3">
                  <span className="num w-5 text-right text-xs text-faint">{i + 1}</span>
                  <span className="w-9 text-xs font-bold text-muted">{t.abbr}</span>
                  <Link href={`/teams/${t.abbr}`} className={`font-semibold hover:underline ${t.abbr === highlight ? 'link' : ''}`}>
                    {t.nick}
                  </Link>
                </div>
              ),
            }}
          />
          <div className="mt-3 flex flex-col gap-1 text-xs text-faint sm:flex-row sm:justify-between">
            <span>{view.note}</span>
            <span>
              Ranked by {TEAM_METRICS[view.sort].label} by default · click a column to sort ·{' '}
              <Link href="/glossary#team" className="link">Glossary</Link>
            </span>
          </div>
        </>
      )}
    </>
  );
}
