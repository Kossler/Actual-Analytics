-- Remaining nflverse datasets: injuries, current depth charts, PFR advanced stats, contract cap
-- history, plus indexes for per-player charting splits and a fix to team_stats' unique key.

-- Over The Cap's per-season breakdown (cap number, base salary, guarantees) for each contract.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "season_history" JSONB;

-- Weekly injury reports (nflreadpy load_injuries, 2009+).
CREATE TABLE "injuries" (
  "id" SERIAL PRIMARY KEY,
  "season" BIGINT,
  "season_type" TEXT,
  "game_type" TEXT,
  "team" TEXT,
  "week" BIGINT,
  "gsis_id" TEXT,
  "position" TEXT,
  "full_name" TEXT,
  "first_name" TEXT,
  "last_name" TEXT,
  "report_primary_injury" TEXT,
  "report_secondary_injury" TEXT,
  "report_status" TEXT,
  "practice_primary_injury" TEXT,
  "practice_secondary_injury" TEXT,
  "practice_status" TEXT
);
CREATE UNIQUE INDEX "injuries_unique" ON "injuries" ("season", "game_type", "week", "gsis_id");
CREATE INDEX "injuries_gsis_id_idx" ON "injuries" ("gsis_id", "season", "week");

-- The latest depth chart snapshot only (nflverse publishes timestamped snapshots since 2026; the
-- old weekly-format depth_charts table is kept for history). Replaced on every load.
CREATE TABLE "depth_charts_current" (
  "id" SERIAL PRIMARY KEY,
  "dt" TEXT,
  "team" TEXT,
  "player_name" TEXT,
  "espn_id" TEXT,
  "gsis_id" TEXT,
  "pos_grp_id" TEXT,
  "pos_grp" TEXT,
  "pos_id" TEXT,
  "pos_name" TEXT,
  "pos_abb" TEXT,
  "pos_slot" BIGINT,
  "pos_rank" BIGINT
);
CREATE INDEX "depth_charts_current_team_idx" ON "depth_charts_current" ("team");
CREATE INDEX "depth_charts_current_gsis_id_idx" ON "depth_charts_current" ("gsis_id");

-- Pro Football Reference advanced stats per player-game (nflreadpy load_pfr_advstats, 2018+).
CREATE TABLE "pfr_advstats_pass" (
  "id" SERIAL PRIMARY KEY,
  "game_id" TEXT, "pfr_game_id" TEXT, "season" BIGINT, "week" BIGINT, "game_type" TEXT, "team" TEXT, "opponent" TEXT,
  "pfr_player_name" TEXT, "pfr_player_id" TEXT,
  "passing_drops" DOUBLE PRECISION, "passing_drop_pct" DOUBLE PRECISION,
  "receiving_drop" DOUBLE PRECISION, "receiving_drop_pct" DOUBLE PRECISION,
  "passing_bad_throws" DOUBLE PRECISION, "passing_bad_throw_pct" DOUBLE PRECISION,
  "times_sacked" DOUBLE PRECISION, "times_blitzed" DOUBLE PRECISION, "times_hurried" DOUBLE PRECISION,
  "times_hit" DOUBLE PRECISION, "times_pressured" DOUBLE PRECISION, "times_pressured_pct" DOUBLE PRECISION,
  "def_times_blitzed" DOUBLE PRECISION, "def_times_hurried" DOUBLE PRECISION, "def_times_hitqb" DOUBLE PRECISION
);
CREATE UNIQUE INDEX "pfr_advstats_pass_unique" ON "pfr_advstats_pass" ("game_id", "pfr_player_id");
CREATE INDEX "pfr_advstats_pass_player_idx" ON "pfr_advstats_pass" ("pfr_player_id");

CREATE TABLE "pfr_advstats_rush" (
  "id" SERIAL PRIMARY KEY,
  "game_id" TEXT, "pfr_game_id" TEXT, "season" BIGINT, "week" BIGINT, "game_type" TEXT, "team" TEXT, "opponent" TEXT,
  "pfr_player_name" TEXT, "pfr_player_id" TEXT,
  "carries" DOUBLE PRECISION,
  "rushing_yards_before_contact" DOUBLE PRECISION, "rushing_yards_before_contact_avg" DOUBLE PRECISION,
  "rushing_yards_after_contact" DOUBLE PRECISION, "rushing_yards_after_contact_avg" DOUBLE PRECISION,
  "rushing_broken_tackles" DOUBLE PRECISION, "receiving_broken_tackles" DOUBLE PRECISION
);
CREATE UNIQUE INDEX "pfr_advstats_rush_unique" ON "pfr_advstats_rush" ("game_id", "pfr_player_id");
CREATE INDEX "pfr_advstats_rush_player_idx" ON "pfr_advstats_rush" ("pfr_player_id");

