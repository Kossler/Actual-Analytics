const prisma = require('./db');

// Fuzzy player search. Both predicates are served by players_display_name_trgm_idx:
// `%` is trigram similarity (threshold set at the database level, see the
// 20261004120000 migration) and ILIKE catches partial names such as "mah" -> Mahomes.
// Calling similarity() in WHERE instead would force a full table scan.
const SEARCH_QUERY = `
  SELECT p.display_name, p.position, p.gsis_id, p.pfr_id, p.latest_team, t.team_name,
         similarity(p.display_name, $1) AS name_similarity
  FROM players p
  LEFT JOIN teams t ON p.latest_team = t.team_abbr
  WHERE p.display_name % $1 OR p.display_name ILIKE $2
  ORDER BY name_similarity DESC, p.display_name ASC
  LIMIT 20
`;

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

async function searchPlayers(search) {
  return prisma.$queryRawUnsafe(SEARCH_QUERY, search, `%${escapeLike(search)}%`);
}

module.exports = { searchPlayers };
