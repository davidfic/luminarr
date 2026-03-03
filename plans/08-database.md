# Database Strategy

## Driver Selection

Selected at startup based on `database.driver` config value.

```yaml
# SQLite (default)
database:
  driver: sqlite
  path: ~/.config/luminarr/luminarr.db

# PostgreSQL (optional)
database:
  driver: postgres
  dsn: "postgres://user:pass@localhost:5432/luminarr?sslmode=require"
```

The application layer uses a `db.Querier` interface — it never knows which driver is
underneath.

---

## Why sqlc

sqlc reads SQL query files and generates type-safe Go code. Benefits:

- SQL is explicit and reviewable — no ORM magic
- Generated code is plain Go, readable by anyone
- Compile-time type checking of query results
- No N+1 query footguns
- Easy to write performant queries (EXPLAIN ANALYZE, indexes)

The cost: two sets of query files (SQLite and Postgres dialects differ in small ways).
This is manageable. The generated interfaces are identical.

---

## Project Layout

```
internal/db/
├── db.go                        # Open connection, return Querier
├── migrate.go                   # Run goose migrations at startup
├── migrations/                  # Shared SQL migrations (dialect-compatible where possible)
│   ├── 00001_initial.sql
│   ├── 00002_libraries.sql
│   ├── 00003_ai_fields.sql
│   └── ...
├── queries/
│   ├── sqlite/
│   │   ├── movies.sql
│   │   ├── movie_files.sql
│   │   ├── libraries.sql
│   │   ├── quality_profiles.sql
│   │   ├── grab_history.sql
│   │   ├── queue.sql
│   │   ├── indexers.sql
│   │   ├── download_clients.sql
│   │   ├── notifications.sql
│   │   └── tasks.sql
│   └── postgres/
│       └── ...                  # Same files, Postgres-specific syntax overrides
└── generated/
    ├── models.go                # Shared struct definitions
    ├── querier.go               # Generated interface (same for both drivers)
    ├── sqlite/
    │   └── db.go, queries.go   # SQLite implementation
    └── postgres/
        └── db.go, queries.go   # Postgres implementation
```

`sqlc.yaml` defines two targets (sqlite, postgres) generating into their respective
`generated/` subdirectories.

---

## Schema Design

### Key Conventions

- UUIDs as primary keys (TEXT in SQLite, UUID type in Postgres)
- All timestamps stored as UTC (TEXT in SQLite, TIMESTAMPTZ in Postgres)
- JSON blobs for plugin settings, genres, tags (TEXT in SQLite, JSONB in Postgres)
- Soft deletes are NOT used — records are hard deleted
- No nullable FKs where avoidable (prefer sentinel values or separate junction tables)

### Core Tables

```sql
-- migrations/00001_initial.sql

CREATE TABLE quality_profiles (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    cutoff_json         TEXT NOT NULL,     -- Quality JSON
    qualities_json      TEXT NOT NULL,     -- []Quality JSON
    upgrade_allowed     INTEGER NOT NULL DEFAULT 1,
    upgrade_until_json  TEXT,              -- Quality JSON, nullable
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE libraries (
    id                          TEXT PRIMARY KEY,
    name                        TEXT NOT NULL,
    root_path                   TEXT NOT NULL,
    default_quality_profile_id  TEXT NOT NULL REFERENCES quality_profiles(id),
    naming_format               TEXT,
    min_free_space_gb           INTEGER NOT NULL DEFAULT 5,
    tags_json                   TEXT NOT NULL DEFAULT '[]',
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);

CREATE TABLE movies (
    id                      TEXT PRIMARY KEY,
    tmdb_id                 INTEGER NOT NULL UNIQUE,
    imdb_id                 TEXT,
    title                   TEXT NOT NULL,
    original_title          TEXT NOT NULL,
    year                    INTEGER NOT NULL,
    overview                TEXT NOT NULL DEFAULT '',
    runtime                 INTEGER,
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
    metadata_refreshed_at   TEXT
);

CREATE INDEX movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX movies_library_id ON movies(library_id);
CREATE INDEX movies_status ON movies(status);

CREATE TABLE movie_files (
    id              TEXT PRIMARY KEY,
    movie_id        TEXT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    path            TEXT NOT NULL UNIQUE,
    size            INTEGER NOT NULL,
    quality_json    TEXT NOT NULL,
    edition         TEXT,
    imported_at     TEXT NOT NULL,
    indexed_at      TEXT NOT NULL
);

CREATE INDEX movie_files_movie_id ON movie_files(movie_id);

CREATE TABLE grab_history (
    id                      TEXT PRIMARY KEY,
    movie_id                TEXT NOT NULL REFERENCES movies(id),
    release_title           TEXT NOT NULL,
    indexer                 TEXT NOT NULL,
    protocol                TEXT NOT NULL,
    quality_json            TEXT NOT NULL,
    size                    INTEGER NOT NULL,
    download_client_id      TEXT,
    client_item_id          TEXT,
    status                  TEXT NOT NULL DEFAULT 'grabbed',
    failure_reason          TEXT,
    ai_score                INTEGER,
    grabbed_at              TEXT NOT NULL,
    completed_at            TEXT
);

CREATE INDEX grab_history_movie_id ON grab_history(movie_id);
CREATE INDEX grab_history_status ON grab_history(status);

CREATE TABLE indexer_configs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    plugin      TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    priority    INTEGER NOT NULL DEFAULT 25,
    settings    TEXT NOT NULL DEFAULT '{}',
    tags_json   TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL
);

CREATE TABLE download_client_configs (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    plugin      TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    protocol    TEXT NOT NULL,
    priority    INTEGER NOT NULL DEFAULT 1,
    settings    TEXT NOT NULL DEFAULT '{}',
    tags_json   TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL
);

CREATE TABLE notification_configs (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    plugin          TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    on_grab         INTEGER NOT NULL DEFAULT 1,
    on_import       INTEGER NOT NULL DEFAULT 1,
    on_failure      INTEGER NOT NULL DEFAULT 1,
    on_health_issue INTEGER NOT NULL DEFAULT 0,
    settings        TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL
);

CREATE TABLE task_state (
    name                TEXT PRIMARY KEY,
    last_started_at     TEXT,
    last_finished_at    TEXT,
    last_duration_ms    INTEGER,
    last_status         TEXT NOT NULL DEFAULT 'idle',
    last_error          TEXT
);
```