CREATE TABLE "pfr_advstats_rec" (
  "id" SERIAL PRIMARY KEY,
  "game_id" TEXT, "pfr_game_id" TEXT, "season" BIGINT, "week" BIGINT, "game_type" TEXT, "team" TEXT, "opponent" TEXT,
  "pfr_player_name" TEXT, "pfr_player_id" TEXT,
  "rushing_broken_tackles" DOUBLE PRECISION, "receiving_broken_tackles" DOUBLE PRECISION,
  "passing_drops" DOUBLE PRECISION, "passing_drop_pct" DOUBLE PRECISION,
  "receiving_drop" DOUBLE PRECISION, "receiving_drop_pct" DOUBLE PRECISION,
  "receiving_int" DOUBLE PRECISION, "receiving_rat" DOUBLE PRECISION
);
CREATE UNIQUE INDEX "pfr_advstats_rec_unique" ON "pfr_advstats_rec" ("game_id", "pfr_player_id");
CREATE INDEX "pfr_advstats_rec_player_idx" ON "pfr_advstats_rec" ("pfr_player_id");

CREATE TABLE "pfr_advstats_def" (
  "id" SERIAL PRIMARY KEY,
  "game_id" TEXT, "pfr_game_id" TEXT, "season" BIGINT, "week" BIGINT, "game_type" TEXT, "team" TEXT, "opponent" TEXT,
  "pfr_player_name" TEXT, "pfr_player_id" TEXT,
  "def_ints" DOUBLE PRECISION, "def_targets" DOUBLE PRECISION, "def_completions_allowed" DOUBLE PRECISION,
  "def_completion_pct" DOUBLE PRECISION, "def_yards_allowed" DOUBLE PRECISION,
  "def_yards_allowed_per_cmp" DOUBLE PRECISION, "def_yards_allowed_per_tgt" DOUBLE PRECISION,
  "def_receiving_td_allowed" DOUBLE PRECISION, "def_passer_rating_allowed" DOUBLE PRECISION,
  "def_adot" DOUBLE PRECISION, "def_air_yards_completed" DOUBLE PRECISION, "def_yards_after_catch" DOUBLE PRECISION,
  "def_times_blitzed" DOUBLE PRECISION, "def_times_hurried" DOUBLE PRECISION, "def_times_hitqb" DOUBLE PRECISION,
  "def_sacks" DOUBLE PRECISION, "def_pressures" DOUBLE PRECISION, "def_tackles_combined" DOUBLE PRECISION,
  "def_missed_tackles" DOUBLE PRECISION, "def_missed_tackle_pct" DOUBLE PRECISION
);
CREATE UNIQUE INDEX "pfr_advstats_def_unique" ON "pfr_advstats_def" ("game_id", "pfr_player_id");
CREATE INDEX "pfr_advstats_def_player_idx" ON "pfr_advstats_def" ("pfr_player_id");

-- Per-player play lookups (charting splits on the player page join pbp to ftn_charting).
CREATE INDEX IF NOT EXISTS "pbp_passer_season_idx" ON "pbp" ("passer_player_id", "season");
CREATE INDEX IF NOT EXISTS "pbp_receiver_season_idx" ON "pbp" ("receiver_player_id", "season");
CREATE INDEX IF NOT EXISTS "pbp_rusher_season_idx" ON "pbp" ("rusher_player_id", "season");

-- team_stats has one row per team per week; the old (season, week) key kept a single team per week.
DROP INDEX IF EXISTS "team_stats_unique";
CREATE UNIQUE INDEX "team_stats_unique" ON "team_stats" ("season", "week", "team");

-- Projections record the injury status and depth-chart rank they were made with.
ALTER TABLE "player_projections" ADD COLUMN IF NOT EXISTS "injury_status" TEXT;
ALTER TABLE "player_projections" ADD COLUMN IF NOT EXISTS "depth_rank" INT;

-- Contracts are now replaced from Over The Cap's full snapshot on every load. Players often have
-- several distinct deals with one team in the same year (signed, released, re-signed), so the old
-- (otc_id, gsis_id, year_signed, team) key silently dropped real contracts.
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_unique";
DROP INDEX IF EXISTS "contracts_unique";
CREATE INDEX IF NOT EXISTS "contracts_otc_id_idx" ON "contracts" ("otc_id");
