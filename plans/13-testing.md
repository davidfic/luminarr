# Testing Strategy

## Philosophy

This codebase is AI-assisted. That means tests are not optional — they are the
mechanism by which a human can verify the code actually works. Every piece of
non-trivial logic has a test. Tests are written alongside the code, not after.

**Goals:**
- A passing test suite means the code works, not just that it compiles
- Tests document intended behaviour — they are readable specifications
- External dependencies (TMDB, indexers, Claude API) are mocked so tests run offline
- Real SQLite with seed data tests the full database layer, not mocked queries

---

## Two Test Tiers

### Tier 1: Unit Tests

Test individual functions and types in isolation. External dependencies replaced with
mocks or fakes. Fast — the full unit suite should run in under 10 seconds.

**What gets unit-tested:**
- Quality parser (`internal/core/quality/parser.go`) — the most critical parser in the system
- Release title parser (`internal/core/release/parser.go`)
- Release scoring rules (`internal/ai/noop.go` fallback logic)
- File renaming template engine (`internal/core/importer/renamer.go`)
- Quality comparison and upgrade logic (`internal/core/quality/profile.go`)
- Library disk-space threshold logic
- Event bus fanout behaviour
- HTTP middleware (auth, logging, recovery)
- Config loading and validation
- `Secret` type behaviour (never leaks via String, JSON, log)

### Tier 2: Integration Tests

Test a real slice of the stack against a real SQLite database. These exercise the
DB layer (sqlc queries, migrations) and service layer together with actual data.

**What gets integration-tested:**
- All database queries (via a real SQLite, not mocks)
- Movie service: add, update, delete, status transitions
- Library service: create, stats, scan trigger
- Grab history: record, query, status update
- Quality profile: create, assign, compare
- Queue service: poll, import trigger
- Full HTTP API handlers (using `httptest.NewServer`)

Integration tests are in `_test` packages (black-box) and use a shared test helper
that sets up a fresh SQLite database with seed data.

---

## Test File Layout

```
internal/core/quality/
├── parser.go
├── parser_test.go          # unit tests for parser
├── profile.go
└── profile_test.go         # unit tests for profile logic

internal/core/movie/
├── service.go
├── service_test.go         # unit tests with mocked DB + mocked TMDB
└── service_integration_test.go  # integration tests with real SQLite

internal/api/v1/
├── movies.go
└── movies_test.go          # HTTP handler tests via httptest

internal/db/
└── integration_test.go     # all query tests against real SQLite
```

---

## Test Helpers and Fixtures

### `internal/testutil/` — shared test infrastructure

```
internal/testutil/
├── db.go          # Open a test SQLite DB, run migrations, return Querier
├── fixtures.go    # Seed functions: SeedMovie(), SeedLibrary(), SeedQualityProfile()
├── assert.go      # Small assertion helpers (not a full framework dependency)
└── mock/
    ├── tmdb.go        # Mock TMDB client
    ├── indexer.go     # Mock plugin.Indexer
    ├── downloader.go  # Mock plugin.DownloadClient
    ├── notifier.go    # Mock plugin.Notifier
    └── ai.go          # Mock ai.Service
```

### Database Test Helper

```go
// internal/testutil/db.go

// NewTestDB creates a fresh in-memory SQLite database with all migrations applied.
// Each call returns an independent database — tests do not share state.
func NewTestDB(t *testing.T) db.Querier {
    t.Helper()
    // Use ":memory:" for speed, or a temp file if WAL is needed
    sqlDB, err := sql.Open("sqlite", ":memory:")
    require.NoError(t, err)
    t.Cleanup(func() { sqlDB.Close() })

    err = db.RunMigrations(sqlDB, "sqlite")
    require.NoError(t, err)

    return dbsqlite.New(sqlDB)
}
```

### Seed Functions

```go
// internal/testutil/fixtures.go

// SeedQualityProfile inserts a quality profile and returns it.
func SeedQualityProfile(t *testing.T, q db.Querier) db.QualityProfile {
    t.Helper()
    // ... insert with known values
}

// SeedLibrary inserts a library with a default quality profile.
func SeedLibrary(t *testing.T, q db.Querier) db.Library {
    t.Helper()
    profile := SeedQualityProfile(t, q)
    // ... insert library referencing profile
}

// SeedMovie inserts a movie into a seeded library.
func SeedMovie(t *testing.T, q db.Querier, opts ...MovieOption) db.Movie {
    t.Helper()
    lib := SeedLibrary(t, q)
    // ... insert movie with sensible defaults, allow overrides via opts
}
```

Options pattern for overrides:
```go
type MovieOption func(*CreateMovieParams)

func WithStatus(s MovieStatus) MovieOption { ... }
func WithMonitored(m bool) MovieOption { ... }
func WithTMDBID(id int) MovieOption { ... }
```

---

## Mock Design

Mocks are hand-written, not generated. They are simple and readable.

