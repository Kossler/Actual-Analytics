// Derived team metrics from the /api/teams payload.
const per = (num, den) => (den ? num / den : null);

export function teamMetrics(t) {
  const off = t.offense || {};
  const def = t.defense || {};
  const offEpa = per(off.epa, off.plays);
  const defEpa = per(def.epa, def.plays);
  const games = (t.wins || 0) + (t.losses || 0) + (t.ties || 0);
  return {
    ...t,
    games,
    off_epa: offEpa,
    def_epa: defEpa,
    net_epa: offEpa != null && defEpa != null ? offEpa - defEpa : null,
    pass_off_epa: per(off.pass_epa, off.pass_plays),
    rush_off_epa: per(off.rush_epa, off.rush_plays),
    pass_def_epa: per(def.pass_epa, def.pass_plays),
    rush_def_epa: per(def.rush_epa, def.rush_plays),
    off_success: per(off.success, off.plays),
    def_success: per(def.success, def.plays),
    point_diff: (t.points_for || 0) - (t.points_against || 0),
    turnover_diff: games ? ((def.turnovers || 0) - (off.turnovers || 0)) / games : null,
    win_pct: games ? ((t.wins || 0) + 0.5 * (t.ties || 0)) / games : null,
  };
}

export const SITUATIONS = [
  { value: 'all', label: 'All plays' },
  { value: 'early_downs', label: 'Early downs (1st & 2nd)' },
  { value: 'late_downs', label: 'Late downs (3rd & 4th)' },
  { value: 'red_zone', label: 'Red zone' },
  { value: 'neutral', label: 'Neutral script (20–80% WP)' },
];

// Rank among all teams; `better` decides direction. Returns 1-based rank.
export function rankOf(teams, key, team, better = 'high') {
  const v = team[key];
  if (v == null) return null;
  return teams.filter((t) => t[key] != null && (better === 'low' ? t[key] < v : t[key] > v)).length + 1;
}

export function divisionStanding(teams, team) {
  const division = teams.filter((t) => t.division === team.division);
  const sorted = [...division].sort((a, b) => (b.win_pct ?? 0) - (a.win_pct ?? 0) || b.point_diff - a.point_diff);
  return sorted.findIndex((t) => t.abbr === team.abbr) + 1;
}
