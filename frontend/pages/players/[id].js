import PlayerPage from '../../components/PlayerPage';
import { fetchJson, loadProps, queryString } from '../../lib/api';
import { positionGroup } from '../../lib/metrics';
import { seasonsOf } from '../../lib/player';

export const runtime = 'experimental-edge';

export async function getServerSideProps({ params, query }) {
  const result = await loadProps({ data: `/api/players/${encodeURIComponent(params.id)}/page`, meta: '/api/meta' });
  if (result.notFound) return result;
  const { data, meta } = result.props;
  const group = positionGroup(data.player.position);
  const season = Number(query.season) || seasonsOf(data.games)[0];
  // The position leaderboard for the season provides ranks, shading and the comparison scatter.
  const board = ['QB', 'RB', 'WR', 'TE'].includes(group) && season
    ? await fetchJson(`/api/leaderboard/${group}${queryString({ season })}`).catch(() => null)
    : null;
  data.team = meta.teams.find((t) => t.abbr === data.player.latest_team) || null;
  return { props: { data, board } };
}

export default PlayerPage;
