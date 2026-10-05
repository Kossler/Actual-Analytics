-- Data for the site redesign: Next Gen Stats rushing/receiving, play-by-play aggregates per
-- player-week and team-game, and the tables the ingest's models write to.

-- Next Gen Stats (nflreadpy load_nextgen_stats stat_type = rushing / receiving). Week 0 rows are
-- season totals published by the NFL; weekly rows only exist for players over the NFL's threshold.
CREATE TABLE "nextgen_rushing" (
  "id" SERIAL PRIMARY KEY,
  "season" BIGINT,
  "season_type" TEXT,
  "week" BIGINT,
  "player_display_name" TEXT,
  "player_position" TEXT,
  "team_abbr" TEXT,
  "efficiency" DOUBLE PRECISION,
  "percent_attempts_gte_eight_defenders" DOUBLE PRECISION,
  "avg_time_to_los" DOUBLE PRECISION,
  "rush_attempts" BIGINT,
  "rush_yards" BIGINT,
  "avg_rush_yards" DOUBLE PRECISION,
  "rush_touchdowns" BIGINT,
  "player_gsis_id" TEXT,
  "player_first_name" TEXT,
  "player_last_name" TEXT,
  "player_jersey_number" BIGINT,
  "player_short_name" TEXT,
  "expected_rush_yards" DOUBLE PRECISION,
  "rush_yards_over_expected" DOUBLE PRECISION,
  "rush_yards_over_expected_per_att" DOUBLE PRECISION,
  "rush_pct_over_expected" DOUBLE PRECISION
);
CREATE UNIQUE INDEX "nextgen_rushing_unique" ON "nextgen_rushing" ("season", "week", "player_gsis_id");

CREATE TABLE "nextgen_receiving" (
  "id" SERIAL PRIMARY KEY,
  "season" BIGINT,
  "season_type" TEXT,
  "week" BIGINT,
  "player_display_name" TEXT,
  "player_position" TEXT,
  "team_abbr" TEXT,
  "avg_cushion" DOUBLE PRECISION,
  "avg_separation" DOUBLE PRECISION,
  "avg_intended_air_yards" DOUBLE PRECISION,
  "percent_share_of_intended_air_yards" DOUBLE PRECISION,
  "receptions" BIGINT,
  "targets" BIGINT,
  "catch_percentage" DOUBLE PRECISION,
  "yards" DOUBLE PRECISION,
  "rec_touchdowns" BIGINT,
  "avg_yac" DOUBLE PRECISION,
  "avg_expected_yac" DOUBLE PRECISION,
  "avg_yac_above_expectation" DOUBLE PRECISION,
  "player_gsis_id" TEXT,
  "player_first_name" TEXT,
  "player_last_name" TEXT,
  "player_jersey_number" BIGINT,
  "player_short_name" TEXT
);
CREATE UNIQUE INDEX "nextgen_receiving_unique" ON "nextgen_receiving" ("season", "week", "player_gsis_id");

