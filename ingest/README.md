# Second Level Analytics Ingest

This directory contains scripts and tools for ingesting, cleaning, and populating the Second Level Analytics NFL analytics database.

## Structure
- **check_player_stats.py**: Validates player stats data
- **check_table_duplicates.py**: Checks for duplicate records in tables
- **check_unique_constraints.py**: Ensures unique constraints in the database
- **clear_tables.py**: Clears all data from tables
- **drop_nfl_tables.py / .sql**: Drops NFL-related tables
- **populate_tables.py**: Populates tables with new data
- **requirements.txt**: Python dependencies for ingest scripts

## Features
- Data validation and cleaning
- Automated table population
- Duplicate and constraint checks
- SQL and Python-based utilities

## Setup
1. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # or .venv\Scripts\activate on Windows
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run scripts as needed:
   ```bash
   python populate_tables.py
   ```

## Contributing
See the main project README for guidelines.

## License
MIT
