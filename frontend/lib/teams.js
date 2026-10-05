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
    ...advancedMetrics(t, games),
  };
}

// NFL Pythagorean exponent (Football Outsiders' fit).
const PYTHAG_EXPONENT = 2.37;

// Season stats from team_game_adv (all plays, regardless of the situation filter).
function advancedMetrics(t, games) {
  const o = t.adv?.off;
  const d = t.adv?.def;
  if (!o || !d) return {};
  const pf = t.points_for || 0;
  const pa = t.points_against || 0;
  const pythag = games && pf + pa ? (games * pf ** PYTHAG_EXPONENT) / (pf ** PYTHAG_EXPONENT + pa ** PYTHAG_EXPONENT) : null;
  const wins = (t.wins || 0) + 0.5 * (t.ties || 0);
  // FTN charting starts in 2022; earlier seasons have no charted plays.
  const charted = (side, value) => (side.charted_plays ? value : null);
  return {
    // Drives
    ppd: per(o.drive_points, o.drives),
    def_ppd: per(d.drive_points, d.drives),
    scoring_drive_pct: per(o.scoring_drives, o.drives),
    def_scoring_drive_pct: per(d.scoring_drives, d.drives),
    three_out_pct: per(o.three_and_outs, o.drives),
    def_three_out_pct: per(d.three_and_outs, d.drives),
    rz_td_pct: per(o.red_zone_tds, o.red_zone_trips),
    def_rz_td_pct: per(d.red_zone_tds, d.red_zone_trips),
    giveaway_drive_pct: per(o.turnover_drives, o.drives),
    takeaway_drive_pct: per(d.turnover_drives, d.drives),
    // Big plays
    explosive_pct: per(o.explosive, o.plays),
    def_explosive_pct: per(d.explosive, d.plays),
    stuffed_pct: per(o.stuffed, o.rushes),
    def_stuff_pct: per(d.stuffed, d.rushes),
    // Style
    proe: o.neutral_plays ? (o.neutral_passes - o.neutral_xpass) / o.neutral_plays : null,
    early_pass_pct: per(o.neutral_early_passes, o.neutral_early),
    sec_per_play: per(o.drive_seconds, o.drive_plays),
    shotgun_pct: per(o.shotgun, o.plays),
    no_huddle_pct: per(o.no_huddle, o.plays),
    motion_pct: charted(o, per(o.motion, o.charted_plays)),
    play_action_pct: charted(o, per(o.play_action, o.charted_dropbacks)),
    blitz_pct: charted(d, per(d.blitzes, d.charted_dropbacks)),
    fourth_go_pct: per(o.fourth_short_go, o.fourth_short),
    fourth_conv_pct: per(o.fourth_conv, o.fourth_go),
    // Luck and special teams
    pythag_wins: pythag,
    wins_over_pythag: pythag == null ? null : wins - pythag,
    fumble_recovery_pct: per(o.fumbles - o.fumbles_lost + d.fumbles_lost, o.fumbles + d.fumbles),
    int_per_worthy: charted(o, per(o.interceptions, o.int_worthy)),
    def_int_per_worthy: charted(d, per(d.interceptions, d.int_worthy)),
    st_epa_pg: games ? (o.st_epa + d.st_epa) / games : null,
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
