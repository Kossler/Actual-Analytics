-- Fix contracts unique key so multiple contracts per player can exist.
-- Previously, contracts were unique on (otc_id, gsis_id) which collapses history.

-- Drop the old unique index if it exists.
DROP INDEX IF EXISTS "contracts_unique";

-- Recreate unique index including signing year/team so each contract row is distinct.
CREATE UNIQUE INDEX "contracts_unique" ON "contracts"("otc_id", "gsis_id", "year_signed", "team");
