const crypto = require('crypto');
const zlib = require('zlib');
const prisma = require('./db');

// In-memory cache of successful JSON GET responses.
//
// The data only changes when the ingest runs (a few times a week), so responses are cached
// until the ingest bumps app_meta.data_version, which is polled every DATA_VERSION_POLL_MS.
// Concurrent misses for the same URL share one database query, and responses are stored
// pre-gzipped so cache hits skip both the query and compression.

const MAX_BYTES = Number(process.env.RESPONSE_CACHE_MAX_BYTES) || 64 * 1024 * 1024;
const VERSION_POLL_MS = Number(process.env.DATA_VERSION_POLL_MS) || 60 * 1000;
const GZIP_MIN_BYTES = 1024;

// Browsers revalidate (cheap 304 via ETag) after 5 minutes; shared caches such as a CDN keep
// responses for a day and are purged by the ingest workflow when new data lands.
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=86400';

const entries = new Map(); // url -> { body, gzipped, etag, bytes }; Map order doubles as LRU order
const inflight = new Map(); // url -> Promise<entry | null>
let totalBytes = 0;
let dataVersion = null;

function getEntry(key) {
  const entry = entries.get(key);
  if (!entry) return null;
  entries.delete(key);
  entries.set(key, entry);
  return entry;
}

function buildEntry(body) {
  const gzipped = body.length >= GZIP_MIN_BYTES ? zlib.gzipSync(body) : null;
  const hash = crypto.createHash('sha1').update(body).digest('base64url').slice(0, 27);
  return { body, gzipped, etag: `W/"${hash}"`, bytes: body.length + (gzipped ? gzipped.length : 0) };
}

function storeEntry(key, entry) {
  if (entry.bytes > MAX_BYTES / 4) return;

  const previous = entries.get(key);
  if (previous) {
    totalBytes -= previous.bytes;
    entries.delete(key);
  }
  entries.set(key, entry);
  totalBytes += entry.bytes;
  for (const [oldKey, oldEntry] of entries) {
    if (totalBytes <= MAX_BYTES) break;
    entries.delete(oldKey);
    totalBytes -= oldEntry.bytes;
  }
}

function clear() {
  entries.clear();
  totalBytes = 0;
}

function sendEntry(req, res, entry, status) {
  res.set('Cache-Control', CACHE_CONTROL);
  res.set('X-Cache', status);
  res.vary('Accept-Encoding');
  res.type('json');
  if (entry.gzipped && req.acceptsEncodings('gzip', 'identity') === 'gzip') {
    // Setting Content-Encoding makes the compression middleware pass the buffer through untouched.
    res.set('Content-Encoding', 'gzip');
    res.set('ETag', `${entry.etag.slice(0, -1)}-gz"`);
    return res.send(entry.gzipped);
  }
  res.set('ETag', entry.etag);
  return res.send(entry.body);
}

function responseCache(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const key = req.originalUrl;
  const hit = getEntry(key);
  if (hit) return sendEntry(req, res, hit, 'HIT');

  const pending = inflight.get(key);
  if (pending) {
    return pending.then((entry) => (entry ? sendEntry(req, res, entry, 'HIT') : next()));
  }

  let resolvePending;
  const pendingPromise = new Promise((resolve) => { resolvePending = resolve; });
  inflight.set(key, pendingPromise);
  const settle = (entry) => {
    if (inflight.get(key) === pendingPromise) inflight.delete(key);
    resolvePending(entry);
  };
  const versionAtStart = dataVersion;

  res.json = (payload) => {
    if (res.statusCode !== 200) {
      settle(null);
      res.set('Cache-Control', 'no-store');
      res.type('json');
      return res.send(JSON.stringify(payload));
    }
    const entry = buildEntry(JSON.stringify(payload));
    // Don't store a response computed from data that was replaced while the query ran.
    if (versionAtStart === dataVersion) storeEntry(key, entry);
    settle(entry);
    return sendEntry(req, res, entry, 'MISS');
  };
  res.on('close', () => settle(null));
  next();
}

async function readDataVersion() {
  const rows = await prisma.$queryRaw`SELECT value FROM app_meta WHERE key = 'data_version'`;
  return rows[0]?.value ?? null;
}

/**
 * Polls app_meta.data_version and clears the cache whenever it changes.
 * `onRefresh` runs after the first read and after every change (used to warm the cache).
 */
function startDataVersionWatcher(onRefresh) {
  let warnedMissingTable = false;
  const check = async () => {
    let version;
    try {
      version = await readDataVersion();
    } catch (err) {
      if (!warnedMissingTable) {
        console.warn('[cache] Could not read app_meta.data_version; responses cache until restart:', err.message);
        warnedMissingTable = true;
        if (onRefresh) onRefresh().catch((warmErr) => console.warn('[cache] Warm-up failed:', warmErr.message));
      }
      return;
    }
    if (version === dataVersion) return;
    // Responses cached while app_meta was unreadable (e.g. before migrations ran) may predate
    // the current schema, so the first successful read after a failure also clears them.
    const isFirstRead = dataVersion === null && !warnedMissingTable;
    dataVersion = version;
    warnedMissingTable = false;
    if (!isFirstRead) {
      console.log(`[cache] Data version changed to ${version}; clearing ${entries.size} cached responses`);
      clear();
    }
    if (onRefresh) onRefresh().catch((err) => console.warn('[cache] Warm-up failed:', err.message));
  };
  check();
  setInterval(check, VERSION_POLL_MS).unref();
}

function stats() {
  return { entries: entries.size, bytes: totalBytes, maxBytes: MAX_BYTES, dataVersion };
}

module.exports = { responseCache, startDataVersionWatcher, stats };
