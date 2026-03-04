-- +goose Up
-- +goose NO TRANSACTION
--
-- Replace the column-level UNIQUE constraint on tmdb_id with a partial unique
-- index that only enforces uniqueness for non-zero values. This allows multiple
-- "unmatched" movie records (tmdb_id = 0) to coexist for files added without a
-- TMDB match.

PRAGMA foreign_keys = OFF;

CREATE TABLE movies_new (
    id                      TEXT NOT NULL PRIMARY KEY,
    tmdb_id                 INTEGER NOT NULL DEFAULT 0,
    imdb_id                 TEXT,
    title                   TEXT NOT NULL,
    original_title          TEXT NOT NULL,
    year                    INTEGER NOT NULL,
    overview                TEXT NOT NULL DEFAULT '',
    runtime_minutes         INTEGER,
    genres_json             TEXT NOT NULL DEFAULT '[]',
    poster_url              TEXT,
    fanart_url              TEXT,
    status                  TEXT NOT NULL DEFAULT 'announced',
    monitored               INTEGER NOT NULL DEFAULT 1,
    library_id              TEXT NOT NULL REFERENCES libraries(id),
    quality_profile_id      TEXT NOT NULL REFERENCES quality_profiles(id),
    path                    TEXT,
    added_at                TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    metadata_refreshed_at   TEXT,
    minimum_availability    TEXT NOT NULL DEFAULT 'released',
    release_date            TEXT NOT NULL DEFAULT ''
);

INSERT INTO movies_new SELECT * FROM movies;

DROP TABLE movies;

ALTER TABLE movies_new RENAME TO movies;

-- Partial unique index: only one row per non-zero tmdb_id.
CREATE UNIQUE INDEX movies_tmdb_id_unique ON movies(tmdb_id) WHERE tmdb_id != 0;
CREATE INDEX movies_library_id            ON movies(library_id);
CREATE INDEX movies_status                ON movies(status);
CREATE INDEX movies_monitored             ON movies(monitored);

PRAGMA foreign_keys = ON;

-- +goose Down
-- +goose NO TRANSACTION
--
-- Restore the original column-level UNIQUE. Unmatched rows (tmdb_id = 0) are
-- deleted first because the constraint cannot accommodate duplicates.

PRAGMA foreign_keys = OFF;

DELETE FROM movies WHERE tmdb_id = 0;

CREATE TABLE movies_old (
    id                      TEXT NOT NULL PRIMARY KEY,
    tmdb_id                 INTEGER NOT NULL UNIQUE,
    imdb_id                 TEXT,
    title                   TEXT NOT NULL,
    original_title          TEXT NOT NULL,
    year                    INTEGER NOT NULL,
    overview                TEXT NOT NULL DEFAULT '',
    runtime_minutes         INTEGER,
    genres_json             TEXT NOT NULL DEFAULT '[]',
    poster_url              TEXT,
    fanart_url              TEXT,
    status                  TEXT NOT NULL DEFAULT 'announced',
    monitored               INTEGER NOT NULL DEFAULT 1,
    library_id              TEXT NOT NULL REFERENCES libraries(id),
    quality_profile_id      TEXT NOT NULL REFERENCES quality_profiles(id),
    path                    TEXT,
    added_at                TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    metadata_refreshed_at   TEXT,
    minimum_availability    TEXT NOT NULL DEFAULT 'released',
    release_date            TEXT NOT NULL DEFAULT ''
);

INSERT INTO movies_old SELECT * FROM movies;

DROP TABLE movies;

ALTER TABLE movies_old RENAME TO movies;

CREATE INDEX movies_tmdb_id   ON movies(tmdb_id);
CREATE INDEX movies_library_id ON movies(library_id);
CREATE INDEX movies_status     ON movies(status);
CREATE INDEX movies_monitored  ON movies(monitored);

PRAGMA foreign_keys = ON;
