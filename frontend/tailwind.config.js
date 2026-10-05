/** @type {import('tailwindcss').Config} */
// Colours come from lib/palette.json (the brand guidelines' palette and the UI colours derived
// from it), so the charts and the styles can't drift apart.
const { brand, ui } = require('./lib/palette.json');

module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: ui.page,
        sunken: ui.sunken,
        surface: ui.surface,
        raised: ui.raised,
        line: ui.line,
        'line-strong': ui.lineStrong,
        ink: ui.ink,
        body: ui.body,
        muted: ui.muted,
        faint: ui.faint,
        brand: brand.red,
        'brand-blue': brand.blue,
        navy: brand.navy,
        // Positive / negative: brand blue and red, lightened for text on navy.
        good: ui.good,
        'good-fill': ui.goodFill,
        bad: ui.bad,
        'bad-fill': ui.badFill,
        warn: ui.warn,
      },
      fontFamily: {
        // Manrope is the brand typeface for everything.
        sans: ['var(--font-manrope)', 'system-ui', 'sans-serif'],
        display: ['var(--font-manrope)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        // Brand type scale: Heading 1 / 2, Subheader 1 / 2, Paragraph 1 / 2.
        h1: ['4rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        h2: ['3rem', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        sub1: ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        sub2: ['1.5rem', { lineHeight: '1.3' }],
        p1: ['1.125rem', { lineHeight: '1.55' }],
        p2: ['1rem', { lineHeight: '1.6' }],
      },
      letterSpacing: {
        label: '0.08em',
      },
    },
  },
  plugins: [],
};
