-- One row per player per regular season, precomputed from player_stats (+ defensive snaps).
-- Backs /api/players/season/:season/all-stats and /playerstats/home so they no longer
-- aggregate weekly rows on every request. The ingest refreshes it after each load
-- (REFRESH MATERIALIZED VIEW CONCURRENTLY, which needs the unique index below).
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
  AVG(ps.passing_cpoe::FLOAT) AS passing_cpoe,
  SUM(ps.carries::FLOAT) AS carries,
  SUM(ps.rushing_yards::FLOAT) AS rushing_yards,
  SUM(ps.rushing_tds::FLOAT) AS rushing_tds,
  SUM(ps.rushing_epa::FLOAT) AS rushing_epa,
  SUM(ps.receptions::FLOAT) AS receptions,
  SUM(ps.targets::FLOAT) AS targets,
  SUM(ps.receiving_yards::FLOAT) AS receiving_yards,
  SUM(ps.receiving_tds::FLOAT) AS receiving_tds,
  SUM(ps.receiving_epa::FLOAT) AS receiving_epa,
  SUM(ps.target_share::FLOAT) AS target_share,
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
