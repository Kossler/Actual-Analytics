# Actual Analytics

A full-stack NFL player statistics analysis platform built with Next.js, Node.js, and PostgreSQL. Features comprehensive play-by-play data ingestion, advanced metrics (EPA, CPOE, success rate), and an interactive dashboard for viewing player performance across multiple seasons (2016-2025).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Data Ingestion](#data-ingestion)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18+) - [Download](https://nodejs.org/)
- **Python** (v3.12+) - [Download](https://www.python.org/)
- **PostgreSQL** (v14+) - [Download](https://www.postgresql.org/)
- **Docker** (optional) - [Download](https://www.docker.com/)
- **Git** - [Download](https://git-scm.com/)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Kossler/Actual-Analytics.git
cd Actual-Analytics
```

### 2. Backend Setup

Navigate to the backend directory and install dependencies:

```bash
cd backend
npm install
```

### 3. Frontend Setup

Navigate to the frontend directory and install dependencies:

```bash
cd ../frontend
npm install
```

### 4. Python Environment Setup

Create a virtual environment and install Python dependencies:

```bash
cd ../ingest
python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

## Configuration

### Database Setup

1. **Create a PostgreSQL database:**

```bash
createdb actual_analytics
```

2. **Create a `.env` file in the root directory** with your database connection string:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/actual_analytics
```

Replace `username` and `password` with your PostgreSQL credentials.

### Database Migration

Run Prisma migrations to set up the database schema:

```bash
cd backend
npx prisma migrate dev
```

This will create the necessary tables:
- `Player` - Stores player information (name, team, position, etc.)
- `GameStat` - Stores weekly game statistics for each player

## Data Ingestion

### Data Source: nfl-data-py

The ingestion pipeline uses **nfl-data-py**, which provides comprehensive NFL data including:
- Play-by-play data with EPA (Expected Points Added)
- Weekly player statistics from Pro-Football-Reference
- NGS (Next Gen Stats) data for CPOE (Completion Percentage Over Expected)
- Advanced metrics: success rate, air yards, YAC, receiving EPA

### Primary Ingestion Scripts

**For Current/Recent Seasons (2023-2025):**

```bash
cd ingest
python load_current_season_data.py 2025
```

This comprehensive script runs 8 steps:
1. Load play-by-play data
2. Calculate player statistics (medians/averages)
3. Populate Player table from play-by-play
4. Aggregate weekly GameStat records
5. Populate sacks and interceptions
6. Calculate season-level EPA
7. Calculate weekly EPA
8. Update weekly CPOE from NGS data

**For Historical Seasons (2016-2024):**

```bash
cd ingest
python load_seasonal_data_fast.py 2023
```

Fast loader using PostgreSQL COPY protocol for efficient bulk loading.

### Batch Ingest Multiple Seasons

**On Windows (PowerShell):**

```powershell
cd ingest
# Recent seasons (comprehensive pipeline)
2025, 2024, 2023 | ForEach-Object { 
  python load_current_season_data.py $_
  Write-Host "Completed season $_`n"
}

# Historical seasons (fast loader)
2022..2016 | ForEach-Object { 
  python load_seasonal_data_fast.py $_
  Write-Host "Completed season $_`n"
}
```

**On macOS/Linux (Bash):**

```bash
cd ingest
# Recent seasons (comprehensive pipeline)
for season in 2025 2024 2023; do
  python load_current_season_data.py $season
  echo "Completed season $season"
done

# Historical seasons (fast loader)
for season in {2022..2016}; do
  python load_seasonal_data_fast.py $season
  echo "Completed season $season"
done
```

### What the Pipeline Does

**Play-by-Play Processing:**
- Fetches comprehensive play-by-play data from nfl-data-py
- Calculates Expected Points Added (EPA) for passing, rushing, and receiving
- Processes Next Gen Stats for CPOE (Completion Percentage Over Expected)
- Tracks success rate, air yards, YAC (Yards After Catch)

**Player Statistics:**
- Aggregates weekly game statistics for all players
- Calculates median performance metrics across seasons
- Stores advanced metrics: EPA/play, CPOE, success rate
- Tracks positional stats: passing, rushing, receiving, defensive

**Database Operations:**
- Upserts player records with current team and position
- Inserts/updates weekly GameStat records
- Populates AdvancedMetrics table with season-level analytics
- **100% real data** - no generated or synthetic data

### Data Availability

- **Seasons available**: 2016-2025 (current season)
- **Data sources**: 
  - nfl-data-py (play-by-play, weekly stats)
  - Pro-Football-Reference (player statistics)
  - Next Gen Stats (CPOE, air yards)
- **Coverage**: All NFL players with recorded game statistics
- **Records**: 50,000+ player-week combinations

## Running the Application

### Start PostgreSQL

Ensure your PostgreSQL database is running:

```bash
# On macOS (if installed via Homebrew)
brew services start postgresql

# On Windows (if installed as a service)
# PostgreSQL service should start automatically

# Or use Docker
docker run --name postgres -e POSTGRES_PASSWORD=password -d postgres:15
```

### Start the Backend Server

```bash
cd backend
npm start
```

The backend server will run on `http://localhost:4000` (or the port specified by `PORT` environment variable).

**Note:** The backend now includes automated database migrations on startup via `migrate-and-start.js`.

### Start the Frontend Application

**Development Mode:**

```bash
cd frontend
npm run dev
```

The frontend will run on `http://localhost:3000`.

**Production Mode:**

```bash
cd frontend
npm run build  # Builds static export
npm start      # Serves static files on port 8080
```

The production server includes:
- Static file serving with proper MIME types
- Rate limiting (1000 requests/minute per IP)
- Security headers
- Optimized for Railway deployment

### Using Docker (Recommended for Production)

The project includes a production-ready Dockerfile optimized for Railway deployment:

```bash
docker build -t actual-analytics .
docker run -p 4000:4000 -p 8080:8080 --env-file .env actual-analytics
```

**Docker Optimizations:**
- Multi-layer caching for faster rebuilds
- Python 3.12 with pandas 2.x (fast prebuilt wheels)
- Production-only npm dependencies
- Automated database migrations on container start

**Deploy to Railway:**

The app is configured for Railway with:
- `railway.json` - Dockerfile build configuration
- `Procfile` - Process management
- Automatic migrations via `migrate-and-start.js`

## Project Structure

```
Actual-Analytics/
├── backend/                              # Express.js backend API
│   ├── src/
│   │   ├── db.js                        # Prisma database connection
│   │   ├── server.js                    # Express server (port 4000)
│   │   └── routes/
│   │       └── players.js               # Player statistics endpoints
│   ├── prisma/
│   │   ├── schema.prisma                # Database schema (Player, GameStat, AdvancedMetrics)
│   │   └── migrations/                  # 15 database migrations
│   ├── migrate-and-start.js             # Auto-migration on startup
│   └── package.json
├── frontend/                             # Next.js frontend
│   ├── pages/
│   │   ├── _app.js                      # App wrapper with Material-UI
│   │   ├── _document.js                 # HTML document setup
│   │   └── index.js                     # Player statistics dashboard
│   ├── styles/
│   │   └── globals.css                  # Global styles with Tailwind
│   ├── serve-static.js                  # Production static server (port 8080)
│   ├── clean-build.js                   # Post-build cleanup script
│   └── package.json
├── ingest/                               # Python data pipeline
│   ├── load_current_season_data.py      # Comprehensive 8-step pipeline (2023-2025)
│   ├── load_seasonal_data_fast.py       # Fast historical loader (2016-2024)
│   ├── load_pbp_fast.py                 # Play-by-play data loader
│   ├── calculate_medians_fast.py        # Median statistics calculator
│   ├── calculate_weekly_epa.py          # Weekly EPA calculator
│   ├── update_weekly_cpoe.py            # CPOE from NGS data
│   ├── populate_*.py                    # Various data population scripts
│   ├── requirements.txt                 # Python dependencies (pandas 2.x)
│   └── README.md                        # Detailed ingestion documentation
├── Dockerfile                            # Production Docker image (Railway-optimized)
├── railway.json                          # Railway deployment config
├── Procfile                              # Process management
├── .dockerignore                         # Docker build exclusions
└── README.md                             # This file
```

## API Endpoints

### Get Player Medians

**Endpoint:** `GET /api/players/medians`

**Query Parameters:**
- `season` (required): NFL season year (2016-2025)

**Response:**

```json
[
  {
    "player_id": "00-0039339",
    "full_name": "Patrick Mahomes",
    "position": "QB",
    "team": "KC",
    "games": 17,
    "median_passing_yards": 285.5,
    "median_rushing_yards": 15.2,
    "median_receiving_yards": 0.0,
    "median_passing_tds": 2.0,
    "median_rushing_tds": 0.0,
    "median_receiving_tds": 0.0,
    "avg_passing_yards": 292.3,
    "avg_rushing_yards": 18.7,
    "avg_receiving_yards": 0.0
  }
]
```

**Example:**

```bash
curl "http://localhost:4000/api/players/medians?season=2025"
```

### Additional Endpoints

The backend supports querying:
- Weekly game statistics
- Advanced metrics (EPA, CPOE, success rate)
- Player comparisons
- Season-over-season trends

See `backend/src/routes/players.js` for all available endpoints.

## Features

### Frontend
- ✅ Material-UI dark mode interface
- ✅ Multi-season selector (2016-2025)
- ✅ Sortable, filterable player statistics table
- ✅ Responsive design with Tailwind CSS
- ✅ Advanced metrics display (EPA, CPOE, success rate)
- ✅ Production static file serving with rate limiting

### Backend
- ✅ Express.js REST API
- ✅ PostgreSQL with Prisma ORM
- ✅ Automated database migrations
- ✅ CORS-enabled for cross-origin requests
- ✅ Security headers (X-Powered-By disabled)

### Data Pipeline
- ✅ Comprehensive play-by-play data ingestion
- ✅ Advanced NFL analytics (EPA, CPOE, air yards, YAC)
- ✅ Multi-season support (2016-2025)
- ✅ Efficient bulk loading with PostgreSQL COPY
- ✅ Automated weekly updates
- ✅ 100% real data from nfl-data-py

### Deployment
- ✅ Docker containerization
- ✅ Railway deployment configuration
- ✅ Optimized build times (~2-3 minutes)
- ✅ Production-ready with automated migrations

## Troubleshooting

### Database Connection Issues

**Error:** `connect ECONNREFUSED 127.0.0.1:5432`

- Ensure PostgreSQL is running
- Check your `DATABASE_URL` in `.env`
- Verify database credentials

### Port Already in Use

**Error:** `Error: listen EADDRINUSE: address already in use :::3000`

- Kill the process using the port or change the port in your configuration
- On Windows: `netstat -ano | findstr :3000` then `taskkill /PID <PID> /F`
- On macOS/Linux: `lsof -i :3000` then `kill -9 <PID>`

### Missing Dependencies

If you get module not found errors:

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install

# Ingest
cd ingest
pip install -r requirements.txt
```

### Data Not Loading

- Verify you've run the ingestion script
- Check that the database has tables with `psql actual_analytics`
- Confirm the season you're querying (2016-2024) has data available

## Technologies Used

- **Frontend:** Next.js 14, React 18, Material-UI v7, Tailwind CSS
- **Backend:** Node.js 20, Express.js 4, Prisma ORM 5
- **Database:** PostgreSQL 14+
- **Data Sources:** 
  - nfl-data-py (play-by-play, weekly stats)
  - Pro-Football-Reference (player statistics)
  - Next Gen Stats (CPOE, air yards)
- **Ingestion:** Python 3.12, Pandas 2.x, SQLAlchemy, psycopg2
- **Deployment:** Docker, Railway
- **Security:** Rate limiting, CORS, security headers

## Contributing

Contributions are welcome! Please follow these steps:

1. Create a feature branch (`git checkout -b feature/your-feature`)
2. Commit your changes (`git commit -am 'Add new feature'`)
3. Push to the branch (`git push origin feature/your-feature`)
4. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For questions or issues, please open an issue on GitHub or contact the project maintainers.

---

**Last Updated:** November 11, 2025  
**Version:** 2.0.0  
**Production Deployment:** Railway
