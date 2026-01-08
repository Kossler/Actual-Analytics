# Second Level Analytics

Second Level Analytics is a full-stack NFL player analytics platform providing advanced metrics, player stats, and interactive visualizations.

## Project Structure
- **frontend/**: Next.js SPA for user interface and data visualization
- **backend/**: Node.js/Express API and database logic (Prisma ORM)
- **ingest/**: Python scripts for data ingestion, cleaning, and population
- **Dockerfile / docker-compose.yml**: Containerization and orchestration
- **railway.json / railway.toml**: Railway deployment configuration
- **Procfile**: Process type definition for deployment

## Features
- Dynamic player pages and advanced analytics
- REST API for stats and metrics
- Automated data ingestion and validation
- Modular, scalable architecture

## Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/Kossler/Second-Level-Analytics.git
   cd Second-Level-Analytics
   ```
2. See individual directory READMEs for setup instructions

## Deployment
- Cloudflare Pages for frontend (Next.js SSR via `@cloudflare/next-on-pages`)
   - Root directory: `frontend`
   - Build command: `sh build.sh`
   - Build output directory: `.vercel/output/static`
- Railway or Docker for backend
- PostgreSQL database (via Prisma)

## Contributing
Pull requests and issues are welcome! See guidelines in each directory README.

## License
MIT
