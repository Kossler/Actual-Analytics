# Second Level Analytics Frontend

This directory contains the frontend application for Second Level Analytics, an NFL player analytics platform.

## Structure
- **pages/**: Next.js pages (leaderboards, player, team, games, predictive models, glossary, compare)
- **components/**: page components, the shared data table, UI primitives and SVG charts
- **lib/**: metric definitions, per-position layouts, formatting, API and storage helpers
- **styles/**: Tailwind base styles; design tokens live in `tailwind.config.js`

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

## Features
- Edge-rendered pages (Cloudflare Pages) with all data-changing state in the URL
- Tailwind styling, hand-written SVG charts, no UI or chart library
- Leaderboards, player and team pages, weekly games with win probability, model pages and a glossary

## Setup
1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Start development server (point it at a backend with `NEXT_PUBLIC_API_URL`, e.g. in `.env.local`):
   ```bash
   npm run dev
   ```
3. Build static site for deployment:
   ```bash
   npm run build
   ```

## Deployment
- Cloudflare Pages SSR via `@cloudflare/next-on-pages`
- Build produces `.vercel/output/static` (set this as the Cloudflare Pages output directory)
- Root directory: `frontend`
- Build command: `sh build.sh`
- Output directory: `.vercel/output/static`
- Cloudflare Pages → Settings → Functions: add compatibility flag `nodejs_compat` (Production + Preview)

## License
MIT
