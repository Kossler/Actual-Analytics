-- Field goals per kicker per week with an expected number of makes. A kick's expected make rate is
-- the league's rate from that distance (within two yards) over that season and the two before,
-- so the baseline moves as kicking improves. Sums only, so any range of weeks adds up.

-- Build without parallel workers: parallel hash joins need shared memory, which small Postgres
-- containers (Docker's 64 MB /dev/shm default) don't have.
SET max_parallel_workers_per_gather = 0;

CREATE MATERIALIZED VIEW "player_week_kicking" AS
WITH kicks AS (
  SELECT season::INT AS season, week::INT AS week, season_type, kicker_player_id AS player_id,
         kick_distance::INT AS distance, CASE WHEN field_goal_result = 'made' THEN 1 ELSE 0 END AS made
  FROM pbp
  WHERE field_goal_attempt = 1 AND kick_distance IS NOT NULL AND kicker_player_id IS NOT NULL
),
by_distance AS (
  SELECT season, distance, COUNT(*) AS attempts, SUM(made) AS made FROM kicks GROUP BY season, distance
),
-- League make rate for each season and distance, pooled over three seasons and +/- 2 yards.
rates AS (
  SELECT s.season, d.distance, SUM(b.made)::FLOAT / NULLIF(SUM(b.attempts), 0) AS rate
  FROM (SELECT DISTINCT season FROM kicks) s
  CROSS JOIN (SELECT DISTINCT distance FROM kicks) d
  JOIN by_distance b ON b.season BETWEEN s.season - 2 AND s.season AND b.distance BETWEEN d.distance - 2 AND d.distance + 2
  GROUP BY s.season, d.distance
)
SELECT
  k.player_id, k.season, k.week, MAX(k.season_type) AS season_type,
  COUNT(*)::INT AS fg_attempts,
  SUM(k.made)::INT AS fg_makes,
  SUM(r.rate) AS fg_expected,
  COUNT(*) FILTER (WHERE k.distance >= 50)::INT AS fg_50_attempts,
  COALESCE(SUM(k.made) FILTER (WHERE k.distance >= 50), 0)::INT AS fg_50_makes
FROM kicks k
JOIN rates r ON r.season = k.season AND r.distance = k.distance
GROUP BY k.player_id, k.season, k.week;

CREATE UNIQUE INDEX "player_week_kicking_key" ON "player_week_kicking" ("player_id", "season", "week");
CREATE INDEX "player_week_kicking_season_week_idx" ON "player_week_kicking" ("season", "week");
