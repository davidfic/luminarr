-- +goose Up

CREATE TABLE IF NOT EXISTS download_client_configs (
    id          TEXT PRIMARY KEY,
    name        TEXT    NOT NULL,
    kind        TEXT    NOT NULL,           -- "qbittorrent", "transmission", etc.
    enabled     INTEGER NOT NULL DEFAULT 1,
    priority    INTEGER NOT NULL DEFAULT 25,
    settings    TEXT    NOT NULL DEFAULT '{}', -- JSON: url, username, password, etc.
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- Track download progress in grab_history.
-- Existing rows (Phase 2 grabs with no client) get sensible defaults.
-- The queue service filters by client_item_id IS NOT NULL to exclude them.
ALTER TABLE grab_history ADD COLUMN download_status  TEXT    NOT NULL DEFAULT 'queued';
ALTER TABLE grab_history ADD COLUMN downloaded_bytes INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_grab_history_status ON grab_history(download_status);

-- +goose Down

DROP INDEX IF EXISTS idx_grab_history_status;
-- SQLite does not support DROP COLUMN in older versions; columns are left in place on downgrade.
DROP TABLE IF EXISTS download_client_configs;
