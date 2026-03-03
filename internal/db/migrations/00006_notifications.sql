-- +goose Up

CREATE TABLE IF NOT EXISTS notification_configs (
    id         TEXT PRIMARY KEY,
    name       TEXT    NOT NULL,
    kind       TEXT    NOT NULL,           -- "webhook", "discord", "email"
    enabled    INTEGER NOT NULL DEFAULT 1,
    settings   TEXT    NOT NULL DEFAULT '{}', -- JSON: plugin-specific settings
    on_events  TEXT    NOT NULL DEFAULT '[]', -- JSON array of event type strings
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);

-- +goose Down

DROP TABLE IF EXISTS notification_configs;