---

## Migrations with goose

```go
// internal/db/migrate.go

//go:embed migrations/*.sql
var migrationsFS embed.FS

func RunMigrations(db *sql.DB, driver string) error {
    goose.SetBaseFS(migrationsFS)
    if err := goose.SetDialect(driver); err != nil {
        return err
    }
    return goose.Up(db, "migrations")
}
```

Migrations run at startup, before the HTTP server starts. The application refuses
to start if migrations fail.

---

## sqlc Configuration

```yaml
# sqlc.yaml
version: "2"
sql:
  - engine: "sqlite"
    queries: "internal/db/queries/sqlite"
    schema: "internal/db/migrations"
    gen:
      go:
        package: "dbsqlite"
        out: "internal/db/generated/sqlite"
        emit_interface: true

  - engine: "postgresql"
    queries: "internal/db/queries/postgres"
    schema: "internal/db/migrations"
    gen:
      go:
        package: "dbpostgres"
        out: "internal/db/generated/postgres"
        emit_interface: true
```

---

## Querier Interface (generated by sqlc)

Both generated packages implement the same `Querier` interface. `internal/db/db.go`
returns a `Querier` — callers don't import the driver-specific package directly.

```go
// internal/db/db.go

type Querier interface {
    CreateMovie(ctx context.Context, arg CreateMovieParams) (Movie, error)
    GetMovie(ctx context.Context, id string) (Movie, error)
    GetMovieByTMDBID(ctx context.Context, tmdbID int64) (Movie, error)
    ListMovies(ctx context.Context, arg ListMoviesParams) ([]Movie, error)
    UpdateMovie(ctx context.Context, arg UpdateMovieParams) (Movie, error)
    DeleteMovie(ctx context.Context, id string) error
    // ... all other queries
}

func Open(cfg Config) (Querier, *sql.DB, error) {
    switch cfg.Driver {
    case "sqlite":
        // open modernc sqlite, run migrations, return sqlite Querier
    case "postgres":
        // open pgx stdlib, run migrations, return postgres Querier
    default:
        return nil, nil, fmt.Errorf("unknown database driver: %s", cfg.Driver)
    }
}
```

---

## Performance Notes

- SQLite: WAL mode enabled by default (`PRAGMA journal_mode=WAL`) for concurrent reads
- SQLite: `PRAGMA synchronous=NORMAL` — faster writes, still crash-safe
- SQLite: `PRAGMA foreign_keys=ON` — enforce FK constraints
- SQLite: `PRAGMA busy_timeout=5000` — wait up to 5s on lock contention
- Connection pooling: SQLite uses `SetMaxOpenConns(1)` (single writer), `SetMaxIdleConns(10)` for readers via WAL
- Postgres: pgx connection pool, configured via `pool_min_conns` / `pool_max_conns` in DSN
