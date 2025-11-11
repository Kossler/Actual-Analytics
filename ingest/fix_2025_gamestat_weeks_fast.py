"""
Ultra-fast GameStat aggregation using pure SQL INSERT ... SELECT.
Uses PostgreSQL aggregate functions instead of Python loops - 100x+ faster.
Supports any season from 2016-2025.
Usage: python fix_2025_gamestat_weeks_fast.py [year]
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

print(f"Recreating {year} GameStat records with week-by-week aggregation (ALL POSITIONS)...")
print("Using bulk SQL INSERT ... SELECT for maximum performance...")

with engine.connect() as conn:
    # Delete existing GameStat records for this year
    conn.execute(text(f'DELETE FROM "GameStat" WHERE season = {year}'))
    print(f"[OK] Deleted old {year} GameStat records")
    
    # Insert all GameStat records using pure SQL aggregation
    # This handles QBs, RBs, WRs, and all other positions in one operation
    insert_all_stats = text(f"""
        INSERT INTO "GameStat" (
            "playerId", season, week, "gameDate", 
            "passingYds", passing_tds, passing_sacks, passing_interceptions,
            passing_attempts, passing_completions,
            "rushingYds", rushing_attempts, rushing_tds, 
            "receivingYds", receiving_tds, 
            receptions, targets, cpoe
        )
        WITH player_weeks AS (
            -- Get all unique player-weeks from {year} plays (all positions combined)
            -- Use DISTINCT to deduplicate players appearing in multiple roles (passer + rusher, rusher + receiver, etc.)
            SELECT DISTINCT 
                p.id as player_id,
                p.pfr_id as pfr_id,  -- Use player's actual pfr_id from Player table, not from the play
                pb.season,
                pb.week,
                pb.game_date
            FROM "Player" p
            INNER JOIN "Play" pb ON (
                p.pfr_id = pb.passer_player_id OR
                p.pfr_id = pb.rusher_player_id OR
                p.pfr_id = pb.receiver_player_id
            )
            WHERE pb.season = {year} AND pb.week IS NOT NULL
        ),
        aggregated AS (
            SELECT 
                pw.player_id,
                pw.season,
                pw.week,
                pw.game_date,
                -- Passing stats
                COALESCE(SUM(CASE WHEN pb.passer_player_id = pw.pfr_id AND pb.pass_attempt = true AND pb.sack = false 
                    AND pb.play_type NOT IN ('qb_spike') THEN pb.passing_yards ELSE 0 END), 0)::INT as passing_yds,
                COALESCE(SUM(CASE WHEN pb.passer_player_id = pw.pfr_id AND pb.pass_attempt = true AND pb.sack = false 
                    AND pb.play_type NOT IN ('qb_spike') AND pb.pass_touchdown THEN 1 ELSE 0 END), 0)::INT as passing_tds,
                COALESCE(SUM(CASE WHEN pb.passer_player_id = pw.pfr_id AND pb.sack THEN 1 ELSE 0 END), 0)::INT as passing_sacks,
                COALESCE(SUM(CASE WHEN pb.passer_player_id = pw.pfr_id AND pb.pass_attempt = true AND pb.interception THEN 1 ELSE 0 END), 0)::INT as passing_interceptions,
                COALESCE(SUM(CASE WHEN pb.passer_player_id = pw.pfr_id AND pb.pass_attempt = true AND pb.sack = false 
                    AND pb.play_type NOT IN ('qb_spike') THEN 1 ELSE 0 END), 0)::INT as passing_attempts,
                COALESCE(SUM(CASE WHEN pb.passer_player_id = pw.pfr_id AND pb.complete_pass THEN 1 ELSE 0 END), 0)::INT as passing_completions,
                -- Rushing stats
                COALESCE(SUM(CASE WHEN pb.rusher_player_id = pw.pfr_id AND pb.rush_attempt THEN pb.rushing_yards ELSE 0 END), 0)::INT as rushing_yds,
                COALESCE(SUM(CASE WHEN pb.rusher_player_id = pw.pfr_id AND pb.rush_attempt THEN 1 ELSE 0 END), 0)::INT as rushing_attempts,
                COALESCE(SUM(CASE WHEN pb.rusher_player_id = pw.pfr_id AND pb.rush_touchdown THEN 1 ELSE 0 END), 0)::INT as rushing_tds,
                -- Receiving stats
                COALESCE(SUM(CASE WHEN pb.receiver_player_id = pw.pfr_id THEN pb.receiving_yards ELSE 0 END), 0)::INT as receiving_yds,
                COALESCE(SUM(CASE WHEN pb.receiver_player_id = pw.pfr_id AND pb.pass_touchdown THEN 1 ELSE 0 END), 0)::INT as receiving_tds,
                COALESCE(SUM(CASE WHEN pb.receiver_player_id = pw.pfr_id AND pb.complete_pass THEN 1 ELSE 0 END), 0)::INT as receptions,
                COALESCE(SUM(CASE WHEN pb.receiver_player_id = pw.pfr_id AND pb.pass_attempt THEN 1 ELSE 0 END), 0)::INT as targets,
                -- CPOE (Completion Percentage Over Expected) - only for passers
                COALESCE(AVG(CASE WHEN pb.passer_player_id = pw.pfr_id AND pb.pass_attempt = true AND pb.sack = false 
                    AND pb.play_type NOT IN ('qb_spike') THEN pb.cpoe END), 0) as cpoe
            FROM player_weeks pw
            LEFT JOIN "Play" pb ON 
                pb.season = pw.season AND 
                pb.week = pw.week AND (
                    pb.passer_player_id = pw.pfr_id OR
                    pb.rusher_player_id = pw.pfr_id OR
                    pb.receiver_player_id = pw.pfr_id
                )
            GROUP BY pw.player_id, pw.season, pw.week, pw.game_date
        )
        SELECT 
            player_id, season, week, game_date,
            passing_yds, passing_tds, passing_sacks, passing_interceptions,
            passing_attempts, passing_completions,
            rushing_yds, rushing_attempts, rushing_tds,
            receiving_yds, receiving_tds,
            receptions, targets, cpoe
        FROM aggregated
        WHERE passing_yds > 0 OR rushing_yds > 0 OR receiving_yds > 0
    """)
    
    conn.execute(insert_all_stats)
    conn.commit()
    
    # Count inserted records
    result = conn.execute(text(f'SELECT COUNT(*) FROM "GameStat" WHERE season = {year}')).scalar()

print(f"[OK] Created {result:,} week-by-week GameStat records for {year} (all positions)")
print(f"Done! Created {year} weekly game stats for all positions with single SQL operation")
