-- +goose Up

-- Global media management settings (single enforced row).
CREATE TABLE media_management (
    id                       INTEGER PRIMARY KEY CHECK (id = 1),
    rename_movies            INTEGER NOT NULL DEFAULT 1,
    standard_movie_format    TEXT    NOT NULL DEFAULT '{Movie Title} ({Release Year}) {Quality Full}',
    movie_folder_format      TEXT    NOT NULL DEFAULT '{Movie Title} ({Release Year})',
    colon_replacement        TEXT    NOT NULL DEFAULT 'space-dash',
    import_extra_files       INTEGER NOT NULL DEFAULT 0,
    extra_file_extensions    TEXT    NOT NULL DEFAULT 'srt,nfo',
    unmonitor_deleted_movies INTEGER NOT NULL DEFAULT 0
);

INSERT INTO media_management (id) VALUES (1);

-- Per-library folder format override (complements the existing naming_format column).
ALTER TABLE libraries ADD COLUMN folder_format TEXT;

-- +goose Down
DROP TABLE media_management;
-- SQLite does not support DROP COLUMN on older versions; folder_format column is left.
