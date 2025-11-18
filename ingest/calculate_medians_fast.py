"""
Ultra-fast median statistics calculation using PostgreSQL vector-style aggregation.
All per-player yards are aggregated into FLOAT8[] arrays using array_agg(),
and medians are computed using percentile_cont() on the array.
This reduces join overhead and performs all calculations in a single SQL pass.
"""

import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)


def calculate_medians_for_season(season):
    print(f"Calculating vectorized median + average stats for {season}...")

    sql = text("""
        WITH agg AS (
            SELECT
                p.id AS playerId,
                :season AS season,

                -- Passing yards vector
                array_agg(pb.passing_yards ORDER BY pb.passing_yards) FILTER (
                    WHERE pb.season = :season
                      AND pb.passing_yards IS NOT NULL
                      AND pb.pass_attempt = true
                      AND pb.sack = false
                      AND pb.play_type NOT IN ('qb_spike')
                      AND p.pfr_id = pb.passer_player_id
                ) AS pass_vec,

                -- Rushing yards vector
                array_agg(pb.rushing_yards ORDER BY pb.rushing_yards) FILTER (
                    WHERE pb.season = :season
                      AND pb.rushing_yards IS NOT NULL
                      AND pb.rush_attempt = true
                      AND p.pfr_id = pb.rusher_player_id
                ) AS rush_vec,

                -- Receiving yards vector
                array_agg(pb.receiving_yards ORDER BY pb.receiving_yards) FILTER (
                    WHERE pb.season = :season
                      AND pb.receiving_yards IS NOT NULL
                      AND pb.complete_pass = true
                      AND p.pfr_id = pb.receiver_player_id
                ) AS recv_vec

            FROM "Player" p
            LEFT JOIN "Play" pb ON (
                p.pfr_id IN (
                    pb.passer_player_id,
                    pb.rusher_player_id,
                    pb.receiver_player_id
                )
            )
            GROUP BY p.id
        ),
        final AS (
            SELECT
                playerId,
                season,

                CASE WHEN pass_vec IS NULL THEN NULL
                     ELSE (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::FLOAT8 
                           FROM unnest(pass_vec) x) END
                     AS median_yards_per_pass_attempt,
                CASE WHEN pass_vec IS NULL THEN NULL
                     ELSE (SELECT AVG(x)::FLOAT8 FROM unnest(pass_vec) x) END
                     AS average_yards_per_pass_attempt,

                CASE WHEN rush_vec IS NULL THEN NULL
                     ELSE (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::FLOAT8 
                           FROM unnest(rush_vec) x) END
                     AS median_yards_per_rushing_attempt,
                CASE WHEN rush_vec IS NULL THEN NULL
                     ELSE (SELECT AVG(x)::FLOAT8 FROM unnest(rush_vec) x) END
                     AS average_yards_per_rushing_attempt,

                CASE WHEN recv_vec IS NULL THEN NULL
                     ELSE (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::FLOAT8 
                           FROM unnest(recv_vec) x) END
                     AS median_yards_per_reception,
                CASE WHEN recv_vec IS NULL THEN NULL
                     ELSE (SELECT AVG(x)::FLOAT8 FROM unnest(recv_vec) x) END
                     AS average_yards_per_reception

            FROM agg
        )
        INSERT INTO "PlayerStats" (
            "playerId", season,
            median_yards_per_pass_attempt, average_yards_per_pass_attempt,
            median_yards_per_rushing_attempt, average_yards_per_rushing_attempt,
            median_yards_per_reception, average_yards_per_reception
        )
        SELECT * FROM final
        ON CONFLICT ("playerId", season) DO UPDATE SET
            median_yards_per_pass_attempt = EXCLUDED.median_yards_per_pass_attempt,
            average_yards_per_pass_attempt = EXCLUDED.average_yards_per_pass_attempt,
            median_yards_per_rushing_attempt = EXCLUDED.median_yards_per_rushing_attempt,
            average_yards_per_rushing_attempt = EXCLUDED.average_yards_per_rushing_attempt,
            median_yards_per_reception = EXCLUDED.median_yards_per_reception,
            average_yards_per_reception = EXCLUDED.average_yards_per_reception;
    """)

    with engine.connect() as conn:
        conn.execute(sql, {"season": season})

        count = conn.execute(
            text("""SELECT COUNT(*) FROM "PlayerStats"
                    WHERE season = :s
                      AND (median_yards_per_pass_attempt IS NOT NULL
                           OR median_yards_per_rushing_attempt IS NOT NULL
                           OR median_yards_per_reception IS NOT NULL)
                 """),
            {"s": season}
        ).scalar()

        conn.commit()

    print(f"  [OK] Updated {count} player stat rows")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        seasons = [int(s) for s in sys.argv[1:]]
    else:
        seasons = list(range(2016, 2025))

    print(f"Computing vectorized medians for {len(seasons)} season(s)...\n")
    for s in seasons:
        calculate_medians_for_season(s)
    print("\nDone!")
