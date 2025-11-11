/*
  Warnings:

  - You are about to drop the column `fullName` on the `Player` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GameStat" ADD COLUMN     "passing_interceptions" INTEGER,
ADD COLUMN     "passing_sacks" INTEGER;

-- AlterTable
ALTER TABLE "Play" ADD COLUMN     "sack" BOOLEAN;

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "fullName";

-- CreateTable
CREATE TABLE "AdvancedMetrics" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "epa" DOUBLE PRECISION,
    "epa_per_play" DOUBLE PRECISION,
    "cpoe" DOUBLE PRECISION,
    "success_rate" DOUBLE PRECISION,

    CONSTRAINT "AdvancedMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvancedMetrics_playerId_idx" ON "AdvancedMetrics"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvancedMetrics_playerId_season_key" ON "AdvancedMetrics"("playerId", "season");

-- AddForeignKey
ALTER TABLE "AdvancedMetrics" ADD CONSTRAINT "AdvancedMetrics_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
