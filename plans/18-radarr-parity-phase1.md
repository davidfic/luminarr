# Phase 18 — Radarr Parity Phase 1

Implements the seven Tier 1 features from `plans/17-radarr-parity.md`.
Each feature includes backend, API, frontend, and tests.

**Reference gap analysis:** `plans/17-radarr-parity.md`

---

## Overview

| Feature | Backend | API | Frontend | Tests |
|---|---|---|---|---|
| Blocklist | new service + migration | 4 endpoints | Settings page | unit + integration |
| Wanted page | 2 new SQL queries | 2 endpoints | Wanted page (2 tabs) | unit + integration |
| Minimum availability | migration + field | movie CRUD update | Add/Edit movie dropdowns | unit |
| Manual search UI | none | already exists | Modal per movie | — |
| Per-movie history | 1 new SQL query | 1 new endpoint | History tab in movie panel | integration |
| Movie file management | 1 new SQL query | 2 endpoints | Files section in movie panel | integration |
| Calendar view | none | none | Calendar page | — |

---

## 1. Blocklist

### Migration (`internal/db/migrations/00007_blocklist.sql`)

```sql
-- +goose Up
CREATE TABLE IF NOT EXISTS blocklist (
    id              TEXT PRIMARY KEY,
    movie_id        TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    release_guid    TEXT NOT NULL,
    release_title   TEXT NOT NULL,
    indexer_id      TEXT,
    protocol        TEXT NOT NULL DEFAULT '',
    size            INTEGER NOT NULL DEFAULT 0,
    added_at        DATETIME NOT NULL,
    notes           TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_blocklist_movie_id     ON blocklist(movie_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocklist_guid  ON blocklist(release_guid);

-- +goose Down
DROP TABLE IF EXISTS blocklist;
```

### sqlc queries (`internal/db/queries/sqlite/blocklist.sql`)

```sql
-- name: CreateBlocklistEntry :one
INSERT INTO blocklist (id, movie_id, release_guid, release_title, indexer_id,
    protocol, size, added_at, notes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING *;

-- name: IsBlocklisted :one
SELECT COUNT(*) FROM blocklist WHERE release_guid = ?;

-- name: ListBlocklist :many
SELECT b.*, m.title AS movie_title
FROM blocklist b JOIN movies m ON m.id = b.movie_id
ORDER BY b.added_at DESC
LIMIT ? OFFSET ?;

-- name: CountBlocklist :one
SELECT COUNT(*) FROM blocklist;

-- name: DeleteBlocklistEntry :exec
DELETE FROM blocklist WHERE id = ?;

-- name: ClearBlocklist :exec
DELETE FROM blocklist;
```

After adding, run `sqlc generate`.

### Service (`internal/core/blocklist/service.go`)

```go
type Entry struct {
    ID           string
    MovieID      string
    MovieTitle   string  // joined from movies
    ReleaseGUID  string
    ReleaseTitle string
    IndexerID    string
    Protocol     string
    Size         int64
    AddedAt      time.Time
    Notes        string
}

type Service struct { q *db.Queries }

func (s *Service) Add(ctx, movieID, releaseGUID, releaseTitle, indexerID, protocol string, size int64) error
func (s *Service) IsBlocklisted(ctx context.Context, releaseGUID string) (bool, error)
func (s *Service) List(ctx context.Context, page, perPage int) ([]Entry, int64, error)
func (s *Service) Delete(ctx context.Context, id string) error
func (s *Service) Clear(ctx context.Context) error
```

### Grab pipeline integration

In `internal/core/indexer/service.go` (wherever grab is called):
- Before dispatching: call `blocklistSvc.IsBlocklisted(ctx, release.GUID)` — return
  `ErrBlocklisted` if true
- On grab failure (download client returns error): call `blocklistSvc.Add(...)` with notes="grab failed"

`IndexerService` needs a `*blocklist.Service` injected at construction.

### API (`internal/api/v1/blocklist.go`)

```
GET  /api/v1/blocklist         — list (page, per_page query params)
DELETE /api/v1/blocklist/{id}  — delete one
DELETE /api/v1/blocklist       — clear all
```

Register in `router.go` under `RegisterBlocklistRoutes(humaAPI, cfg.BlocklistService)`.

### Frontend

`src/pages/settings/blocklist/BlocklistPage.tsx`

