-- +goose Up

CREATE TABLE IF NOT EXISTS indexer_configs (
    id          TEXT PRIMARY KEY,
    name        TEXT    NOT NULL,
    kind        TEXT    NOT NULL,           -- "torznab", "newznab"
    enabled     INTEGER NOT NULL DEFAULT 1,
    priority    INTEGER NOT NULL DEFAULT 25,
    settings    TEXT    NOT NULL DEFAULT '{}', -- JSON: url, api_key, etc.
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS grab_history (
    id                  TEXT    PRIMARY KEY,
    movie_id            TEXT    NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    indexer_id          TEXT,               -- NULL if indexer was deleted
    release_guid        TEXT    NOT NULL,
    release_title       TEXT    NOT NULL,
    release_source      TEXT    NOT NULL DEFAULT 'unknown',
    release_resolution  TEXT    NOT NULL DEFAULT 'unknown',
    release_codec       TEXT    NOT NULL DEFAULT 'unknown',
    release_hdr         TEXT    NOT NULL DEFAULT 'none',
    protocol            TEXT    NOT NULL DEFAULT 'unknown',
    size                INTEGER NOT NULL DEFAULT 0,
    download_client_id  TEXT,               -- NULL until Phase 3
    client_item_id      TEXT,               -- NULL until Phase 3
    grabbed_at          TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grab_history_movie_id ON grab_history(movie_id);
CREATE INDEX IF NOT EXISTS idx_grab_history_grabbed_at ON grab_history(grabbed_at DESC);

-- +goose Down

DROP INDEX IF EXISTS idx_grab_history_grabbed_at;
DROP INDEX IF EXISTS idx_grab_history_movie_id;
DROP TABLE IF EXISTS grab_history;
DROP TABLE IF EXISTS indexer_configs;
