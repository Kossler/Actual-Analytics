-- Season award models (ingest/award_model.py): one fitted model per award, retrained when a new
-- season completes, with its leave-one-season-out backtest in metrics.
CREATE TABLE "award_models" (
  "id" SERIAL PRIMARY KEY,
  "version" TEXT NOT NULL,
  "model" JSONB NOT NULL,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Award probabilities after each week of the season: the top candidates per award, with the stats
-- shown next to them. Kept for every week so the page can show how the races moved.
CREATE TABLE "award_predictions" (
  "season" INTEGER NOT NULL,
  "week" INTEGER NOT NULL,
  "award" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "player_id" TEXT,
  "name" TEXT NOT NULL,
  "team" TEXT,
  "position" TEXT,
  "probability" DOUBLE PRECISION NOT NULL,
  "stats" JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY ("season", "week", "award", "rank")
);
