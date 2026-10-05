import { BRAND } from './brand';

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

// ---- Matchup colours ----------------------------------------------------------------------------
// Team colours for two-team visuals (probability bars, charts), adjusted for the dark background:
// black or grey primaries fall back to the secondary colour, dark colours are lightened until they
// show, and when both teams come out alike the away team switches to its other colour.

const FALLBACK = { away: BRAND.red, home: BRAND.blue };

function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

function toHsl([r, g, b]) {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// Lighten dark colours until they stand out on the page background, keeping hue and saturation
// (mixing toward white would turn navy into grey).
function visible(c) {
  if (luminance(c) >= 0.09) return c;
  const [h, s, l] = toHsl(c);
  let out = c;
  for (let light = l; light <= 0.75 && luminance(out) < 0.09; light += 0.04) out = fromHsl([h, Math.min(s, 0.85), light]);
  return out;
}

// Perceptual colour difference (CIE76 delta E in Lab space): about 2 is just noticeable; below
// ~35 two colours are easy to confuse in a thin bar.
function lab(c) {
  const lin = c.map((v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const [x, y, z] = [[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]
    .map((row) => row.reduce((sum, k, i) => sum + k * lin[i], 0));
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [x / 0.95047, y, z / 1.08883].map(f);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const deltaE = (a, b) => {
  const [la, lb] = [lab(a), lab(b)];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
};

const DISTINCT = 35;
const isGrey = (c) => saturation(c) < 0.15;

// A team's primary and secondary colours, made visible. Black or grey primaries swap with the
// secondary (Steelers gold, not black).
function options(team) {
  const primary = rgb(team?.color);
  const secondary = rgb(team?.color2);
  const list = [primary, secondary].filter(Boolean);
  if (primary && isGrey(primary) && secondary) list.reverse();
  return list.map(visible);
}

/** { away, home } colours for a matchup, given team rows with color / color2. Uses both teams'
 *  primary colours unless they are too alike; then the away team's secondary, the home team's
 *  secondary, or both, whichever is first to be clearly distinct (greys from black or silver
 *  secondaries are a last resort). If nothing is distinct, the most different pair wins. */
export function matchupColors(awayTeam, homeTeam) {
  const [homePrimary, homeSecondary] = options(homeTeam);
  const [awayPrimary, awaySecondary] = options(awayTeam);
  if (!homePrimary || !awayPrimary) return FALLBACK;
  const combos = [
    [awayPrimary, homePrimary],
    [awaySecondary, homePrimary],
    [awayPrimary, homeSecondary],
    [awaySecondary, homeSecondary],
  ].filter(([a, h]) => a && h);
  const clear = combos.find(([a, h], i) => deltaE(a, h) >= DISTINCT && (i === 0 || (!isGrey(a) && !isGrey(h))));
  const [away, home] = clear || combos.reduce((best, c) => (deltaE(c[0], c[1]) > deltaE(best[0], best[1]) ? c : best));
  return { away: toHex(away), home: toHex(home) };
}
