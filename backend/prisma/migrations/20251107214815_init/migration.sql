-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "pfr_id" TEXT,
    "name" TEXT NOT NULL,
    "team" TEXT,
    "position" TEXT,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameStat" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER,
    "gameDate" TIMESTAMP(3),
    "passingYds" INTEGER,
    "rushingYds" INTEGER,
    "receivingYds" INTEGER,
    "targets" INTEGER,
    "receptions" INTEGER,
    "attempts" INTEGER,
    "rushing_tds" INTEGER,
    "receiving_tds" INTEGER,

    CONSTRAINT "GameStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_pfr_id_key" ON "Player"("pfr_id");

-- CreateIndex
CREATE INDEX "GameStat_playerId_idx" ON "GameStat"("playerId");

-- CreateIndex
CREATE INDEX "GameStat_season_idx" ON "GameStat"("season");

-- AddForeignKey
ALTER TABLE "GameStat" ADD CONSTRAINT "GameStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
