"""
Ultra-fast sacks and interceptions population using bulk SQL updates.
Uses single UPDATE ... SET with CASE statements instead of row-by-row updates - 100x+ faster.
Supports any season from 2016-2025.
Usage: python populate_2025_int_sacks_fast.py [year]
"""
import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

# Get year from command line argument or default to 2025
year = int(sys.argv[1]) if len(sys.argv) > 1 else 2025

print(f"Populating interceptions and sacks for {year} GameStat records...")

with engine.connect() as conn:
    # Update all GameStat records for this year with sacks and interceptions in one operation
    update_query = text(f"""
        UPDATE "GameStat" gs
        SET 
            passing_sacks = COALESCE((
                SELECT COUNT(*)
                FROM "Play" p
                INNER JOIN "Player" pl ON pl.pfr_id = p.passer_player_id
                WHERE pl.id = gs."playerId" 
                    AND p.season = gs.season
                    AND p.week = gs.week
                    AND p.sack = true
            ), 0),
            passing_interceptions = COALESCE((
                SELECT COUNT(*)
                FROM "Play" p
                INNER JOIN "Player" pl ON pl.pfr_id = p.passer_player_id
                WHERE pl.id = gs."playerId" 
                    AND p.season = gs.season
                    AND p.week = gs.week
                    AND p.pass_attempt = true
                    AND p.interception = true
            ), 0)
        WHERE gs.season = {year}
    """)
    
    conn.execute(update_query)
    conn.commit()
    
    # Count updated records
    result = conn.execute(text(f"""
        SELECT COUNT(*) 
        FROM "GameStat" 
        WHERE season = {year} AND (passing_sacks > 0 OR passing_interceptions > 0)
    """)).scalar()

print(f"[OK] Updated {result:,} {year} GameStat records with sacks/interceptions")
print(f"Done! Populated {year} sacks and interceptions with single SQL operation")
