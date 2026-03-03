-- +goose Up

CREATE TABLE quality_profiles (
    id                  TEXT NOT NULL PRIMARY KEY,
    name                TEXT NOT NULL,
    -- JSON-encoded plugin.Quality (cutoff quality for this profile)
    cutoff_json         TEXT NOT NULL DEFAULT '{}',
    -- JSON-encoded []plugin.Quality (allowed qualities, highest preferred first)
    qualities_json      TEXT NOT NULL DEFAULT '[]',
    upgrade_allowed     INTEGER NOT NULL DEFAULT 1,
    -- JSON-encoded plugin.Quality, NULL means no upgrade ceiling
    upgrade_until_json  TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE libraries (
    id                          TEXT NOT NULL PRIMARY KEY,
    name                        TEXT NOT NULL,
    root_path                   TEXT NOT NULL,
    default_quality_profile_id  TEXT NOT NULL REFERENCES quality_profiles(id),
    -- Optional override for the global naming format template
    naming_format               TEXT,
    -- Warn and pause grabs when free space (GB) drops below this value
    min_free_space_gb           INTEGER NOT NULL DEFAULT 5,
    -- JSON-encoded []string of tags
    tags_json                   TEXT NOT NULL DEFAULT '[]',
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);

-- +goose Down

DROP TABLE IF EXISTS libraries;
DROP TABLE IF EXISTS quality_profiles;