-- Play-by-play per player per week: dropback, rushing and target outcomes.
-- Plays follow the usual nflfastR convention: pass or rush plays with an EPA value.
CREATE MATERIALIZED VIEW "player_week_pbp" AS
WITH plays AS (
  SELECT season::INT AS season, week::INT AS week, season_type, posteam,
         passer_player_id, rusher_player_id, receiver_player_id,
         qb_dropback, pass_attempt, rush_attempt, sack, qb_scramble, complete_pass,
         epa, success, cpoe, air_yards, yards_after_catch
  FROM pbp
  WHERE epa IS NOT NULL
    AND (pass = 1 OR rush = 1)
    AND COALESCE(two_point_attempt, 0) = 0
),
roles AS (
  SELECT season, week, season_type, passer_player_id AS player_id, posteam AS team,
         1 AS dropbacks, epa AS dropback_epa, success AS dropback_success,
         cpoe AS cpoe_sum, CASE WHEN cpoe IS NOT NULL THEN 1 ELSE 0 END AS cpoe_n,
         CASE WHEN pass_attempt = 1 AND sack = 0 THEN air_yards ELSE 0 END AS pass_air_yards,
         0 AS carries, 0.0 AS rush_epa, 0.0 AS rush_success,
         0 AS targets, 0.0 AS target_epa, 0.0 AS target_success, 0.0 AS target_air_yards, 0.0 AS yac
  FROM plays
  WHERE qb_dropback = 1 AND passer_player_id IS NOT NULL
  UNION ALL
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

-- Play-by-play per team per game, for each side of the ball and situation.
CREATE MATERIALIZED VIEW "team_game_pbp" AS
WITH plays AS (
  SELECT season::INT AS season, week::INT AS week, season_type, game_id, posteam, defteam,
         epa, success, pass, rush, yards_gained, interception, fumble_lost,
         down, yardline_100, wp, qtr, half_seconds_remaining
  FROM pbp
  WHERE epa IS NOT NULL
    AND (pass = 1 OR rush = 1)
    AND posteam IS NOT NULL AND defteam IS NOT NULL
    AND COALESCE(two_point_attempt, 0) = 0
)
SELECT
  p.game_id, p.season, p.week, p.season_type, t.team, t.side, s.situation,
  COUNT(*)::INT AS plays,
  SUM(p.epa) AS epa,
  SUM(p.success) AS success,
  SUM(p.pass)::INT AS pass_plays,
  COALESCE(SUM(p.epa) FILTER (WHERE p.pass = 1), 0) AS pass_epa,
  COALESCE(SUM(p.success) FILTER (WHERE p.pass = 1), 0) AS pass_success,
  SUM(p.rush)::INT AS rush_plays,
  COALESCE(SUM(p.epa) FILTER (WHERE p.rush = 1), 0) AS rush_epa,
  COALESCE(SUM(p.success) FILTER (WHERE p.rush = 1), 0) AS rush_success,
  SUM(COALESCE(p.yards_gained, 0)) AS yards,
  SUM(COALESCE(p.interception, 0) + COALESCE(p.fumble_lost, 0))::INT AS turnovers
FROM plays p
CROSS JOIN LATERAL (VALUES (p.posteam, 'off'), (p.defteam, 'def')) AS t(team, side)
CROSS JOIN LATERAL (VALUES
  ('all', TRUE),
  ('early_downs', p.down IN (1, 2)),
  ('late_downs', p.down IN (3, 4)),
  ('red_zone', p.yardline_100 <= 20),
  ('neutral', p.wp BETWEEN 0.2 AND 0.8 AND NOT (p.qtr IN (2, 4) AND p.half_seconds_remaining <= 120))
) AS s(situation, included)
WHERE s.included
GROUP BY p.game_id, p.season, p.week, p.season_type, t.team, t.side, s.situation;

CREATE UNIQUE INDEX "team_game_pbp_key" ON "team_game_pbp" ("game_id", "team", "side", "situation");
CREATE INDEX "team_game_pbp_season_idx" ON "team_game_pbp" ("season", "situation", "side");

-- Model outputs, written by ingest/models.py after each ingest.
CREATE TABLE "team_ratings" (
  "season" INT NOT NULL,
  "week" INT NOT NULL,
  "team" TEXT NOT NULL,
  "off_epa" DOUBLE PRECISION NOT NULL,
  "def_epa" DOUBLE PRECISION NOT NULL,
  "margin" DOUBLE PRECISION NOT NULL,
  "games" INT NOT NULL,
  PRIMARY KEY ("season", "week", "team")
);

CREATE TABLE "game_predictions" (
  "game_id" TEXT PRIMARY KEY,
  "season" INT NOT NULL,
  "week" INT NOT NULL,
  "game_type" TEXT,
  "home_team" TEXT NOT NULL,
  "away_team" TEXT NOT NULL,
  "home_wp" DOUBLE PRECISION NOT NULL,
  "home_proj" DOUBLE PRECISION NOT NULL,
  "away_proj" DOUBLE PRECISION NOT NULL,
  "proj_margin" DOUBLE PRECISION NOT NULL,
  "model_version" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "game_predictions_season_week_idx" ON "game_predictions" ("season", "week");

CREATE TABLE "playoff_odds" (
  "season" INT NOT NULL,
  "team" TEXT NOT NULL,
  "through_week" INT NOT NULL,
  "playoff_pct" DOUBLE PRECISION NOT NULL,
  "division_pct" DOUBLE PRECISION NOT NULL,
  "top_seed_pct" DOUBLE PRECISION NOT NULL,
  "proj_wins" DOUBLE PRECISION NOT NULL,
  "proj_losses" DOUBLE PRECISION NOT NULL,
  "sims" INT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("season", "team")
);

CREATE TABLE "player_projections" (
  "season" INT NOT NULL,
  "week" INT NOT NULL,
  "player_id" TEXT NOT NULL,
  "player_name" TEXT,
  "position" TEXT,
  "team" TEXT,
  "opponent" TEXT,
  "home" BOOLEAN,
  "game_id" TEXT,
  "stats" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("season", "week", "player_id")
);

CREATE TABLE "model_runs" (
  "id" SERIAL PRIMARY KEY,
  "model" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
