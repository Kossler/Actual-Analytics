/**
 * Utility functions for stat calculations and formatting
 */

/**
 * Format a number to a fixed decimal precision
 * @param {number} value - The number to format
 * @param {number} precision - Number of decimal places (default: 1)
 * @returns {string} Formatted number or '-' if invalid
 */
export function formatNumber(value, precision = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return Number(value).toFixed(precision);
}

/**
 * Format a percentage value
 * @param {number} value - The percentage value (0-100)
 * @param {number} precision - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage or '-' if invalid
 */
export function formatPercentage(value, precision = 1) {
  if (value === null || value === undefined || isNaN(value)) {
    return '-';
  }
  return `${Number(value).toFixed(precision)}%`;
}

/**
 * Calculate completion percentage
 * @param {number} completions - Number of completions
 * @param {number} attempts - Number of attempts
 * @returns {string} Formatted percentage or '-' if invalid
 */
export function calculateCompletionPercentage(completions, attempts) {
  if (!completions || !attempts || attempts === 0) {
    return '-';
  }
  return formatPercentage((completions / attempts) * 100, 1);
}

/**
 * Format yards with comma separators for large numbers
 * @param {number} yards - Number of yards
 * @returns {string} Formatted yards or '-' if invalid
 */
export function formatYards(yards) {
  if (!yards || yards === 0) {
    return '-';
  }
  return yards.toLocaleString();
}

/**
 * Display stat value or '-' if zero/null
 * @param {number} value - The stat value
 * @param {boolean} allowZero - Whether to display 0 or show '-' (default: false)
 * @returns {string|number} The value or '-'
 */
export function displayStat(value, allowZero = false) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  // Accept string numbers and 0
  if (typeof value === 'string') {
    if (value.trim() === '') return '-';
    const num = Number(value);
    if (!isNaN(num)) return num;
    return '-';
  }
  if (typeof value === 'number') {
    if (!isNaN(value)) return value;
    return '-';
  }
  return '-';
}

/**
 * Format EPA value with color indication
 * @param {number} epa - EPA value
 * @returns {object} Object with formatted value and color
 */
export function formatEPA(epa) {
  if (epa === null || epa === undefined || isNaN(epa)) {
    return { value: '-', color: 'inherit' };
  }
  
  const value = Number(epa).toFixed(1);
  let color = 'inherit';
  
  if (epa > 0) {
    color = '#4caf50'; // Green for positive
  } else if (epa < 0) {
    color = '#ef5350'; // Red for negative
  }
  
  return { value, color };
}

/**
 * Determine if receiving columns should be shown based on position
 * @param {string} position - Player position (QB, RB, WR, TE)
 * @returns {boolean} Whether to show receiving columns
 */
export function shouldShowReceivingColumns(position) {
  return position !== 'QB';
}

/**
 * Determine if rushing columns should be shown based on position and stats
 * @param {string} position - Player position
 * @param {Array} stats - Array of stat objects
 * @returns {boolean} Whether to show rushing columns
 */
export function shouldShowRushingColumns(position, stats = []) {
  if (position === 'QB') {
    // For QBs, only show if they have rushing production.
    // Our API returns `carries` (not `rushing_attempts`).
    const yearsWithRushing = stats.filter(s => (s.carries || 0) > 0).length;
    return yearsWithRushing > 0;
  }
  return true; // Show for all other positions
}

/**
 * Determine if passing columns should be shown based on position
 * @param {string} position - Player position
 * @returns {boolean} Whether to show passing columns
 */
export function shouldShowPassingColumns(position) {
  return position === 'QB';
}

/**
 * Group stats by season
 * @param {Array} stats - Array of GameStat objects
 * @returns {Array} Array of aggregated yearly stats
 */
