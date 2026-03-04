-- +goose Up

-- Global download handling settings (single enforced row).
CREATE TABLE download_handling (
    id                            INTEGER PRIMARY KEY CHECK (id = 1),
    enable_completed              INTEGER NOT NULL DEFAULT 1,
    check_interval_minutes        INTEGER NOT NULL DEFAULT 1,
    redownload_failed             INTEGER NOT NULL DEFAULT 1,
    redownload_failed_interactive INTEGER NOT NULL DEFAULT 0
);

INSERT INTO download_handling (id) VALUES (1);

-- Remote path mappings: translate download-client paths to local paths.
CREATE TABLE remote_path_mappings (
    id          TEXT NOT NULL PRIMARY KEY,
    host        TEXT NOT NULL,
    remote_path TEXT NOT NULL,
    local_path  TEXT NOT NULL
);

-- +goose Down
DROP TABLE remote_path_mappings;
DROP TABLE download_handling;
