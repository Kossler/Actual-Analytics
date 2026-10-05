import { useEffect, useState } from 'react';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class NotFoundError extends Error {}

export async function fetchJson(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`${path} failed with ${res.status}`);
  return res.json();
}

// Fetches several endpoints in parallel for getServerSideProps; a 404 on any of them becomes a
// Next.js not-found page.
export async function loadProps(requests) {
  try {
    const entries = await Promise.all(
      Object.entries(requests).map(async ([key, path]) => [key, path ? await fetchJson(path) : null])
    );
    return { props: Object.fromEntries(entries) };
  } catch (err) {
    if (err instanceof NotFoundError) return { notFound: true };
    throw err;
  }
}

export function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// Client-side fetch repeated every `intervalMs` (no caching); `intervalMs` null fetches once.
// Keeps the last good response through failed refreshes.
export function usePolling(path, intervalMs) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!path) {
      setData(null);
      return undefined;
    }
    let cancelled = false;
    let timer = null;
    const load = () =>
      fetchJson(path)
        .then((json) => !cancelled && setData(json))
        .catch(() => {})
        .finally(() => {
          if (!cancelled && intervalMs) timer = setTimeout(load, intervalMs);
        });
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, intervalMs]);
  return data;
}

// Client-side fetch with a small in-memory cache, for data loaded after the first render.
const cache = new Map();

export function useApi(path) {
  const [state, setState] = useState(() =>
    path && cache.has(path) ? { data: cache.get(path), loading: false, error: null } : { data: null, loading: !!path, error: null }
  );
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    if (cache.has(path)) {
      setState({ data: cache.get(path), loading: false, error: null });
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchJson(path)
      .then((data) => {
        cache.set(path, data);
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state;
}
