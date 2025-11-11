/*
  Warnings:

  - You are about to drop the column `attempts` on the `GameStat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GameStat" DROP COLUMN "attempts",
ADD COLUMN     "passing_attempts" INTEGER,
ADD COLUMN     "passing_completions" INTEGER,
ADD COLUMN     "rushing_attempts" INTEGER;
