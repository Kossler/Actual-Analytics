import { useState, useEffect } from 'react';

/**
 * Custom hook to fetch players matching a search query with debounce and client-side filter
 * @param {string} apiUrl - Base API URL
 * @param {string} query - Search query
 * @returns {object} { players, loading, error }
 */
export function usePlayerSearch(apiUrl, query) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  useEffect(() => {
    if (!apiUrl || !debouncedQuery) {
      setPlayers([]);
      return;
    }
    setLoading(true);
    fetch(`${apiUrl}/api/players/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch players');
        return r.json();
      })
      .then(data => {
        // Client-side filter for display_name match
        const filtered = data.filter(p =>
          p.display_name && p.display_name.toLowerCase().includes(debouncedQuery.toLowerCase())
        );
        setPlayers(filtered);
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching players:', err);
        setError(err.message);
        setPlayers([]);
      })
      .finally(() => setLoading(false));
  }, [apiUrl, debouncedQuery]);

  return { players, loading, error };
}
