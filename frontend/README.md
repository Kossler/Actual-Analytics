# Actual Analytics Frontend

This directory contains the frontend application for Actual Analytics, an NFL player analytics platform.

## Structure
- **components/**: React UI components (tables, charts, search, etc.)
- **hooks/**: Custom React hooks for data fetching and state management
- **pages/**: Next.js pages, including dynamic player routes
- **public/**: Static assets (icons, styles)
- **styles/**: Global CSS and theme configuration
- **utils/**: Utility functions for stats and data processing

## Features
- Next.js SPA with dynamic routing for player pages
- Tailwind CSS and MUI for styling
- Client-side data fetching from backend API
- Advanced metrics, charts, and tables

## Setup
1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Start development server:
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

## License
MIT
