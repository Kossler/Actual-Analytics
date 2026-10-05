-- The version (ETag) of each nflverse file as of its last successful load. The ingest compares
-- these against the published files and reloads only the tables whose files changed.
CREATE TABLE "source_files" (
  "url" TEXT PRIMARY KEY,
  "table_name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "loaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
