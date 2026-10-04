-- Deduplicate `players` and add the indexes the API's hot paths need.
--
-- The old unique key (gsis_id, esb_id, nfl_id, pfr_id, pff_id, otc_id, espn_id, smart_id)
-- is mostly NULL, and Postgres treats NULLs as distinct, so the ingest's ON CONFLICT never
-- matched and every run appended another copy of every player (~27 copies per player).

-- 1. Keep only the most recently inserted row per gsis_id.
DELETE FROM "players" p
USING "players" newer
WHERE p.gsis_id = newer.gsis_id
  AND p.id < newer.id;

-- 2. gsis_id becomes the natural key (the app and ingest both key players on it).
DROP INDEX IF EXISTS "players_unique";
CREATE UNIQUE INDEX "players_gsis_id_key" ON "players"("gsis_id");

-- 3. Trigram index for player search (`%` similarity and ILIKE substring both use it).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "players_display_name_trgm_idx" ON "players" USING GIN ("display_name" gin_trgm_ops);

-- 4. Season-wide reads (homepage leaders, season all-stats, available years, latest season).
CREATE INDEX IF NOT EXISTS "player_stats_season_type_position_idx" ON "player_stats"("season", "season_type", "position");

-- 5. Snap counts joined per season in /season/:season/all-stats.
CREATE INDEX IF NOT EXISTS "snap_counts_season_player_week_idx" ON "snap_counts"("season", "pfr_player_id", "week");

-- 6. Contract history lookup by gsis_id (otc_id is already the leading column of contracts_unique).
CREATE INDEX IF NOT EXISTS "contracts_gsis_id_idx" ON "contracts"("gsis_id");

-- 7. Database-level settings:
--    - JIT compilation cost ~190ms on the season aggregate while saving nothing at this data size.
--    - Search used `similarity(...) > 0.2`; keep that threshold for the index-friendly `%` operator.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET jit = off', current_database());
  EXECUTE format('ALTER DATABASE %I SET pg_trgm.similarity_threshold = 0.2', current_database());
END
$$;

ANALYZE "players";
ANALYZE "player_stats";
ANALYZE "snap_counts";
ANALYZE "contracts";
