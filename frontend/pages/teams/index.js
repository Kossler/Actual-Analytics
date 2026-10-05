import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import ScatterPlot from '../../components/charts/ScatterPlot';
import DataTable, { sortRows } from '../../components/DataTable';
import { Card, Field, PageHeader, Select } from '../../components/ui';
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

const COLUMNS = [
  { key: 'record', group: 'Results', short: 'Record', label: 'Record', sortable: false, value: () => null, render: (t) => record(t.wins, t.losses, t.ties) },
  col('point_diff', 'Results', { render: (t) => signedInt(t.point_diff) }),
  col('off_epa', 'EPA / play'),
  col('def_epa', 'EPA / play'),
  col('net_epa', 'EPA / play'),
  col('pass_off_epa', 'Offense detail'),
  col('rush_off_epa', 'Offense detail'),
  col('off_success', 'Offense detail'),
];
const SHADED = ['off_epa', 'def_epa', 'net_epa'];

export default function TeamsPage({ meta, data }) {
  const router = useRouter();
  const [sort, setSort] = useState({ key: 'net_epa', dir: 'desc' });
  const [highlight, setHighlight] = useState(null);
  useEffect(() => setHighlight(recentTeam()), []);

  const teams = useMemo(() => data.teams.map(teamMetrics).filter((t) => t.offense), [data.teams]);
  const shading = useMemo(() => Object.fromEntries(SHADED.map((k) => [k, groupStats(teams, k, (t) => t[k])])), [teams]);
  const sorted = sortRows(teams, (t) => t[sort.key], sort.dir);
  const week = Math.max(0, ...teams.map((t) => t.games));

  const navigate = (changes) => router.push({ pathname: '/teams', query: { ...router.query, ...changes } }, undefined, { scroll: false });

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
            <Field label="Situation">
              <Select value={data.situation} onChange={(v) => navigate({ situation: v })} options={SITUATIONS} className="w-48" />
            </Field>
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

          <DataTable
            columns={COLUMNS}
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
            <span>Defense EPA/play is what opponents gained, so negative is good (shaded blue)</span>
            <span>Ranked by Net EPA/play by default · click a column to sort</span>
          </div>
        </>
      )}
    </>
  );
}
