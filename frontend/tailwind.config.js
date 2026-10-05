/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: '#0c0f14',
        surface: '#12161d',
        raised: '#171c24',
        line: '#232a34',
        'line-strong': '#2f3743',
        ink: '#e7eaee',
        muted: '#a3abb7',
        faint: '#6f7886',
        brand: '#ed1c33',
        good: '#6aa6ff',
        bad: '#f0913f',
        warn: '#f2b84b',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-archivo)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        label: '0.08em',
      },
    },
  },
  plugins: [],
};
