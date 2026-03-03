-- +goose Up

CREATE TABLE movies (
    id                      TEXT NOT NULL PRIMARY KEY,
    tmdb_id                 INTEGER NOT NULL UNIQUE,
    imdb_id                 TEXT,
    title                   TEXT NOT NULL,
    original_title          TEXT NOT NULL,
    year                    INTEGER NOT NULL,
    overview                TEXT NOT NULL DEFAULT '',
    runtime_minutes         INTEGER,
    -- JSON-encoded []string of genre names
    genres_json             TEXT NOT NULL DEFAULT '[]',
    poster_url              TEXT,
    fanart_url              TEXT,
    -- One of: announced, in_cinemas, released, wanted, downloading,
    --         downloaded, missing, unmonitored
    status                  TEXT NOT NULL DEFAULT 'announced',
    monitored               INTEGER NOT NULL DEFAULT 1,
    library_id              TEXT NOT NULL REFERENCES libraries(id),
    quality_profile_id      TEXT NOT NULL REFERENCES quality_profiles(id),
    -- Absolute path to the movie folder once imported; NULL until then
    path                    TEXT,
    added_at                TEXT NOT NULL,
    updated_at              TEXT NOT NULL,
    metadata_refreshed_at   TEXT
);

CREATE INDEX movies_tmdb_id    ON movies(tmdb_id);
CREATE INDEX movies_library_id ON movies(library_id);
CREATE INDEX movies_status     ON movies(status);
CREATE INDEX movies_monitored  ON movies(monitored);

CREATE TABLE movie_files (
    id           TEXT NOT NULL PRIMARY KEY,
    movie_id     TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    path         TEXT NOT NULL UNIQUE,
    size_bytes   INTEGER NOT NULL,
    -- JSON-encoded plugin.Quality
    quality_json TEXT NOT NULL,
    -- Optional edition label: "Extended Cut", "Theatrical", etc.
    edition      TEXT,
    imported_at  TEXT NOT NULL,
    -- Last time this file was confirmed to exist on disk
    indexed_at   TEXT NOT NULL
);

CREATE INDEX movie_files_movie_id ON movie_files(movie_id);

-- +goose Down

DROP INDEX IF EXISTS movie_files_movie_id;
DROP TABLE IF EXISTS movie_files;
DROP INDEX IF EXISTS movies_monitored;
DROP INDEX IF EXISTS movies_status;
DROP INDEX IF EXISTS movies_library_id;
DROP INDEX IF EXISTS movies_tmdb_id;
DROP TABLE IF EXISTS movies;
