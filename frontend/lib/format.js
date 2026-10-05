const MINUS = '−';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function fixed(v, digits = 1) {
  if (!isNum(v)) return '–';
  const s = Math.abs(v).toFixed(digits);
  return v < 0 && Number(s) !== 0 ? `${MINUS}${s}` : s;
}

// Signed numbers use a true minus sign and an explicit plus, as in the design (+0.39, −0.12).
export function signed(v, digits = 2) {
  if (!isNum(v)) return '–';
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return s;
  return `${v < 0 ? MINUS : '+'}${s}`;
}

export function int(v) {
  if (!isNum(v)) return '–';
  const rounded = Math.round(v);
  return `${rounded < 0 ? MINUS : ''}${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function signedInt(v) {
  if (!isNum(v)) return '–';
  const rounded = Math.round(v);
  return rounded === 0 ? '0' : `${rounded < 0 ? MINUS : '+'}${Math.abs(rounded).toLocaleString('en-US')}`;
}

// Rates stored as 0-1 shown as percentages without the % sign (45.9), matching table cells.
export function pct(v, digits = 1) {
  return isNum(v) ? fixed(v * 100, digits) : '–';
}

export function pctLabel(v, digits = 0) {
  return isNum(v) ? `${(v * 100).toFixed(digits)}%` : '–';
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function record(w = 0, l = 0, t = 0) {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

export function height(inches) {
  if (!isNum(inches) || inches <= 0) return null;
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;
}

export function money(millions) {
  if (!isNum(millions)) return '–';
  if (millions === 0) return '$0';
  if (millions >= 100) return `$${Math.round(millions)}M`;
  if (millions >= 1) return `$${Number(millions.toFixed(1)).toString()}M`;
  return `$${Math.round(millions * 1000)}K`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function shortName(name = '') {
  const parts = name.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}

export function weekLabel(week, gameType) {
  const playoff = { WC: 'Wild Card', DIV: 'Divisional', CON: 'Conference', SB: 'Super Bowl' };
  if (gameType && playoff[gameType]) return playoff[gameType];
  return `Week ${week}`;
}

export function shortWeekLabel(week, gameType) {
  const playoff = { WC: 'WC', DIV: 'Div', CON: 'Conf', SB: 'SB' };
  if (gameType && playoff[gameType]) return playoff[gameType];
  return `Wk ${week}`;
}

export function formatValue(v, format) {
  switch (format) {
    case 'int':
      return int(v);
    case 'signedInt':
      return signedInt(v);
    case 'dec1':
      return fixed(v, 1);
    case 'dec2':
      return fixed(v, 2);
    case 'signed1':
      return signed(v, 1);
    case 'signed2':
      return signed(v, 2);
    case 'pct':
      return pct(v, 1);
    case 'pct0':
      return pct(v, 0);
    case 'signedPct':
      // Percentage points with a sign (+4.2), for rates relative to an expectation.
      return isNum(v) ? signed(v * 100, 1) : '–';
    default:
      return isNum(v) ? String(v) : v ?? '–';
  }
}
