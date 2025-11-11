# NFL Statistics Data Ingestion# NFL Data Ingestion Pipeline



This directory contains scripts for loading and processing NFL play-by-play data and statistics.This directory contains the data ingestion pipeline for Actual-Analytics, powered by **nfl-data-py**.



## Main Scripts## Overview



### Current Season Updates (2025)The ingestion system fetches real NFL player statistics from nfl-data-py (Pro-Football-Reference source) and loads them into the PostgreSQL database. Data is 100% real - no generated data, no hallucinations, no fallbacks to other APIs.

```bash

python load_current_season_data.py [year]## Dependencies

```

Complete pipeline for loading current or historical season data. Runs 8 steps:All dependencies are listed in `requirements.txt`:

1. Load play-by-play data

2. Calculate player statistics (medians/averages)- **nfl-data-py** (>=0.3.0) - NFL data source with weekly statistics

3. Populate Player table from play-by-play- **pandas** (<2.0) - Data processing and manipulation

4. Aggregate weekly GameStat records- **sqlalchemy** (>=1.4) - Database ORM and query builder

5. Populate sacks and interceptions- **psycopg2-binary** - PostgreSQL database adapter

6. Calculate season-level EPA for AdvancedMetrics- **python-dotenv** - Environment variable management

7. Calculate weekly EPA for GameStat records

8. Update weekly CPOE from NGS data## Installation



### Historical Seasons (2016-2024)```bash

```bash# From the ingest directory

python load_seasonal_data_fast.py [year]pip install -r requirements.txt

``````

Fast loader for historical season-level statistics using PostgreSQL COPY protocol.

- Loads GameStat (season totals)Or from the root directory:

- Loads PlayerStats (per-attempt averages)

- Loads AdvancedMetrics (EPA, CPOE, success rates)```bash

cd ingest

```bashpip install -r requirements.txt

python restore_historical_data.py```

```

Restores all historical data (2016-2024) by running `load_current_season_data.py` for each year.## Usage



## Component Scripts### Basic Usage



These scripts are called by the main scripts above:Fetch and load statistics for a single season:



- **load_pbp_fast.py** - Download and load play-by-play data```bash

- **calculate_medians_fast.py** - Calculate player statistics from PBPpython fetch_and_load.py 2023

- **populate_players_from_pbp.py** - Update Player table with PBP data```

- **fix_2025_gamestat_weeks_fast.py** - Aggregate weekly GameStat records

- **populate_2025_int_sacks_fast.py** - Populate sacks and interceptions### Load Multiple Seasons

- **populate_2025_all_positions.py** - Calculate season EPA for 2025 (all positions)

- **populate_historical_advanced_metrics.py** - Calculate season EPA for historical yearsFrom the root directory, use the convenience scripts:

- **calculate_weekly_epa.py** - Calculate weekly EPA from play-by-play

- **update_weekly_cpoe.py** - Update weekly CPOE from NGS data**Windows:**

```bash

## Usage Examplesload-data.bat 2023 2024 2022

```

### Update current season (2025)

```bash**Linux/macOS:**

python load_current_season_data.py```bash

```./load-data.sh 2023 2024 2022

```

### Update a specific historical year

```bash### Expected Output

python load_current_season_data.py 2024

``````

Fetching 2023...

### Load historical season totals quicklyDowncasting floats.

```bashProcessing 5653 records...

python load_seasonal_data_fast.py 2023Loaded 5653 records for 2023!

``````



### Restore all historical data## How It Works

```bash

python restore_historical_data.py### Data Source

