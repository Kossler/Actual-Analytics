-- Each player-game's score for the Games page's standout performances (2010 on), ranked against
-- every game at the same position.
--   Offense: EPA on his dropbacks and runs (QBs) or his runs and targets (everyone else).
--   Defense: expected points taken away on plays where he made a sack, interception, forced fumble,
--   pass defensed or tackle for loss, split between the defenders credited on the play.
-- Tackle-for-loss credits start around 2009 in play-by-play, hence 2010.

SET max_parallel_workers_per_gather = 0;

CREATE MATERIALIZED VIEW "player_week_standout" AS
WITH offense AS (
  SELECT w.player_id, w.season::INT AS season, w.week::INT AS week,
         CASE WHEN ps.position = 'FB' THEN 'RB' ELSE ps.position END AS grp,
         CASE WHEN ps.position = 'QB' THEN COALESCE(w.dropback_epa, 0) + COALESCE(w.rush_epa, 0)
              ELSE COALESCE(w.rush_epa, 0) + COALESCE(w.target_epa, 0) END AS score
  FROM player_week_pbp w
  JOIN player_stats ps ON ps.player_id = w.player_id AND ps.season = w.season AND ps.week = w.week
                       AND ps.season_type = 'REG'
  WHERE w.season >= 2010 AND w.season_type = 'REG' AND ps.position IN ('QB', 'RB', 'FB', 'WR', 'TE')
),
credits AS (
  SELECT DISTINCT p.game_id, p.play_id, p.season::INT AS season, p.week::INT AS week, p.epa, c.player_id
  FROM pbp p
  CROSS JOIN LATERAL UNNEST(ARRAY[p.sack_player_id, p.half_sack_1_player_id, p.half_sack_2_player_id,
    p.interception_player_id, p.forced_fumble_player_1_player_id, p.forced_fumble_player_2_player_id,
    p.pass_defense_1_player_id, p.pass_defense_2_player_id, p.tackle_for_loss_1_player_id,
    p.tackle_for_loss_2_player_id]) AS c(player_id)
  WHERE p.season >= 2010 AND p.season_type = 'REG' AND p.epa IS NOT NULL AND c.player_id IS NOT NULL
),
defense_epa AS (
  SELECT player_id, season, week, SUM(-epa / n) AS score
  FROM (SELECT *, COUNT(*) OVER (PARTITION BY game_id, play_id) AS n FROM credits) shared
  GROUP BY player_id, season, week
),
defense AS (
  SELECT ps.player_id, ps.season::INT AS season, ps.week::INT AS week,
         CASE WHEN ps.position IN ('DE', 'DT', 'NT', 'DL') THEN 'DL'
              WHEN ps.position IN ('LB', 'OLB', 'ILB', 'MLB') THEN 'LB'
              ELSE 'DB' END AS grp,
         COALESCE(d.score, 0) AS score
  FROM player_stats ps
  LEFT JOIN defense_epa d ON d.player_id = ps.player_id AND d.season = ps.season AND d.week = ps.week
  WHERE ps.season >= 2010 AND ps.season_type = 'REG'
    AND ps.position IN ('DE', 'DT', 'NT', 'DL', 'LB', 'OLB', 'ILB', 'MLB', 'CB', 'DB', 'S', 'FS', 'SS', 'SAF')
)
SELECT * FROM offense
UNION ALL
SELECT * FROM defense;

CREATE UNIQUE INDEX "player_week_standout_key" ON "player_week_standout" ("player_id", "season", "week");
CREATE INDEX "player_week_standout_grp_idx" ON "player_week_standout" ("grp");