- Table: movie title, release title, indexer, size, date added, notes, delete button
- "Clear All" button in header
- Pagination
- Sidebar nav: Settings → Blocklist

### Tests

**Unit tests** (`internal/core/blocklist/service_test.go`):
- `TestAdd` — adds entry, IsBlocklisted returns true for same GUID
- `TestIsBlocklisted_false` — unknown GUID returns false
- `TestDelete` — delete removes entry, IsBlocklisted returns false
- `TestClear` — clear empties table
- `TestList_pagination` — correct page behaviour

**Integration tests** (`internal/api/v1/blocklist_test.go`):
- `TestListBlocklist` — GET returns 200 with correct JSON shape
- `TestDeleteBlocklistEntry` — DELETE returns 204
- `TestClearBlocklist` — DELETE /blocklist returns 204, subsequent GET returns empty

---

## 2. Wanted Page

### SQL queries (add to `internal/db/queries/sqlite/movies.sql`)

```sql
-- name: ListMonitoredMoviesWithoutFile :many
SELECT m.*
FROM movies m
LEFT JOIN movie_files mf ON mf.movie_id = m.id
WHERE m.monitored = 1
  AND mf.id IS NULL
ORDER BY m.title ASC
LIMIT ? OFFSET ?;

-- name: CountMonitoredMoviesWithoutFile :one
SELECT COUNT(*)
FROM movies m
LEFT JOIN movie_files mf ON mf.movie_id = m.id
WHERE m.monitored = 1
  AND mf.id IS NULL;
```

Cutoff-unmet requires joining with quality_profiles; implement as a Go-side filter to
avoid complex SQL across a JSON column:

```sql
-- name: ListMoviesWithFiles :many
SELECT m.*, mf.quality_json, qp.cutoff_json
FROM movies m
JOIN movie_files mf ON mf.movie_id = m.id
JOIN quality_profiles qp ON qp.id = m.quality_profile_id
WHERE m.monitored = 1
ORDER BY m.title ASC;
```

Service-side: unmarshal `quality_json` and `cutoff_json`, compare resolution rank, filter
movies where file quality rank < cutoff rank.

After adding queries, run `sqlc generate`.

### Service methods (add to `internal/core/movie/service.go`)

```go
func (s *Service) ListMissing(ctx context.Context, page, perPage int) ([]Movie, int64, error)
func (s *Service) ListCutoffUnmet(ctx context.Context) ([]Movie, error)
```

### API (`internal/api/v1/wanted.go`)

```
GET /api/v1/wanted/missing?page=&per_page=   — missing monitored movies
GET /api/v1/wanted/cutoff?page=&per_page=    — cutoff-unmet monitored movies
```

Register in `router.go` under `RegisterWantedRoutes(humaAPI, cfg.MovieService)`.

### Frontend

`src/pages/wanted/WantedPage.tsx`

- Two tabs: "Missing" and "Cutoff Unmet"
- Movie list with: poster, title, year, quality profile, library
- "Search" button per movie (calls existing grab pipeline via existing manual search modal — see §4)
- Pagination
- Sidebar nav: "Wanted" between Movies and Queue

### Tests

**Unit tests** (`internal/core/movie/service_wanted_test.go`):
- `TestListMissing` — movies without files appear; movies with files do not
- `TestListCutoffUnmet` — movie with quality below cutoff appears; movie at or above does not
- `TestListMissing_onlyMonitored` — unmonitored movies without files do not appear

**Integration tests** (`internal/api/v1/wanted_test.go`):
- `TestWantedMissing` — GET returns correct movies
- `TestWantedCutoff` — GET returns correct movies

---

## 3. Minimum Availability

### Migration (`internal/db/migrations/00008_minimum_availability.sql`)

```sql
-- +goose Up
ALTER TABLE movies
    ADD COLUMN minimum_availability TEXT NOT NULL DEFAULT 'released';

-- +goose Down
-- SQLite does not support DROP COLUMN on older versions; leave as-is or recreate table.
```

Valid values: `tba`, `announced`, `in_cinemas`, `released`
(matches TMDB status values loosely)

After migration, run `sqlc generate` — `GetMovie`, `ListMovies`, etc. will include the new column.

### Domain model updates

