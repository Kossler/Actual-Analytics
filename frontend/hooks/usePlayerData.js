import { useState, useEffect } from 'react';

/**
 * Custom hook to fetch all players
 * @param {string} apiUrl - Base API URL
 * @returns {object} { players, loading, error }
 */
export function useAllPlayers(apiUrl) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiUrl) return;

    fetch(`${apiUrl}/api/players`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch players');
        return r.json();
      })
      .then(data => {
        setPlayers(data);
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching players:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [apiUrl]);

  return { players, loading, error };
}

/**
 * Custom hook to fetch player stats
 * @param {number|null} playerId - Player ID
 * @param {string} apiUrl - Base API URL
 * @returns {object} { stats, loading, error, refetch }
 */
export function usePlayerStats(playerId, apiUrl) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = () => {
    if (!playerId || !apiUrl) return;

    setLoading(true);
    fetch(`${apiUrl}/api/players/${playerId}/stats`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch player stats');
        return r.json();
      })
      .then(data => {
        setStats(data);
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching player stats:', err);
        setError(err.message);
        setStats([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, [playerId, apiUrl]);

  return { stats, loading, error, refetch: fetchStats };
}

/**
 * Custom hook to fetch weekly stats for current season
 * @param {number|null} playerId - Player ID
 * @param {string} apiUrl - Base API URL
 * @param {number} season - Season year (default: 2025)
 * @returns {object} { weeklyStats, loading, error }
 */
export function useWeeklyStats(playerId, apiUrl, season = 2025) {
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId || !apiUrl) return;

    setLoading(true);
    fetch(`${apiUrl}/api/players/${playerId}/stats?season=${season}`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch weekly stats');
        return r.json();
      })
      .then(data => {
        setWeeklyStats(data);
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching weekly stats:', err);
        setError(err.message);
        setWeeklyStats([]);
      })
      .finally(() => setLoading(false));
  }, [playerId, apiUrl, season]);

  return { weeklyStats, loading, error };
}

/**
 * Custom hook to fetch player medians
 * @param {number|null} playerId - Player ID
 * @param {string} apiUrl - Base API URL
 * @returns {object} { medians, loading, error }
 */
export function usePlayerMedians(playerId, apiUrl) {
  const [medians, setMedians] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId || !apiUrl) return;

    setLoading(true);
    fetch(`${apiUrl}/api/players/${playerId}/medians`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch player medians');
        return r.json();
      })
      .then(data => {
        setMedians(data.sort((a, b) => b.season - a.season));
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching player medians:', err);
        setError(err.message);
        setMedians([]);
      })
      .finally(() => setLoading(false));
  }, [playerId, apiUrl]);

  return { medians, loading, error };
}

/**
 * Custom hook to fetch advanced metrics
 * @param {number|null} playerId - Player ID
 * @param {string} apiUrl - Base API URL
 * @returns {object} { advancedMetrics, loading, error }
 */
export function useAdvancedMetrics(playerId, apiUrl) {
  const [advancedMetrics, setAdvancedMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId || !apiUrl) return;

    setLoading(true);
    fetch(`${apiUrl}/api/players/${playerId}/advanced`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch advanced metrics');
        return r.json();
      })
      .then(data => {
        setAdvancedMetrics(data.sort((a, b) => b.season - a.season));
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching advanced metrics:', err);
        setError(err.message);
        setAdvancedMetrics([]);
      })
      .finally(() => setLoading(false));
  }, [playerId, apiUrl]);

  return { advancedMetrics, loading, error };
}

/**
 * Custom hook to manage background image
 * @param {number} specialChance - Probability (0-1) of showing special background
 * @returns {string} CSS background string
 */
export function useBackgroundImage(specialChance = 0.01) {
  const [backgroundImage, setBackgroundImage] = useState('url("/Background.webp")');

  useEffect(() => {
    const isSpecial = Math.random() < specialChance;
    if (isSpecial) {
      setBackgroundImage('url("/yfbubuixmemvpeokmect.png")');
    }
  }, [specialChance]);

  return backgroundImage;
}

/**
 * Custom hook to fetch all players' aggregated stats for a season
 * @param {string} apiUrl - Base API URL
 * @param {number} season - Season year
 * @returns {Object} { allStats: [], loading: boolean, error: string|null }
 */
export function useAllPlayerStats(apiUrl, season) {
  const [allStats, setAllStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiUrl || !season) return;

    setLoading(true);
    fetch(`${apiUrl}/api/players/season/${season}/all-stats`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch all player stats');
        return r.json();
      })
      .then(data => {
        setAllStats(data);
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching all player stats:', err);
        setError(err.message);
        setAllStats([]);
      })
      .finally(() => setLoading(false));
  }, [apiUrl, season]);

  return { allStats, loading, error };
}

/**
 * Custom hook to fetch available years from the database
 * @param {string} apiUrl - Base API URL
 * @returns {Object} { availableYears: [], loading: boolean, error: string|null }
 */
export function useAvailableYears(apiUrl) {
  const [availableYears, setAvailableYears] = useState([2025]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiUrl) return;

    setLoading(true);
    fetch(`${apiUrl}/api/players/available-years`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch available years');
        return r.json();
      })
      .then(data => {
        setAvailableYears(data.length > 0 ? data : [2025]);
        setError(null);
      })
      .catch(err => {
        console.error('Error fetching available years:', err);
        setError(err.message);
        setAvailableYears([2025]);
      })
      .finally(() => setLoading(false));
  }, [apiUrl]);

  return { availableYears, loading, error };
}
