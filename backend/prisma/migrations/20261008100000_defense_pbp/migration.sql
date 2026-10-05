-- Play-by-play per defender per week: tackles from the play-by-play tackler columns, split by
-- run and pass, and "stops" (tackles that end a play the offense failed on, by EPA success).
-- Same play set as player_week_pbp: pass or rush plays with an EPA value, no two-point tries.
CREATE MATERIALIZED VIEW "player_week_def_pbp" AS
WITH plays AS (
  SELECT game_id, play_id, season::INT AS season, week::INT AS week, season_type, defteam,
         rush_attempt, pass_attempt, sack, complete_pass, success, yards_gained,
         solo_tackle_1_player_id, solo_tackle_2_player_id,
         assist_tackle_1_player_id, assist_tackle_2_player_id, assist_tackle_3_player_id, assist_tackle_4_player_id,
         tackle_with_assist_1_player_id, tackle_with_assist_2_player_id
  FROM pbp
  WHERE epa IS NOT NULL
    AND (pass = 1 OR rush = 1)
    AND COALESCE(two_point_attempt, 0) = 0
),
tackles AS (
  -- One row per play per tackler (a player can appear in more than one tackler column).
  SELECT DISTINCT p.game_id, p.play_id, t.player_id, p.season, p.week, p.season_type, p.defteam,
         p.rush_attempt, p.pass_attempt, p.sack, p.complete_pass, p.success, p.yards_gained
  FROM plays p
  CROSS JOIN LATERAL (VALUES
    (p.solo_tackle_1_player_id), (p.solo_tackle_2_player_id),
    (p.assist_tackle_1_player_id), (p.assist_tackle_2_player_id),
    (p.assist_tackle_3_player_id), (p.assist_tackle_4_player_id),
    (p.tackle_with_assist_1_player_id), (p.tackle_with_assist_2_player_id)
  ) AS t(player_id)
  WHERE t.player_id IS NOT NULL
)
SELECT
  player_id, season, week,
  MAX(season_type) AS season_type,
  (ARRAY_AGG(defteam))[1] AS team,
  COUNT(*)::INT AS tackle_plays,
  COUNT(*) FILTER (WHERE success = 0)::INT AS stops,
  COUNT(*) FILTER (WHERE rush_attempt = 1)::INT AS run_tackles,
  COUNT(*) FILTER (WHERE rush_attempt = 1 AND success = 0)::INT AS run_stops,
  COALESCE(SUM(yards_gained) FILTER (WHERE rush_attempt = 1), 0)::FLOAT AS run_tackle_yards,
  COUNT(*) FILTER (WHERE pass_attempt = 1 AND COALESCE(sack, 0) = 0 AND complete_pass = 1)::INT AS rec_tackles,
  COALESCE(SUM(yards_gained) FILTER (WHERE pass_attempt = 1 AND COALESCE(sack, 0) = 0 AND complete_pass = 1), 0)::FLOAT AS rec_tackle_yards
FROM tackles
GROUP BY player_id, season, week;

CREATE UNIQUE INDEX "player_week_def_pbp_key" ON "player_week_def_pbp" ("player_id", "season", "week");
CREATE INDEX "player_week_def_pbp_season_week_idx" ON "player_week_def_pbp" ("season", "week");
