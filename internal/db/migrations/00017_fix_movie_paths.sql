-- +goose Up
-- Backfill movies.path with the full file path from movie_files.
-- Previously, movies.path stored filepath.Dir(filePath) (the parent directory).
-- Now it stores the full file path. This migration picks the most recently
-- imported movie_file for each movie that has a non-empty path.
UPDATE movies
SET path = (
    SELECT mf.path
    FROM movie_files mf
    WHERE mf.movie_id = movies.id
    ORDER BY mf.imported_at DESC
    LIMIT 1
)
WHERE path IS NOT NULL AND path != '';

-- +goose Down
-- No-op: reverting a path format change is not worth the complexity.
SELECT 1;
