-- In-game win probability model, trained by ingest/live_model.py and evaluated by the API.
-- `model` holds the logistic coefficients, the gradient-boosted trees (LightGBM JSON dump) and the
-- weights that blend them; the API loads the newest row.
CREATE TABLE "live_models" (
  "id" SERIAL PRIMARY KEY,
  "version" TEXT NOT NULL,
  "model" JSONB NOT NULL,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
