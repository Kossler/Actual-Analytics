-- Apply contracts history unique index.
--
-- The prior unique key (otc_id, gsis_id) collapses contract history into a single row.
-- This migration redefines uniqueness as (otc_id, gsis_id, year_signed, team).

-- Remove exact duplicates that would block the unique index creation.
-- Only de-duplicate rows where all key columns are non-null, matching the semantics of a UNIQUE index.
DELETE FROM "contracts" a
USING "contracts" b
WHERE a."id" < b."id"
  AND a."otc_id" IS NOT NULL AND b."otc_id" IS NOT NULL
  AND a."gsis_id" IS NOT NULL AND b."gsis_id" IS NOT NULL
  AND a."year_signed" IS NOT NULL AND b."year_signed" IS NOT NULL
  AND a."team" IS NOT NULL AND b."team" IS NOT NULL
  AND a."otc_id" = b."otc_id"
  AND a."gsis_id" = b."gsis_id"
  AND a."year_signed" = b."year_signed"
  AND a."team" = b."team";

-- Drop the old unique index if it exists.
DROP INDEX IF EXISTS "contracts_unique";

-- Create the new unique index.
CREATE UNIQUE INDEX "contracts_unique" ON "contracts"("otc_id", "gsis_id", "year_signed", "team");