`internal/core/movie/movie.go`:
```go
type MinimumAvailability string
const (
    MinAvailTBA        MinimumAvailability = "tba"
    MinAvailAnnounced  MinimumAvailability = "announced"
    MinAvailInCinemas  MinimumAvailability = "in_cinemas"
    MinAvailReleased   MinimumAvailability = "released"
)

// Add to Movie struct:
MinimumAvailability MinimumAvailability

// Add to AddRequest / UpdateRequest:
MinimumAvailability MinimumAvailability
```

### Scheduler integration

In the scheduled search loop (wherever `ListMonitoredMovies` is used):
- Fetch the movie's TMDB `status` field (from `movies.status` column)
- Map status → effective availability: `"Rumored"/"Planned"` → tba, `"In Production"/"Post Production"` → announced, `"Released"` → released
- Skip movie if effective availability < movie.minimum_availability

### API

`movie.AddRequest` and `movie.UpdateRequest` already flow through the existing movie endpoints.
Just add the field — no new endpoints needed.

### Frontend

In `LibraryImportModal` (Add Movie) and `LibraryModal` (Edit Movie):
- Add a `<select>` for "Minimum Availability": TBA / Announced / In Cinemas / Released
- Default: Released

### Tests

**Unit tests** (`internal/core/movie/minimum_availability_test.go`):
- `TestIsEligibleForSearch` — table-driven test covering all 4×4 combos of
  effective availability vs minimum_availability setting
- `TestAddMovieWithMinAvailability` — new movie has correct field persisted
- `TestUpdateMovieMinAvailability` — update changes the field

---

## 4. Manual Search UI (frontend only)

No new backend work needed. Endpoints:
- `GET /api/v1/movies/{id}/releases` — search all indexers for a movie
- `POST /api/v1/releases/grab` — grab a specific release

### Frontend

`src/components/ManualSearchModal.tsx`

Props: `{ movieId: string; movieTitle: string; onClose: () => void }`

Behaviour:
- Opens with a loading state while fetching `/movies/{id}/releases`
- Table columns: Title, Quality, Size, Age (days), Indexer, Seeds/Peers, Grab button
- Sortable by: Quality score (desc default), Size, Age
- Grab button: shows spinner while in flight; shows ✓ on success; shows error toast on failure
- Close button / ESC to dismiss

Integration points:
- Movie detail panel: "Manual Search" button (existing or new)
- Wanted page rows: "Search" button → opens this modal

### Tests

No new backend tests (API already tested). Frontend is interaction-only — manual smoke test.

---

## 5. Per-Movie History

### SQL query (add to `internal/db/queries/sqlite/movies.sql`)

```sql
-- name: ListGrabHistoryByMovie :many
SELECT * FROM grab_history
WHERE movie_id = ?
ORDER BY grabbed_at DESC
LIMIT ? OFFSET ?;

-- name: CountGrabHistoryByMovie :one
SELECT COUNT(*) FROM grab_history WHERE movie_id = ?;
```

Run `sqlc generate` after adding.

### API (`internal/api/v1/movies.go` or new `history_movie.go`)

```
GET /api/v1/movies/{id}/history?page=&per_page=
```

Returns paginated `GrabHistory` records for the given movie. Response shape mirrors
the existing `/api/v1/history` endpoint.

Register alongside existing movie routes.

### Frontend

In the movie detail panel (wherever it lives — `MovieCard`, `MovieDetailPanel`, or similar):
- Add a "History" tab
- Fetch `/movies/{id}/history` on tab activation
- Table: grabbed_at, release_title, quality, indexer, status, size

### Tests

**Integration test** (`internal/api/v1/movie_history_test.go`):
- `TestMovieHistory_empty` — GET returns 200 with empty array when no history
- `TestMovieHistory_entries` — seed grab_history rows for a movie, GET returns them in desc order

---

## 6. Movie File Management

### SQL query (add to `internal/db/queries/sqlite/movies.sql`)

`ListMovieFiles` already exists:
```sql
-- name: ListMovieFiles :many
SELECT * FROM movie_files WHERE movie_id = ? ORDER BY imported_at DESC;
```

`DeleteMovieFile` already exists:
```sql
-- name: DeleteMovieFile :exec
DELETE FROM movie_files WHERE id = ?;
```

No new SQL needed. Run `sqlc generate` if anything was changed.

### Service method (add to `internal/core/movie/service.go`)

```go
// DeleteFile removes the movie_files record. If deleteFromDisk is true,
// also removes the file at the stored path. Resets movies.path and movies.status
// to "" / "wanted" if no files remain.
func (s *Service) DeleteFile(ctx context.Context, fileID string, deleteFromDisk bool) error
```

