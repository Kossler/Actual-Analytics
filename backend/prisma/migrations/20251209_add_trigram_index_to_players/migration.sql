-- Enable pg_trgm extension and add trigram index for fast substring search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS players_display_name_trgm_idx ON players USING gin (display_name gin_trgm_ops);