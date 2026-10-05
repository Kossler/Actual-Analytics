# Frontend architecture

Next.js (pages router) styled with Tailwind, deployed to Cloudflare Pages. Data pages render on
the edge (`export const runtime = 'experimental-edge'`) with `getServerSideProps`, calling the
backend API at `NEXT_PUBLIC_API_URL`. Charts are small hand-written SVG components; there is no UI
or charting library.

## Pages

| Route | File | Data |
| --- | --- | --- |
| `/`, `/players` | `components/LeaderboardPage.js` | `/api/meta`, `/api/leaderboard/:pos` |
| `/players/[id]` | `components/PlayerPage.js` | `/api/players/:id/page` + the season leaderboard (ranks, shading, scatter) |
| `/compare` | `pages/compare.js` | one `/api/players/:id/page` per player |
| `/teams` | `pages/teams/index.js` | `/api/teams` |
| `/teams/[abbr]` | `pages/teams/[abbr].js` | `/api/teams/:abbr` |
| `/games` | `pages/games.js` | `/api/games`, `/api/games/:gameId` |
| `/predictive-models` | `pages/predictive-models.js` | `/api/models/win-probability`, `/projections`, `/regression-lab` |
| `/glossary` | `pages/glossary.js` | none (built from `lib/metrics.js`) |

State that changes the data (season, weeks, position, tab, selected game) lives in the URL, so
views are shareable and render fully on the server. Purely visual state (sorting, column sets,
minimum volume, team filter) stays in React state.

## Where things live

- `lib/metrics.js` — every metric: how it's computed from summed totals, format, which direction is
  good, and its definition. Tables, cards, tooltips, comparisons and the glossary all read from it.
  To add a metric, add it here, then reference its key in `lib/positions.js`.
- `lib/positions.js` — per-position layout: leaderboard column sets, leader cards, the qualification
  threshold, and the player page's cards, charts, game log and career columns.
- `lib/player.js`, `lib/teams.js` — derived player/team data (seasons, splits, Next Gen Stats by
  season, team EPA rates, ranks).
- `lib/format.js` — number formatting (true minus signs, signed values, percentages).
- `lib/api.js` — `loadProps` for `getServerSideProps`, `useApi` for client-side fetches.
- `lib/storage.js` — localStorage helpers (recently viewed, custom columns) and CSV export.
- `components/DataTable.js` — grouped headers, sorting, above/below-average shading, header
  definitions, totals rows, sticky first column.
- `components/ui.js` — cards, page headers, tabs, segmented controls, fields, team tags.
- `components/charts/` — scatter, bar, win-probability and calibration charts.

## Conventions

- Shading compares a value with the qualifying group's average: blue is better, orange worse, with
  intensity from the z-score (`shadeStyle` in `lib/metrics.js`).
- Rates are always computed from summed totals (never by averaging per-game rates), so season,
  career and split rows weight games by volume.
- Colors and fonts are Tailwind tokens in `tailwind.config.js` (`page`, `surface`, `line`, `ink`,
  `muted`, `faint`, `brand`, `good`, `bad`); headings use the wide Archivo display face.
