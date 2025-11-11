-- AlterTable
ALTER TABLE "GameStat" ADD COLUMN     "cpoe" DOUBLE PRECISION,
ADD COLUMN     "epa" DOUBLE PRECISION,
ADD COLUMN     "passing_epa" DOUBLE PRECISION,
ADD COLUMN     "passing_epa_per_play" DOUBLE PRECISION,
ADD COLUMN     "passing_success_rate" DOUBLE PRECISION,
ADD COLUMN     "receiving_epa" DOUBLE PRECISION,
ADD COLUMN     "receiving_epa_per_play" DOUBLE PRECISION,
ADD COLUMN     "receiving_success_rate" DOUBLE PRECISION,
ADD COLUMN     "rushing_epa" DOUBLE PRECISION,
ADD COLUMN     "rushing_epa_per_play" DOUBLE PRECISION,
ADD COLUMN     "rushing_success_rate" DOUBLE PRECISION,
ADD COLUMN     "success_rate" DOUBLE PRECISION;
