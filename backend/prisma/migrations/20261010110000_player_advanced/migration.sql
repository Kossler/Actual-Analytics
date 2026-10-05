-- Advanced player stats per week from play-by-play (and FTN charting for passers from 2022):
-- win probability added, deep passing, scrambles, interception-worthy throws, explosive and
-- stuffed runs, goal-line work, YAC over expected and red-zone / end-zone targets. Sums and counts
-- only, so any range of weeks adds up. Same play set as player_week_pbp.
CREATE MATERIALIZED VIEW "player_week_adv" AS
WITH plays AS (
  SELECT p.season::INT AS season, p.week::INT AS week, p.season_type,
         p.passer_player_id, p.rusher_player_id, p.receiver_player_id,
         p.qb_dropback, p.pass_attempt, p.rush_attempt, p.sack, p.qb_scramble, p.complete_pass,
         p.epa, p.wpa, p.air_yards, p.yards_gained, p.yards_after_catch,
         p.xyac_mean_yardage, p.yardline_100, p.touchdown, p.first_down,
         f.nflverse_play_id IS NOT NULL AS charted, f.is_interception_worthy
  FROM pbp p
  LEFT JOIN ftn_charting f ON f.nflverse_game_id = p.game_id AND f.nflverse_play_id = p.play_id
  WHERE p.epa IS NOT NULL AND (p.pass = 1 OR p.rush = 1) AND COALESCE(p.two_point_attempt, 0) = 0
),
roles AS (
  -- Passer: every dropback (sacks and scrambles included, as for EPA per dropback).
  SELECT passer_player_id AS player_id, season, week, season_type,
    'pass' AS role, wpa, epa,
    CASE WHEN pass_attempt = 1 AND sack = 0 AND air_yards >= 20 THEN 1 ELSE 0 END AS deep,
    CASE WHEN pass_attempt = 1 AND sack = 0 AND air_yards >= 20 THEN epa END AS deep_epa,
    CASE WHEN pass_attempt = 1 AND sack = 0 AND air_yards >= 20 AND complete_pass = 1 THEN 1 ELSE 0 END AS deep_comp,
    CASE WHEN charted THEN 1 ELSE 0 END AS charted,
    CASE WHEN is_interception_worthy THEN 1 ELSE 0 END AS int_worthy,
    0 AS explosive, 0 AS stuffed, 0 AS goal_line, 0 AS goal_line_td,
    0 AS rz_targets, 0 AS ez_targets, NULL::FLOAT AS yac, NULL::FLOAT AS xyac
  FROM plays WHERE qb_dropback = 1 AND passer_player_id IS NOT NULL
  UNION ALL
  -- Scrambles, credited to the quarterback as a runner.
  SELECT rusher_player_id, season, week, season_type,
    'scramble', wpa, epa, 0, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL
  FROM plays WHERE qb_scramble = 1 AND rusher_player_id IS NOT NULL
  UNION ALL
  -- Designed runs.
  SELECT rusher_player_id, season, week, season_type,
    'rush', wpa, epa, 0, NULL, 0, 0, 0,
    CASE WHEN yards_gained >= 10 THEN 1 ELSE 0 END,
    CASE WHEN yards_gained <= 0 THEN 1 ELSE 0 END,
    CASE WHEN yardline_100 <= 5 THEN 1 ELSE 0 END,
    CASE WHEN yardline_100 <= 5 AND touchdown = 1 THEN 1 ELSE 0 END,
    0, 0, NULL, NULL
  FROM plays WHERE rush_attempt = 1 AND COALESCE(qb_scramble, 0) = 0 AND rusher_player_id IS NOT NULL
  UNION ALL
  -- Targets.
  SELECT receiver_player_id, season, week, season_type,
    'target', wpa, epa, 0, NULL, 0, 0, 0,
    CASE WHEN complete_pass = 1 AND yards_gained >= 20 THEN 1 ELSE 0 END,
    0, 0, 0,
    CASE WHEN yardline_100 <= 20 THEN 1 ELSE 0 END,
    CASE WHEN air_yards >= yardline_100 THEN 1 ELSE 0 END,
    CASE WHEN complete_pass = 1 AND xyac_mean_yardage IS NOT NULL THEN yards_after_catch END,
    CASE WHEN complete_pass = 1 AND yards_after_catch IS NOT NULL THEN xyac_mean_yardage END
  FROM plays WHERE pass_attempt = 1 AND COALESCE(sack, 0) = 0 AND receiver_player_id IS NOT NULL
)
SELECT
  player_id, season, week, MAX(season_type) AS season_type,
  -- NULL (not 0) where win probability is missing, so it shows as unknown rather than zero.
  SUM(wpa) FILTER (WHERE role = 'pass') AS pass_wpa,
  SUM(wpa) FILTER (WHERE role IN ('rush', 'scramble')) AS rush_wpa,
  SUM(wpa) FILTER (WHERE role = 'target') AS rec_wpa,
  SUM(deep)::INT AS deep_att,
  COALESCE(SUM(deep_epa), 0) AS deep_epa,
  SUM(deep_comp)::INT AS deep_comp,
  COUNT(*) FILTER (WHERE role = 'scramble')::INT AS scrambles,
  COALESCE(SUM(epa) FILTER (WHERE role = 'scramble'), 0) AS scramble_epa,
  COALESCE(SUM(charted) FILTER (WHERE role = 'pass'), 0)::INT AS charted_dropbacks,
  SUM(int_worthy)::INT AS int_worthy,
  COALESCE(SUM(explosive) FILTER (WHERE role = 'rush'), 0)::INT AS explosive_runs,
  SUM(stuffed)::INT AS stuffed_runs,
  SUM(goal_line)::INT AS goal_line_carries,
  SUM(goal_line_td)::INT AS goal_line_tds,
  COALESCE(SUM(explosive) FILTER (WHERE role = 'target'), 0)::INT AS explosive_catches,
  SUM(rz_targets)::INT AS rz_targets,
  SUM(ez_targets)::INT AS ez_targets,
  COALESCE(SUM(yac), 0) AS yac_tracked,
  COALESCE(SUM(xyac), 0) AS xyac,
  COUNT(xyac)::INT AS xyac_n
FROM roles
GROUP BY player_id, season, week;

CREATE UNIQUE INDEX "player_week_adv_key" ON "player_week_adv" ("player_id", "season", "week");
CREATE INDEX "player_week_adv_season_week_idx" ON "player_week_adv" ("season", "week");
