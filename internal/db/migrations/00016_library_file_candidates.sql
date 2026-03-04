-- +goose Up
CREATE TABLE library_file_candidates (
    library_id           TEXT    NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    file_path            TEXT    NOT NULL,
    file_size            INTEGER NOT NULL DEFAULT 0,
    parsed_title         TEXT    NOT NULL DEFAULT '',
    parsed_year          INTEGER NOT NULL DEFAULT 0,
    tmdb_id              INTEGER NOT NULL DEFAULT 0,
    tmdb_title           TEXT    NOT NULL DEFAULT '',
    tmdb_year            INTEGER NOT NULL DEFAULT 0,
    tmdb_original_title  TEXT    NOT NULL DEFAULT '',
    auto_matched         INTEGER NOT NULL DEFAULT 0,
    scanned_at           TEXT    NOT NULL,
    matched_at           TEXT,
    PRIMARY KEY (library_id, file_path)
);

-- +goose Down
DROP TABLE library_file_candidates;
