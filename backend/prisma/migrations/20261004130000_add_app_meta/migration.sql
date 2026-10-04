-- Key/value metadata written by the ingest. `data_version` is bumped at the end of every
-- ingest run; the API polls it to know when to drop its response cache.
CREATE TABLE IF NOT EXISTS "app_meta" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

INSERT INTO "app_meta" ("key", "value")
VALUES ('data_version', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
ON CONFLICT ("key") DO NOTHING;
