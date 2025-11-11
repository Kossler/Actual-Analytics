"""
Ultra-fast median statistics calculation using PostgreSQL's PERCENTILE_CONT function.
Uses pure SQL aggregation instead of row-by-row Python loops - 100x+ faster.
"""
import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

def calculate_medians_for_season(season):
    """Calculate median and average stats for all players in a season using pure SQL"""
    print(f"Calculating median and average stats for {season}...")
    
    with engine.connect() as conn:
        # Passers: Use PERCENTILE_CONT for median, AVG for mean
        passer_stats = text("""
            INSERT INTO "PlayerStats" ("playerId", season, 
                median_yards_per_pass_attempt, average_yards_per_pass_attempt)
            SELECT 
                p.id,
                :season,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.passing_yards)::FLOAT8 as median_pass,
                AVG(pb.passing_yards)::FLOAT8 as avg_pass
            FROM "Player" p
            INNER JOIN "Play" pb ON p.pfr_id = pb.passer_player_id
            WHERE pb.season = :season 
                AND pb.passing_yards IS NOT NULL
                AND pb.pass_attempt = true 
                AND pb.sack = false 
                AND pb.play_type NOT IN ('qb_spike')
            GROUP BY p.id
            ON CONFLICT ("playerId", season) DO UPDATE
            SET median_yards_per_pass_attempt = EXCLUDED.median_yards_per_pass_attempt,
                average_yards_per_pass_attempt = EXCLUDED.average_yards_per_pass_attempt
        """)
        
        conn.execute(passer_stats, {'season': season})
        passer_count = conn.execute(
            text("SELECT COUNT(*) FROM \"PlayerStats\" WHERE season = :s AND median_yards_per_pass_attempt IS NOT NULL"),
            {'s': season}
        ).scalar()
        print(f"  [OK] Inserted {passer_count} passer stats")
        
        # Rushers: Use PERCENTILE_CONT for median, AVG for mean
        rusher_stats = text("""
            INSERT INTO "PlayerStats" ("playerId", season, 
                median_yards_per_rushing_attempt, average_yards_per_rushing_attempt)
            SELECT 
                p.id,
                :season,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.rushing_yards)::FLOAT8 as median_rush,
                AVG(pb.rushing_yards)::FLOAT8 as avg_rush
            FROM "Player" p
            INNER JOIN "Play" pb ON p.pfr_id = pb.rusher_player_id
            WHERE pb.season = :season 
                AND pb.rushing_yards IS NOT NULL
                AND pb.rush_attempt = true
            GROUP BY p.id
            ON CONFLICT ("playerId", season) DO UPDATE
            SET median_yards_per_rushing_attempt = EXCLUDED.median_yards_per_rushing_attempt,
                average_yards_per_rushing_attempt = EXCLUDED.average_yards_per_rushing_attempt
        """)
        
        conn.execute(rusher_stats, {'season': season})
        rusher_count = conn.execute(
            text("SELECT COUNT(*) FROM \"PlayerStats\" WHERE season = :s AND median_yards_per_rushing_attempt IS NOT NULL"),
            {'s': season}
        ).scalar()
        print(f"  [OK] Inserted {rusher_count} rusher stats")
        
        # Receivers: Use PERCENTILE_CONT for median, AVG for mean
        receiver_stats = text("""
            INSERT INTO "PlayerStats" ("playerId", season, 
                median_yards_per_reception, average_yards_per_reception)
            SELECT 
                p.id,
                :season,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pb.receiving_yards)::FLOAT8 as median_rec,
                AVG(pb.receiving_yards)::FLOAT8 as avg_rec
            FROM "Player" p
            INNER JOIN "Play" pb ON p.pfr_id = pb.receiver_player_id
            WHERE pb.season = :season 
                AND pb.receiving_yards IS NOT NULL
                AND pb.complete_pass = true
            GROUP BY p.id
            ON CONFLICT ("playerId", season) DO UPDATE
            SET median_yards_per_reception = EXCLUDED.median_yards_per_reception,
                average_yards_per_reception = EXCLUDED.average_yards_per_reception
        """)
        
        conn.execute(receiver_stats, {'season': season})
        receiver_count = conn.execute(
            text("SELECT COUNT(*) FROM \"PlayerStats\" WHERE season = :s AND median_yards_per_reception IS NOT NULL"),
            {'s': season}
        ).scalar()
        print(f"  [OK] Inserted {receiver_count} receiver stats")
        
        conn.commit()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        seasons = [int(s) for s in sys.argv[1:]]
    else:
        seasons = list(range(2016, 2025))
    
    print(f"Computing medians for {len(seasons)} season(s) using fast SQL aggregation...\n")
    for s in seasons:
        calculate_medians_for_season(s)
    print("\nDone!")
