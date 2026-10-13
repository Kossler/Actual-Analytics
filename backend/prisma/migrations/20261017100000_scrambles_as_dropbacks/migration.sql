-- Scrambles count as quarterback dropbacks. nflverse leaves passer_player_id empty on scrambles (the
-- scrambler is only the rusher), so player_week_pbp counted them neither as dropbacks nor as runs and
-- quarterbacks' EPA per dropback left them out. The dropback's passer is now the scrambler on those
-- plays (what nflfastR's passer_id holds). Runs stay designed runs only.
--
-- player_week_standout reads player_week_pbp, so it is rebuilt too (definition unchanged).
--
-- player_season_stats: target share is averaged across games rather than summed, and CPOE is
-- weighted by attempts rather than averaged per game.

SET max_parallel_workers_per_gather = 0;

DROP MATERIALIZED VIEW IF EXISTS "player_week_standout";
DROP MATERIALIZED VIEW IF EXISTS "player_week_pbp";

CREATE MATERIALIZED VIEW "player_week_pbp" AS
WITH plays AS (
  SELECT season::INT AS season, week::INT AS week, season_type, posteam,
         COALESCE(passer_player_id, CASE WHEN qb_scramble = 1 THEN rusher_player_id END) AS passer_player_id,
         rusher_player_id, receiver_player_id,
         qb_dropback, pass_attempt, rush_attempt, sack, qb_scramble, complete_pass,
         epa, success, cpoe, air_yards, yards_after_catch
  FROM pbp
  WHERE epa IS NOT NULL
    AND (pass = 1 OR rush = 1)
    AND COALESCE(two_point_attempt, 0) = 0
),
roles AS (
  -- Dropbacks: pass attempts, sacks and scrambles.
  SELECT season, week, season_type, passer_player_id AS player_id, posteam AS team,
         1 AS dropbacks, epa AS dropback_epa, success AS dropback_success,
         cpoe AS cpoe_sum, CASE WHEN cpoe IS NOT NULL THEN 1 ELSE 0 END AS cpoe_n,
         CASE WHEN pass_attempt = 1 AND sack = 0 THEN air_yards ELSE 0 END AS pass_air_yards,
         0 AS carries, 0.0 AS rush_epa, 0.0 AS rush_success,
         0 AS targets, 0.0 AS target_epa, 0.0 AS target_success, 0.0 AS target_air_yards, 0.0 AS yac
  FROM plays
  WHERE qb_dropback = 1 AND passer_player_id IS NOT NULL
  UNION ALL
  -- Designed runs.
  SELECT season, week, season_type, rusher_player_id, posteam,
         0, 0.0, 0.0, NULL, 0, 0,
         1, epa, success,
         0, 0.0, 0.0, 0.0, 0.0
  FROM plays
  WHERE rush_attempt = 1 AND COALESCE(qb_scramble, 0) = 0 AND rusher_player_id IS NOT NULL
  UNION ALL
  SELECT season, week, season_type, receiver_player_id, posteam,
         0, 0.0, 0.0, NULL, 0, 0,
         0, 0.0, 0.0,
         1, epa, success, COALESCE(air_yards, 0), CASE WHEN complete_pass = 1 THEN COALESCE(yards_after_catch, 0) ELSE 0 END
  FROM plays
  WHERE pass_attempt = 1 AND COALESCE(sack, 0) = 0 AND receiver_player_id IS NOT NULL
)
SELECT
  player_id, season, week,
  MAX(season_type) AS season_type,
  (ARRAY_AGG(team))[1] AS team,
  SUM(dropbacks)::INT AS dropbacks,
  SUM(dropback_epa) AS dropback_epa,
  SUM(dropback_success) AS dropback_success,
  SUM(cpoe_sum) AS cpoe_sum,
  SUM(cpoe_n)::INT AS cpoe_n,
  SUM(pass_air_yards) AS pass_air_yards,
  SUM(carries)::INT AS carries,
  SUM(rush_epa) AS rush_epa,
  SUM(rush_success) AS rush_success,
  SUM(targets)::INT AS targets,
  SUM(target_epa) AS target_epa,
  SUM(target_success) AS target_success,
  SUM(target_air_yards) AS target_air_yards,
  SUM(yac) AS yac
FROM roles
GROUP BY player_id, season, week;

CREATE UNIQUE INDEX "player_week_pbp_key" ON "player_week_pbp" ("player_id", "season", "week");
CREATE INDEX "player_week_pbp_season_week_idx" ON "player_week_pbp" ("season", "week");

-- Unchanged from 20261016100000_standouts.
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

DROP MATERIALIZED VIEW IF EXISTS "player_season_stats";

CREATE MATERIALIZED VIEW "player_season_stats" AS
SELECT
  ps.player_id,
  ps.season,
  -- Identity from the player's latest week, so traded players show their current team.
  (ARRAY_AGG(ps.player_display_name ORDER BY ps.week DESC))[1] AS player_display_name,
  (ARRAY_AGG(ps.position ORDER BY ps.week DESC))[1] AS position,
  (ARRAY_AGG(ps.team ORDER BY ps.week DESC))[1] AS team,
  SUM(ps.completions::FLOAT) AS completions,
  SUM(ps.attempts::FLOAT) AS attempts,
  SUM(ps.passing_yards::FLOAT) AS passing_yards,
  SUM(ps.passing_tds::FLOAT) AS passing_tds,
  SUM(ps.passing_interceptions::FLOAT) AS passing_interceptions,
  SUM(ps.sacks_suffered::FLOAT) AS sacks_suffered,
  SUM(ps.sack_yards_lost::FLOAT) AS sack_yards_lost,
  SUM(ps.passing_epa::FLOAT) AS passing_epa,
  -- Weighted by attempts, so a two-throw game doesn't count as much as a full one.
  SUM(ps.passing_cpoe::FLOAT * ps.attempts) / NULLIF(SUM(ps.attempts::FLOAT) FILTER (WHERE ps.passing_cpoe IS NOT NULL), 0) AS passing_cpoe,
  SUM(ps.carries::FLOAT) AS carries,
  SUM(ps.rushing_yards::FLOAT) AS rushing_yards,
  SUM(ps.rushing_tds::FLOAT) AS rushing_tds,
  SUM(ps.rushing_epa::FLOAT) AS rushing_epa,
  SUM(ps.receptions::FLOAT) AS receptions,
  SUM(ps.targets::FLOAT) AS targets,
  SUM(ps.receiving_yards::FLOAT) AS receiving_yards,
  SUM(ps.receiving_tds::FLOAT) AS receiving_tds,
  SUM(ps.receiving_epa::FLOAT) AS receiving_epa,
  -- A share of the team's targets each game: averaged, not summed.
  AVG(ps.target_share::FLOAT) AS target_share,
  SUM(ps.def_tackles_solo::FLOAT) AS def_tackles_solo,
  SUM(ps.def_tackle_assists::FLOAT) AS def_tackle_assists,
  SUM(ps.def_sacks::FLOAT) AS def_sacks,
  SUM(ps.def_interceptions::FLOAT) AS def_interceptions,
  SUM(ps.def_pass_defended::FLOAT) AS def_pass_defended,
  SUM(ps.def_qb_hits::FLOAT) AS def_qb_hits,
  SUM(ps.def_tackles_for_loss::FLOAT) AS def_tackles_for_loss,
  SUM(ps.def_fumbles_forced::FLOAT) AS def_fumbles_forced,
  SUM(ps.def_tds::FLOAT) AS def_tds,
  SUM(ps.penalties::FLOAT) AS penalties,
  SUM(ps.penalty_yards::FLOAT) AS penalty_yards,
  SUM(ps.punt_returns::FLOAT) AS punt_returns,
  SUM(ps.punt_return_yards::FLOAT) AS punt_return_yards,
  SUM(ps.kickoff_returns::FLOAT) AS kickoff_returns,
  SUM(ps.kickoff_return_yards::FLOAT) AS kickoff_return_yards,
  SUM(ps.fumble_recovery_own::FLOAT) AS fumble_recovery_own,
  SUM(ps.fumble_recovery_yards_own::FLOAT) AS fumble_recovery_yards_own,
  SUM(ps.fumble_recovery_opp::FLOAT) AS fumble_recovery_opp,
  SUM(ps.fumble_recovery_yards_opp::FLOAT) AS fumble_recovery_yards_opp,
  SUM(ps.fumble_recovery_tds::FLOAT) AS fumble_recovery_tds,
  COALESCE(SUM(sc.defense_snaps), 0) AS defense_snaps,
  COUNT(ps.week) AS game_count
FROM player_stats ps
LEFT JOIN players p ON p.gsis_id = ps.player_id
LEFT JOIN (
  SELECT pfr_player_id, season, week, SUM(defense_snaps::FLOAT) AS defense_snaps
  FROM snap_counts
  WHERE game_type = 'REG'
  GROUP BY pfr_player_id, season, week
) sc ON sc.pfr_player_id = p.pfr_id
  AND sc.season = ps.season
  AND sc.week = ps.week
WHERE ps.season_type = 'REG'
  AND ps.player_id IS NOT NULL
  AND ps.season IS NOT NULL
GROUP BY ps.player_id, ps.season;

CREATE UNIQUE INDEX "player_season_stats_season_player_key" ON "player_season_stats" ("season", "player_id");
CREATE INDEX "player_season_stats_season_position_idx" ON "player_season_stats" ("season", "position");
