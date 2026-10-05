// localStorage helpers that never throw (private windows and blocked storage just return defaults).

export function readStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable; the preference just won't persist.
  }
}

const RECENT_KEY = 'sla:recent-players';

export function rememberPlayer(player) {
  if (!player?.gsis_id) return;
  const entry = { id: player.gsis_id, name: player.display_name, position: player.position };
  const list = readStorage(RECENT_KEY, []).filter((p) => p.id !== entry.id);
  writeStorage(RECENT_KEY, [entry, ...list].slice(0, 6));
}

export function recentPlayers() {
  return readStorage(RECENT_KEY, []);
}

const TEAM_KEY = 'sla:recent-team';

export function rememberTeam(abbr) {
  writeStorage(TEAM_KEY, abbr);
}

export function recentTeam() {
  return readStorage(TEAM_KEY, null);
}

export function downloadCsv(filename, header, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
