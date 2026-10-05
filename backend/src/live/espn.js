// Live game data from ESPN's public site API (unofficial and undocumented; no key required).
// Any replacement provider only needs to implement fetchScoreboard() and fetchPlays() with the same
// normalized shapes.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

// ESPN abbreviations that differ from nflverse's.
const TEAM = { WSH: 'WAS', LAR: 'LA' };
const team = (abbr) => TEAM[abbr] || abbr;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'SecondLevelAnalytics/1.0' } });
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`);
  return res.json();
}

// "BUF 33" with BUF on offense -> 67 yards to the end zone; "50" -> 50.
function yardsToEndzone(possessionText, offense) {
  const m = String(possessionText || '').trim().match(/^([A-Z]{2,3})?\s*(\d+)$/);
  if (!m) return null;
  const yard = Number(m[2]);
  if (!m[1] || yard === 50) return 50;
  return team(m[1]) === offense ? 100 - yard : yard;
}

function secondsLeft(period, clockSeconds) {
  if (period >= 5) return clockSeconds; // overtime: what is left of the overtime period
  return Math.max(0, (4 - period) * 900 + clockSeconds);
}

/**
 * Normalized games: { espnId, kickoff, state: 'pre'|'in'|'post', detail, period, clock, secondsLeft, home, away,
 * homeScore, awayScore, possession, down, distance, yardsToEndzone, homeTimeouts, awayTimeouts,
 * downDistance, redZone, lastPlay, lastPlayId }
 */
async function fetchScoreboard() {
  const data = await getJson(`${BASE}/scoreboard`);
  return (data.events || []).map((event) => {
    const comp = event.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home');
    const away = comp.competitors.find((c) => c.homeAway === 'away');
    const ids = { [home.team.id]: team(home.team.abbreviation), [away.team.id]: team(away.team.abbreviation) };
    const status = comp.status || event.status;
    const sit = comp.situation || {};
    const possession = sit.possession ? ids[sit.possession] : null;
    const period = status.period || 0;
    return {
      espnId: String(event.id),
      kickoff: event.date,
      state: status.type.state,
      detail: status.type.shortDetail,
      period,
      clock: status.displayClock,
      secondsLeft: secondsLeft(period, Number(status.clock || 0)),
      home: team(home.team.abbreviation),
      away: team(away.team.abbreviation),
      homeScore: Number(home.score || 0),
      awayScore: Number(away.score || 0),
      possession,
      down: sit.down > 0 ? sit.down : null,
      distance: sit.distance ?? null,
      yardsToEndzone: possession ? yardsToEndzone(sit.possessionText, possession) : null,
      homeTimeouts: sit.homeTimeouts ?? null,
      awayTimeouts: sit.awayTimeouts ?? null,
      downDistance: sit.downDistanceText || null,
      redZone: !!sit.isRedZone,
      lastPlay: sit.lastPlay?.text || null,
      lastPlayId: sit.lastPlay?.id || null,
    };
  });
}

const NOT_PLAYS = /timeout|two-minute warning|end period|end of (half|game|regulation)|coin toss/i;

function clockToSeconds(display) {
  const [m, s] = String(display || '0:00').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

/**
 * Every play so far with the state at the snap (scores before the play), for backfilling the
 * win-probability chart: [{ id, period, clock, secondsLeft, homeScore, awayScore, possession, down,
 * distance, yardsToEndzone, text }]
 */
async function fetchPlays(espnId) {
  return (await fetchSummary(espnId)).plays;
}

// One game from the summary endpoint: { game (scoreboard shape, without the live situation), plays }.
async function fetchSummary(espnId) {
  const data = await getJson(`${BASE}/summary?event=${espnId}`);
  const comp = data.header?.competitions?.[0];
  const ids = {};
  for (const c of comp?.competitors || []) ids[c.team.id] = team(c.team.abbreviation);
  const plays = [];
  let homeScore = 0;
  let awayScore = 0;
  const teams = Object.values(ids);
  for (const drive of data.drives?.previous || []) {
    for (const p of drive.plays || []) {
      const type = p.type?.text || '';
      const scoreBefore = { homeScore, awayScore };
      homeScore = p.homeScore ?? homeScore;
      awayScore = p.awayScore ?? awayScore;
      // Timeouts, the two-minute warning and period ends carry no field position.
      if (NOT_PLAYS.test(type)) continue;
      const period = p.period?.number || 1;
      let offense = ids[p.start?.team?.id] || ids[drive.team?.id] || null;
      let yards = p.start?.yardsToEndzone ?? null;
      // ESPN credits kickoffs to the kicking team at its own 35; nflverse (and so the model) to the
      // receiving team with yardline_100 = 35.
      const kickoff = /kickoff/i.test(type);
      if (kickoff && offense) {
        offense = teams.find((t) => t !== offense) || null;
        yards = yards != null ? 100 - yards : 35;
      }
      plays.push({
        id: String(p.id),
        period,
        clock: p.clock?.displayValue,
        secondsLeft: secondsLeft(period, clockToSeconds(p.clock?.displayValue)),
        ...scoreBefore,
        possession: offense,
        down: !kickoff && p.start?.down > 0 ? p.start.down : null,
        distance: kickoff ? null : p.start?.distance ?? null,
        yardsToEndzone: yards,
        text: p.text,
      });
    }
  }
  const home = comp?.competitors?.find((c) => c.homeAway === 'home');
  const away = comp?.competitors?.find((c) => c.homeAway === 'away');
  const status = comp?.status || {};
  const game = home && away ? {
    espnId: String(espnId), kickoff: comp.date, state: status.type?.state, detail: status.type?.shortDetail,
    home: team(home.team.abbreviation), away: team(away.team.abbreviation),
    homeScore: Number(home.score || 0), awayScore: Number(away.score || 0),
  } : null;
  return { game, plays };
}

module.exports = { fetchScoreboard, fetchPlays, fetchSummary, name: 'espn' };