```

- **nfl-data-py** provides access to Pro-Football-Reference data

## Database Tables Populated- Uses `import_weekly_data()` to fetch all players with game statistics

- Includes weekly stats: passing yards, rushing yards, receiving yards, TDs, receptions, targets, etc.

- **PlayByPlay** - Raw play-by-play data

- **Player** - Player information### Database Operations

- **GameStat** - Weekly and season statistics

- **PlayerStats** - Per-attempt averages1. **Player Upsert**: For each unique player, insert or update in the `Player` table

- **AdvancedMetrics** - EPA, CPOE, and success rates   - Uses `pfr_id` (player name) as unique identifier

   - On conflict, updates team information

## Requirements   

2. **Game Stat Insert**: For each player-week combination, insert into `GameStat` table

Install dependencies:   - Skips duplicates automatically

```bash   - Tracks week-by-week performance for the season

pip install -r requirements.txt

```### Schema



Required environment variables in `.env`:**Player Table**

- `DATABASE_URL` - PostgreSQL connection string- `id` (PK): Auto-incrementing integer

- `name`: Player name from nfl-data-py
- `pfr_id` (unique): Unique identifier (player name)
- `team`: Team abbreviation
- `position`: Player position (QB, RB, WR, etc.)

**GameStat Table**
- `id` (PK): Auto-incrementing integer
- `playerId` (FK): Reference to Player
- `season`: NFL season year
- `week`: Week number (1-18)
- `passingYds`: Passing yards (if applicable)
- `rushingYds`: Rushing yards (if applicable)
- `receivingYds`: Receiving yards (if applicable)
- `attempts`: Pass attempts
- `targets`: Pass targets for receiver
- `receptions`: Receptions
- `rushing_tds`: Rushing touchdowns
- `receiving_tds`: Receiving touchdowns

## Performance

- **2023 season**: ~5,650 player-game records
- **2024 season**: ~5,600 player-game records
- **2022 season**: ~5,600 player-game records
- **Total**: 16,850+ records across all seasons

## Data Quality

✅ **Real data only** from nfl-data-py
✅ **Complete coverage** of all players who played that season
✅ **Weekly granularity** for game-by-game analysis
✅ **Consistent schema** across all seasons

## Troubleshooting

### "nfl-data-py not installed"
```bash
pip install nfl-data-py
```

### "DATABASE_URL not set"
Ensure `.env` file exists in the project root with:
```
DATABASE_URL=postgresql://user:password@localhost:5432/nfl
```

### Duplicate records
The script automatically skips duplicates. To reload a season, manually delete existing records:
```sql
DELETE FROM "GameStat" WHERE season = 2023;
DELETE FROM "Player" WHERE pfr_id LIKE '%'; -- if needed
```

## Script Details

### fetch_and_load.py

Main ingestion script that:
1. Fetches nfl-data-py weekly data for specified season
2. Iterates through each player-week record
3. Upserts player information with team
4. Inserts game statistics for that week
5. Commits transaction and reports success

Key differences from previous versions:
- **No sample/fake data generation**
- **No API fallbacks** - single source of truth (nfl-data-py)
- **Real stats only** from Pro-Football-Reference
- **Efficient batch loading** with error handling

## Future Enhancements

- Add historical seasons (2015-2021)
- Include advanced metrics (EPA, WPA, etc.)
- Real-time stat updates during the season
- Advanced filtering and query options
- Parallel processing for faster ingestion

1. **nfl-data-py** (Python package):
   ```bash
   pip install nfl-data-py
   ```

2. **ESPN API**: Requires proper endpoint configuration

3. **Pro-Football-Reference**: Web scraping approach

4. **NFL Official Stats**: Requires API key and authentication

### Troubleshooting

**Error: "date/time field value out of range"**
- The script now generates valid dates automatically using Python's `datetime` module

**Error: Database connection failed**
- Ensure `DATABASE_URL` is set in your `.env` file
- PostgreSQL must be running and the Prisma migrations must be applied: `npx prisma migrate deploy`

**Error: Package import failures**
- Install dependencies: `pip install -r requirements.txt`

### Viewing Data

Once loaded, view the data in your frontend:
1. Start the backend server: `npm start` (from backend/)
2. Start the frontend: `npm run dev` (from frontend/)
3. Select a season from the dropdown (2023, 2024, etc.)
4. View the median statistics by position
