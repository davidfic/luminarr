-- +goose Up
ALTER TABLE movies
    ADD COLUMN release_date TEXT NOT NULL DEFAULT '';

-- +goose Down
-- SQLite does not support DROP COLUMN in all versions; leave as-is.
