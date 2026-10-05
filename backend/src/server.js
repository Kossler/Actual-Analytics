require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');

const playersRouter = require('./routes/players');
const apiRouter = require('./routes/api');
const siteRouter = require('./routes/site');
const { responseCache, startDataVersionWatcher, stats: cacheStats } = require('./responseCache');
const live = require('./live/service');

const app = express();
// Disable X-Powered-By header for security
app.disable('x-powered-by');
app.use(compression());

// The API serves public, read-only data and the frontend never sends credentials, so allow any
// origin. A fixed `*` (rather than echoing an allowlisted Origin) also keeps responses safe to
// share through a CDN cache, which ignores `Vary: Origin`.
app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), cache: cacheStats() });
});

// Live games change every few seconds; serve them before the response cache.
app.use('/api/live', live.router);

// Cache every data response except predictions (computed per request, not from ingested data).
app.use((req, res, next) => (req.path.startsWith('/predict/') ? next() : responseCache(req, res, next)));

app.use('/api', siteRouter);
app.use('/api/players', playersRouter);
app.use('/', apiRouter);


const port = process.env.PORT || 4000;
app.listen(port, () => {
  startDataVersionWatcher(() => Promise.all([warmCache(port), live.refresh()]));
  live.start();
});

// Prefetch the most expensive, most shared responses so the first visitors after a deploy or
// an ingest don't pay for them.
async function warmCache(port) {
  const base = `http://127.0.0.1:${port}`;
  const get = (path) => fetch(base + path).then((r) => (r.ok ? r.json() : null));
  const [years] = await Promise.all([get('/api/players/available-years'), get('/playerstats/home')]);
  const recentSeasons = Array.isArray(years) ? years.slice(0, 2) : [];
  await Promise.all(recentSeasons.map((season) => get(`/api/players/season/${season}/all-stats`)));
}