Logic:
1. Get movie_files record by fileID
2. If deleteFromDisk: `os.Remove(file.Path)` — log error but don't fail the operation
3. `DeleteMovieFile(ctx, fileID)`
4. Check if any remaining movie_files for that movie_id exist
5. If none: `UpdateMoviePath(ctx, movieID, "")` + `UpdateMovieStatus(ctx, movieID, "wanted")`

### API

```
GET    /api/v1/movies/{id}/files            — list files for a movie
DELETE /api/v1/movies/{id}/files/{fileId}   — delete file record (+ optionally from disk)
```

Query param for DELETE: `?delete_from_disk=true` (default: false)

### Frontend

In the movie detail panel:
- "Files" section (below metadata)
- Table: path (truncated), size, quality, imported date, delete button (trash icon)
- Delete button: confirm dialog "Also delete from disk?" with checkbox; submits with correct query param

### Tests

**Unit tests** (`internal/core/movie/service_files_test.go`):
- `TestDeleteFile_dbOnly` — removes DB record, file still exists on disk
- `TestDeleteFile_fromDisk` — removes DB record and calls os.Remove
- `TestDeleteFile_resetMovieStatus` — after last file deleted, movie status = "wanted", path = ""
- `TestDeleteFile_multipleFiles` — when other files remain, movie status/path unchanged

**Integration tests** (`internal/api/v1/movie_files_test.go`):
- `TestListMovieFiles` — GET returns correct file records
- `TestDeleteMovieFile` — DELETE returns 204, file no longer in list

---

## 7. Calendar View (frontend only)

No new backend work. Uses existing movie data including `release_date` from TMDB metadata.

The `Movie` type already has all needed fields. The frontend fetches all movies via the
existing paginated endpoint, or we add a lightweight endpoint for calendar-optimized queries.

### Frontend

`src/pages/calendar/CalendarPage.tsx`

- Monthly calendar grid (standard 7-column layout)
- Each cell: movie poster thumbnail + title for movies releasing on that date
- Color coding:
  - Green border: movie has a file
  - Yellow border: monitored, no file
  - Grey: unmonitored
- Navigation: prev/next month buttons
- Click a movie → opens the existing movie detail panel
- Sidebar nav: "Calendar" between Dashboard and Movies

Implementation note: `release_date` is stored as a string from TMDB. Parse and
filter in the frontend — no server-side date filtering needed for typical collection sizes.

### Tests

No new backend tests. Frontend: manual smoke test.

---

## Implementation Order

Recommended order (respects dependencies):

1. **Minimum availability** — DB migration first; unblocks correct "eligible for search" logic
2. **Blocklist** — DB migration + service; integrate into grab pipeline
3. **Movie file management** — only needs existing DB queries + a new service method
4. **Per-movie history** — one SQL query + one endpoint
5. **Wanted page** — needs minimum availability to filter correctly
6. **Manual search UI** — frontend only; depends on nothing new in backend
7. **Calendar view** — frontend only, independent

---

## Test Tooling

All backend tests use the existing helpers:
- `internal/testutil.NewTestDB(t)` — in-memory SQLite with migrations applied
- `internal/testutil.NewTestDBWithSQL(t, sql)` — pre-seed with data

Pattern:
```go
func TestFoo(t *testing.T) {
    db := testutil.NewTestDB(t)
    svc := NewService(db)
    // ... exercise svc methods, assert results
}
```

API integration tests use `httptest.NewRecorder` + the huma test helpers already established
in `internal/api/v1/*_test.go` files.

---

## On Parallel Test Writing

A background test-writing subagent is **partially useful** here:

**Good fit (parallel):** Self-contained unit tests for pure-logic components that don't
depend on exact final API shapes:
- `internal/core/blocklist/service_test.go` — tests CRUD logic, no API coupling
- `internal/core/movie/minimum_availability_test.go` — tests availability ranking logic
- `internal/core/movie/service_files_test.go` — tests DeleteFile state machine

**Bad fit (sequential):** Integration/API tests that must match the exact handler response
shapes, and any test that requires knowing the final field names in request/response structs.
These should be written after the handlers are finalized in the main thread.

**Conclusion:** Spin up a background unit-test agent only for the pure-logic service tests
listed above, after the service interfaces are locked. Do not delegate API integration tests.
