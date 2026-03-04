-- +goose Up
ALTER TABLE quality_definitions ADD COLUMN preferred_size REAL NOT NULL DEFAULT 0;

-- Seed preferred = max_size (prefer the highest quality within the acceptable range).
-- Rows with max_size = 0 (no limit) keep preferred_size = 0.
UPDATE quality_definitions SET preferred_size = max_size WHERE max_size > 0;

-- +goose Down
-- SQLite ALTER TABLE DROP COLUMN requires SQLite >= 3.35.0.
-- Leave as no-op for maximum compatibility; the column is simply unused when rolled back.
