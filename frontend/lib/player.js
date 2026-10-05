import { aggregate } from './metrics';

export const isRegular = (g) => g.season_type === 'REG';

export function seasonsOf(games) {
  return [...new Set(games.filter(isRegular).map((g) => g.season))].sort((a, b) => b - a);
}

export function seasonGames(games, season, { playoffs = false } = {}) {
  return games.filter((g) => g.season === season && (playoffs || isRegular(g)));
}

export function gameResult(g) {
  if (g.home_score == null || g.away_score == null) return null;
  const home = g.team === g.home_team;
  const pf = home ? g.home_score : g.away_score;
  const pa = home ? g.away_score : g.home_score;
  return { home, pf, pa, outcome: pf > pa ? 'W' : pf < pa ? 'L' : 'T' };
}

export function opponentLabel(g) {
  const result = gameResult(g);
  const home = result ? result.home : g.team === g.home_team;
  return `${home ? 'vs' : '@'} ${g.opponent || ''}`.trim();
}

const SPLITS = [
  { key: 'home', label: 'Home', test: (g) => gameResult(g)?.home === true },
  { key: 'away', label: 'Away', test: (g) => gameResult(g)?.home === false },
  { key: 'wins', label: 'Wins', test: (g) => gameResult(g)?.outcome === 'W' },
  { key: 'losses', label: 'Losses', test: (g) => gameResult(g)?.outcome === 'L' },
  { key: 'indoors', label: 'Dome / closed roof', test: (g) => g.roof === 'dome' || g.roof === 'closed' },
  { key: 'outdoors', label: 'Outdoors / open roof', test: (g) => g.roof === 'outdoors' || g.roof === 'open' },
  { key: 'early', label: 'Weeks 1–9', test: (g) => g.week <= 9 },
  { key: 'late', label: 'Weeks 10+', test: (g) => g.week >= 10 },
];

export function splitRows(games) {
  return SPLITS.map((s) => {
    const subset = games.filter(s.test);
    return { key: s.key, label: s.label, ...aggregate(subset), games: subset.length };
  }).filter((r) => r.games > 0);
}

// Next Gen Stats per season: the NFL's season row (week 0) when present, else volume-weighted weeks.
export function ngsBySeason(ngs) {
  const out = new Map();
  const weighted = ['time_to_throw', 'aggressiveness', 'intended_air_yards', 'completed_air_yards', 'cpoe_ngs', 'stacked_box_pct', 'separation', 'cushion', 'yac_over_expected'];
  const bySeasonKind = new Map();
  for (const r of ngs) {
    if (r.week > 18) continue; // postseason
    const key = `${r.season}|${r.kind}`;
    if (!bySeasonKind.has(key)) bySeasonKind.set(key, []);
    bySeasonKind.get(key).push(r);
  }
  for (const [key, rows] of bySeasonKind) {
    const season = Number(key.split('|')[0]);
    const seasonRow = rows.find((r) => r.week === 0);
    const weekly = rows.filter((r) => r.week > 0);
    const entry = out.get(season) || { season };
    if (seasonRow) {
      for (const [k, v] of Object.entries(seasonRow)) if (typeof v === 'number' && !['season', 'week'].includes(k)) entry[k] = v;
    } else if (weekly.length) {
      const volume = weekly.reduce((s, r) => s + (r.volume || 0), 0);
      for (const f of weighted) {
        const valid = weekly.filter((r) => typeof r[f] === 'number');
        if (valid.length && volume) entry[f] = valid.reduce((s, r) => s + r[f] * (r.volume || 0), 0) / volume;
      }
      const ryoe = weekly.filter((r) => typeof r.ryoe === 'number');
      if (ryoe.length) {
        entry.ryoe = ryoe.reduce((s, r) => s + r.ryoe, 0);
        const att = ryoe.reduce((s, r) => s + (r.volume || 0), 0);
        entry.ryoe_per_att = att ? entry.ryoe / att : null;
      }
    }
    out.set(season, entry);
  }
  return out;
}

const PLAYOFF_ROUND = { WC: 'WC', DIV: 'DIV', CON: 'CONF', SB: 'SB' };

export function gameLabel(g) {
  return PLAYOFF_ROUND[g.game_type] || `Wk ${g.week}`;
}