export function groupStatsBySeason(stats) {
  const grouped = Object.create(null); // Prevent prototype pollution
  
  stats.forEach(stat => {
    const season = String(stat.season);
    // Validate season key to prevent prototype pollution
    if (!season || season === '__proto__' || season === 'constructor' || season === 'prototype') {
      return;
    }
    if (!grouped[season]) {
      grouped[season] = {
        season: stat.season,
        game_count: 0,
        completions: 0,
        attempts: 0,
        passing_yards: 0,
        passing_tds: 0,
        passing_interceptions: 0,
        sacks_suffered: 0,
        passing_epa: 0,
        passing_cpoe: 0,
        carries: 0,
        rushing_yards: 0,
        rushing_tds: 0,
        rushing_epa: 0,
        receptions: 0,
        targets: 0,
        receiving_yards: 0,
        receiving: 0,
        receiving_epa: 0,
        target_share: 0,
        passing_attempts: 0,
        receiving_tds: 0,
        // Defensive fields
        def_tackles_solo: 0,
        def_tackle_assists: 0,
        def_sacks: 0,
        def_interceptions: 0,
        fumble_recovery_own: 0,
        fumble_recovery_opp: 0,
        def_tds: 0,
      };
    }
    // Aggregate all relevant fields
    grouped[season].game_count += stat.game_count || 0;
    grouped[season].completions += stat.completions || 0;
    grouped[season].attempts += stat.attempts || 0;
    grouped[season].passing_yards += stat.passing_yards || 0;
    grouped[season].passing_tds += stat.passing_tds || 0;
    grouped[season].passing_interceptions += stat.passing_interceptions || 0;
    grouped[season].sacks_suffered += stat.sacks_suffered || 0;
    grouped[season].passing_epa += stat.passing_epa || 0;
    grouped[season].passing_cpoe += stat.passing_cpoe || 0;
    grouped[season].carries += stat.carries || 0;
    grouped[season].rushing_yards += stat.rushing_yards || 0;
    grouped[season].rushing_tds += stat.rushing_tds || 0;
    grouped[season].rushing_epa += stat.rushing_epa || 0;
    grouped[season].receptions += stat.receptions || 0;
    grouped[season].targets += stat.targets || 0;
    grouped[season].receiving_yards += stat.receiving_yards || 0;
    grouped[season].receiving += stat.receiving || 0;
    grouped[season].receiving_epa += stat.receiving_epa || 0;
    grouped[season].target_share += stat.target_share || 0;
    grouped[season].passing_attempts += stat.passing_attempts || 0;
    grouped[season].receiving_tds += stat.receiving_tds || 0;
    // Defensive fields
    grouped[season].def_tackles_solo += stat.def_tackles_solo || 0;
    grouped[season].def_tackle_assists += stat.def_tackle_assists || 0;
    grouped[season].def_sacks += stat.def_sacks || 0;
    grouped[season].def_interceptions += stat.def_interceptions || 0;
    grouped[season].fumble_recovery_own += stat.fumble_recovery_own || 0;
    grouped[season].fumble_recovery_opp += stat.fumble_recovery_opp || 0;
    grouped[season].def_tds += stat.def_tds || 0;
  });
  return Object.values(grouped).sort((a, b) => b.season - a.season);
}

/**
 * Sort weekly stats by week number
 * @param {Array} stats - Array of weekly stat objects
 * @returns {Array} Sorted array
 */
export function sortWeeklyStats(stats) {
  return stats.sort((a, b) => (a.week || 999) - (b.week || 999));
}

/**
 * Get position color for UI elements
 * @param {string} position - Player position
 * @returns {string} Color hex code
 */
export function getPositionColor(position) {
  const colors = {
    QB: '#1976d2',  // Blue
    RB: '#2d8c3c',  // Green
    WR: '#ff8c00',  // Orange
    TE: '#9c27b0',  // Purple
  };
  return colors[position] || '#757575'; // Gray as default
}

/**
 * Format player label for autocomplete
 * @param {object} player - Player object
 * @returns {string} Formatted label
 */
export function formatPlayerLabel(player) {
  return `${player.display_name} - ${player.position} (${player.team_name || player.latest_team || player.team || ''})`;
}
