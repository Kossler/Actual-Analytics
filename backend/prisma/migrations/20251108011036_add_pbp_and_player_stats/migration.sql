-- CreateTable
CREATE TABLE "Play" (
    "id" SERIAL NOT NULL,
    "game_id" TEXT NOT NULL,
    "play_id" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER,
    "game_date" TIMESTAMP(3),
    "play_type" TEXT,
    "passer_player_id" TEXT,
    "passer_player_name" TEXT,
    "passing_yards" INTEGER,
    "pass_attempt" BOOLEAN,
    "complete_pass" BOOLEAN,
    "rusher_player_id" TEXT,
    "rusher_player_name" TEXT,
    "rushing_yards" INTEGER,
    "rush_attempt" BOOLEAN,
    "receiver_player_id" TEXT,
    "receiver_player_name" TEXT,
    "receiving_yards" INTEGER,
    "yards_after_catch" INTEGER,
    "air_yards" INTEGER,
    "reception" BOOLEAN,
    "target" BOOLEAN,
    "pass_touchdown" BOOLEAN,
    "rush_touchdown" BOOLEAN,
    "receiving_touchdown" BOOLEAN,
    "posteam" TEXT,
    "defteam" TEXT,
    "down" INTEGER,
    "ydstogo" INTEGER,
    "yardline_100" INTEGER,
    "qtr" INTEGER,

    CONSTRAINT "Play_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "median_yards_per_pass_attempt" DOUBLE PRECISION,
    "median_yards_per_rushing_attempt" DOUBLE PRECISION,
    "median_yards_per_reception" DOUBLE PRECISION,

    CONSTRAINT "PlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Play_passer_player_id_idx" ON "Play"("passer_player_id");

-- CreateIndex
CREATE INDEX "Play_rusher_player_id_idx" ON "Play"("rusher_player_id");

-- CreateIndex
CREATE INDEX "Play_receiver_player_id_idx" ON "Play"("receiver_player_id");

-- CreateIndex
CREATE INDEX "Play_season_idx" ON "Play"("season");

-- CreateIndex
CREATE INDEX "Play_game_id_idx" ON "Play"("game_id");

-- CreateIndex
CREATE INDEX "PlayerStats_playerId_idx" ON "PlayerStats"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStats_playerId_season_key" ON "PlayerStats"("playerId", "season");

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_passer_player_id_fkey" FOREIGN KEY ("passer_player_id") REFERENCES "Player"("pfr_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_rusher_player_id_fkey" FOREIGN KEY ("rusher_player_id") REFERENCES "Player"("pfr_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Play" ADD CONSTRAINT "Play_receiver_player_id_fkey" FOREIGN KEY ("receiver_player_id") REFERENCES "Player"("pfr_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
