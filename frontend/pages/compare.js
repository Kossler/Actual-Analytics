import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { EmptyState, Field, PageHeader, Select } from '../components/ui';
import { fetchJson, loadProps } from '../lib/api';
import { formatValue, initials } from '../lib/format';
import { METRICS, aggregate, metricValue, playerGroup } from '../lib/metrics';
import { POSITIONS, flattenColumns } from '../lib/positions';
import { seasonGames, seasonsOf } from '../lib/player';

export const runtime = 'experimental-edge';

export async function getServerSideProps({ query }) {
  const ids = String(query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const requests = Object.fromEntries(ids.map((id, i) => [`p${i}`, `/api/players/${encodeURIComponent(id)}/page`]));
  const result = await loadProps(requests);
  if (result.notFound) return result;
  return { props: { players: ids.map((_, i) => result.props[`p${i}`]) } };
}

export default function ComparePage({ players }) {
  const router = useRouter();
  const allSeasons = [...new Set(players.flatMap((p) => seasonsOf(p.games)))].sort((a, b) => b - a);
  const season = Number(router.query.season) || allSeasons[0];
  const ids = players.map((p) => p.player.gsis_id);

  const setIds = (next) => router.push({ pathname: '/compare', query: { ...router.query, ids: next.join(',') } }, undefined, { scroll: false });

  // Rows come from the first player's position; other positions' metrics show where they apply.
  const group = playerGroup(players[0]?.player, players[0]?.games);
  const config = POSITIONS[group] || POSITIONS.OTHER;
  const metricKeys = [
    ...new Set([
      'games',
      ...(config.columnSets ? flattenColumns(config.columnSets.Standard).map((c) => c.key) : []),
      ...(config.player?.cards || []),
      ...(config.player?.advanced || []),
    ]),
  ];
  const totals = players.map((p) => {
    const games = seasonGames(p.games, season);
    return games.length ? aggregate(games) : null;
  });

  return (
    <>
      <Head>
        <title>Compare players · Second Level Analytics</title>
      </Head>
      <PageHeader
        eyebrow={`${season || ''} Regular season`}
        title="Compare Players"
        right={
          allSeasons.length > 0 && (
            <Field label="Season">
              <Select value={season} onChange={(s) => router.push({ pathname: '/compare', query: { ...router.query, season: s } }, undefined, { scroll: false })} options={allSeasons} className="w-24" />
            </Field>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {players.map((p) => (
          <div key={p.player.gsis_id} className="card flex items-center gap-3 py-2 pl-2 pr-3">
            {p.player.headshot ? (
              <img src={p.player.headshot} alt="" className="h-9 w-9 rounded-full bg-raised object-cover object-top" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-raised text-xs font-bold text-muted">{initials(p.player.display_name)}</span>
            )}
            <div>
              <Link href={`/players/${p.player.gsis_id}`} className="font-semibold hover:underline">{p.player.display_name}</Link>
              <div className="text-xs text-faint">
                {p.player.position} · {p.player.latest_team}
              </div>
            </div>
            <button type="button" onClick={() => setIds(ids.filter((id) => id !== p.player.gsis_id))} className="ml-1 text-faint hover:text-ink" aria-label={`Remove ${p.player.display_name}`}>
              ×
            </button>
          </div>
        ))}
        {players.length < 4 && <AddPlayer onAdd={(id) => !ids.includes(id) && setIds([...ids, id])} />}
      </div>

      {players.length < 2 ? (
        <EmptyState title="Add players to compare">Search for up to four players, or pick them from a leaderboard with Compare.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="label px-5 py-3 text-left">Metric</th>
                {players.map((p) => (
                  <th key={p.player.gsis_id} className="px-4 py-3 text-right font-semibold">
                    {p.player.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metricKeys.map((key) => {
                const m = METRICS[key];
                const values = totals.map((t) => (t ? metricValue(key, t) : null));
                const valid = values.filter(Number.isFinite);
                const best = m.better && valid.length > 1 ? (m.better === 'low' ? Math.min(...valid) : Math.max(...valid)) : null;
                return (
                  <tr key={key} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-2.5 text-muted" title={m.description}>{m.label}</td>
                    {values.map((v, i) => (
                      <td key={ids[i]} className={`num px-4 py-2.5 text-right ${v === best ? 'font-bold text-good' : ''}`}>
                        {totals[i] ? (m.format === 'text' ? m.value(totals[i]) : formatValue(v, m.format)) : '–'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-faint">Best value in each row is highlighted. Players without games in {season} show dashes.</p>
    </>
  );
}

function AddPlayer({ onAdd }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      fetchJson(`/api/search?q=${encodeURIComponent(q.trim())}`).then((d) => setResults(d.players.slice(0, 6))).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ Add a player" className="control w-56" aria-label="Add a player to compare" />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-lg border border-line-strong bg-raised py-1 shadow-2xl">
          {results.map((p) => (
            <li key={p.gsis_id}>
              <button type="button" onClick={() => { onAdd(p.gsis_id); setQ(''); }} className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-line">
                <span>{p.display_name}</span>
                <span className="text-xs text-faint">{p.position}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