```go
// internal/testutil/mock/indexer.go

type MockIndexer struct {
    SearchFunc    func(ctx context.Context, q plugin.SearchQuery) ([]plugin.Release, error)
    GetRecentFunc func(ctx context.Context) ([]plugin.Release, error)
    Calls         []string  // tracks which methods were called, for assertions
}

func (m *MockIndexer) Search(ctx context.Context, q plugin.SearchQuery) ([]plugin.Release, error) {
    m.Calls = append(m.Calls, "Search")
    if m.SearchFunc != nil {
        return m.SearchFunc(ctx, q)
    }
    return nil, nil
}
```

No mock generation frameworks (mockery, gomock). Hand-written mocks are transparent
and don't require a build step.

---

## Test Naming and Structure

Tests follow the standard Go table-driven pattern:

```go
func TestQualityParser_Parse(t *testing.T) {
    tests := []struct {
        name    string
        input   string
        want    quality.Quality
        wantErr bool
    }{
        {
            name:  "bluray 1080p x265",
            input: "Movie.2010.1080p.BluRay.x265-GROUP",
            want:  quality.Quality{Resolution: quality.Resolution1080p, Source: quality.SourceBluRay, Codec: quality.CodecX265},
        },
        {
            name:  "webdl 2160p HDR10",
            input: "Movie.2010.2160p.WEB-DL.x265.HDR10-GROUP",
            want:  quality.Quality{Resolution: quality.Resolution2160p, Source: quality.SourceWEBDL, HDR: quality.HDRHDR10},
        },
        {
            name:  "scene shorthand",
            input: "Movie.2010.TDK.BluRay-GROUP",
            want:  quality.Quality{Resolution: quality.ResolutionUnknown, Source: quality.SourceBluRay},
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := quality.Parse(tt.input)
            if tt.wantErr {
                require.Error(t, err)
                return
            }
            require.NoError(t, err)
            require.Equal(t, tt.want, got)
        })
    }
}
```

---

## Release Parser Test Coverage

The release title parser is the most critical unit in the system. A wrong parse
means wrong grabs. Its test suite is comprehensive and serves as the authoritative
spec for supported release title formats.

Radarr's parser has been battle-tested against thousands of real scene release titles.
We study their approach and build a test corpus from real-world examples before writing
the parser. **Tests first, parser second.**

Test corpus categories:
- Standard HD/UHD BluRay releases
- WEB-DL and WEBRip releases (Netflix, Disney+, Amazon)
- Remux releases
- HDTV releases
- Releases with HDR metadata (HDR10, Dolby Vision, HLG)
- Releases with codec variants (x264, x265, AV1)
- Releases with edition info (Extended, Theatrical, Director's Cut)
- Releases with PROPER/REPACK flags
- Ambiguous / low-information titles
- Non-English titles and special characters
- Known-bad patterns (CAM, TS, HDCAM)

---

## API Handler Tests

HTTP handlers are tested using `net/http/httptest`:

```go
func TestMoviesHandler_Create(t *testing.T) {
    q := testutil.NewTestDB(t)
    tmdb := &mock.TMDBClient{...}
    svc := movie.NewService(q, tmdb, events.NewBus())
    router := api.NewRouter(svc, ...)

    body := `{"tmdb_id": 27205, "library_id": "..."}`
    req := httptest.NewRequest(http.MethodPost, "/api/v1/movies", strings.NewReader(body))
    req.Header.Set("X-Api-Key", "test-key")
    req.Header.Set("Content-Type", "application/json")

    w := httptest.NewRecorder()
    router.ServeHTTP(w, req)

    require.Equal(t, http.StatusCreated, w.Code)

    var got api.MovieResponse
    require.NoError(t, json.Unmarshal(w.Body.Bytes(), &got))
    require.Equal(t, 27205, got.TMDBId)
}
```

---

## Running Tests

```makefile
# Makefile

test:           ## Run all tests
    go test ./...

test/unit:      ## Run unit tests only (fast)
    go test -short ./...

test/integration: ## Run integration tests (requires SQLite)
    go test -run Integration ./...

test/cover:     ## Run tests with coverage report
    go test -coverprofile=coverage.out ./...
    go tool cover -html=coverage.out -o coverage.html

test/race:      ## Run tests with race detector
    go test -race ./...
```

The CI pipeline runs `test/race` on every pull request. Race conditions in a concurrent
app are treated as bugs.

---

## Coverage Expectations

These are minimums, not targets. Higher is better.

| Package               | Minimum coverage |
|-----------------------|-----------------|
| `core/quality`        | 95%             |
| `core/release`        | 90%             |
| `core/importer`       | 85%             |
| `internal/ai`         | 80%             |
| `internal/api/v1`     | 80%             |
| `internal/db`         | 90% (via integration tests) |
| `plugins/indexers`    | 75%             |
| `plugins/downloaders` | 75%             |

Coverage numbers are checked in CI. PRs that significantly reduce coverage are flagged.

---

## What We Don't Test

- Third-party library internals (Chi routing, sqlc generated code, slog)
- TMDB API itself (we trust them; we test our client wrapper)
- Network-dependent paths in unit tests (all mocked)
- `main.go` wiring (tested implicitly by integration tests against the running server)
