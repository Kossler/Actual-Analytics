# Actual Analytics Backend

This directory contains the backend services and database logic for Actual Analytics, an NFL player analytics platform.

## Structure
- **src/**: Main backend source code (Express server, API routes, database logic)
- **prisma/**: Prisma ORM schema and migrations
- **migrate-and-start.js**: Script to run migrations and start the backend
- **package.json**: Backend dependencies and scripts
- **Procfile**: Process type definition for deployment
- **railway.toml**: Railway deployment configuration

## Features
- REST API for player stats, advanced metrics, and search
- Prisma ORM for PostgreSQL database
- Automated migrations
- Modular route structure (API, players)

## Setup
1. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Configure environment variables (see `.env.example` if present)
3. Run database migrations:
   ```bash
   npx prisma migrate deploy
   ```
4. Start the backend server:
   ```bash
   npm start
   ```

## API Endpoints
- `/api/players` — List/search players
- `/api/players/:id` — Get player details
- `/api/stats` — Get player stats
- `/api/metrics` — Advanced metrics

## Development
- Edit Prisma schema in `prisma/schema.prisma` and run migrations as needed
- API logic is in `src/routes/`
- Use Railway or Docker for deployment

## Deployment
- Railway: See `railway.toml` and `Procfile`
- Docker: Use `Dockerfile` in project root

## Contributing
Pull requests and issues are welcome! See the main project README for guidelines.

## License
MIT
