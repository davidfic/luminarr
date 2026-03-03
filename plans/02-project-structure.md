# Project Structure

## Module

    github.com/davidfic/luminarr

## Top-Level Layout

```
luminarr/
├── cmd/
│   └── luminarr/
│       └── main.go              # Entry point: parse config, wire deps, start server
│
├── internal/                    # Private application code — not importable externally
│   ├── api/                     # HTTP layer
│   ├── core/                    # Domain logic
│   ├── scheduler/               # Task scheduling
│   ├── db/                      # Database layer
│   ├── metadata/                # External metadata providers
│   ├── ai/                      # AI service layer
│   └── config/                  # Config loading and validation
│
├── pkg/                         # Public packages — the future plugin contract
│   └── plugin/                  # Plugin interfaces (indexer, downloader, notifier)
│
├── plugins/                     # Built-in plugin implementations
│   ├── indexers/
│   ├── downloaders/
│   └── notifications/
│
├── plans/                       # Architecture decision documents (this directory)
│
├── Makefile
├── sqlc.yaml
├── .golangci.yaml
├── config.example.yaml
└── docker/
    └── Dockerfile
```

---

## `internal/api/`

```
internal/api/
├── v1/
│   ├── movies.go            # GET/POST /api/v1/movies, GET/PUT/DELETE /api/v1/movies/{id}
│   ├── releases.go          # GET /api/v1/movies/{id}/releases, POST .../grab
│   ├── libraries.go         # Library management
│   ├── queue.go             # Download queue
│   ├── history.go           # Grab/import history
│   ├── indexers.go          # Indexer management
│   ├── download_clients.go  # Download client management
│   ├── quality_profiles.go  # Quality profile management
│   ├── notifications.go     # Notification management
│   ├── tasks.go             # Task status + manual trigger
│   ├── system.go            # Health, version, disk space
│   └── ws.go                # WebSocket upgrade + event hub
├── middleware/
│   ├── auth.go              # API key validation
│   ├── logging.go           # Request/response logging via slog
│   ├── recovery.go          # Panic recovery
│   └── cors.go              # CORS headers
└── router.go                # Route registration, middleware chain
```

---

## `internal/core/`

```
internal/core/
├── movie/
│   ├── service.go           # Add, remove, update, search TMDB, refresh metadata
│   └── service_test.go
├── quality/
│   ├── profile.go           # Quality profile definition and comparison logic
│   ├── parser.go            # Parse quality from release title (e.g. "BluRay.2160p")
│   └── parser_test.go
├── release/
│   ├── service.go           # Orchestrate search → score → filter → grab
│   ├── parser.go            # Parse release title into structured Release
│   └── parser_test.go
├── history/
│   └── service.go           # Record and query history events
├── importer/
│   ├── service.go           # Move/hardlink completed downloads into library
│   └── renamer.go           # Apply naming format to imported files
└── queue/
    └── service.go           # Track in-progress downloads, poll download clients
```

---

## `internal/scheduler/`

```
internal/scheduler/
├── scheduler.go             # Job registry, cron runner, manual trigger endpoint
└── jobs/
    ├── rss_sync.go          # Poll indexer RSS feeds for new releases
    ├── library_scan.go      # Scan library paths for untracked or missing files
    ├── refresh_metadata.go  # Re-fetch TMDB data for monitored movies
    └── queue_poll.go        # Poll download clients for completion
```

---

## `internal/db/`

```
internal/db/
├── db.go                    # Open connection, select driver (sqlite or postgres)
├── migrate.go               # Run goose migrations at startup
├── migrations/
│   ├── 00001_initial.sql
│   ├── 00002_libraries.sql
│   └── ...
├── queries/
│   ├── sqlite/
│   │   ├── movies.sql
│   │   ├── libraries.sql
│   │   ├── releases.sql
│   │   ├── history.sql
│   │   └── queue.sql
│   └── postgres/
│       ├── movies.sql       # Postgres-specific syntax where needed
│       └── ...
└── generated/               # sqlc output — committed to repo
    ├── models.go
    ├── querier.go           # Generated interface
    ├── sqlite/
    │   └── *.go
    └── postgres/
        └── *.go
```

---

## `pkg/plugin/`

```
pkg/plugin/
├── indexer.go               # Indexer interface + SearchQuery, Release, Capabilities types
├── downloader.go            # DownloadClient interface + QueueItem, DownloadStatus types
├── notification.go          # Notifier interface + Event types
└── types.go                 # Shared value types (Quality, Protocol, etc.)
```

These are public. When external gRPC plugins are added, they will implement these interfaces
from the outside — so the interface design is load-bearing from day one.

---

## `plugins/`

```
plugins/
├── indexers/
│   ├── torznab/             # Torznab protocol (Jackett, Prowlarr)
│   └── newznab/             # Newznab protocol (NZB indexers)
├── downloaders/
│   ├── qbittorrent/         # qBittorrent Web API
│   ├── transmission/        # Transmission RPC
│   ├── deluge/              # Deluge Web API
│   └── sabnzbd/             # SABnzbd API
└── notifications/
    ├── webhook/             # Generic HTTP webhook
    ├── discord/             # Discord webhook
    └── email/               # SMTP email
```

---

## `internal/metadata/`

```
internal/metadata/
└── tmdb/
    ├── client.go            # HTTP client for TMDB API
    ├── search.go            # Movie search
    ├── movie.go             # Movie detail fetch
    └── types.go             # TMDB response types
```

---

## `internal/ai/`

```
internal/ai/
├── service.go               # Service interface definition
├── claude.go                # Claude API implementation
├── noop.go                  # No-op implementation (no API key)
├── scorer.go                # Release scoring logic + prompt construction
├── matcher.go               # Title matching logic + prompt construction
└── filter.go                # Release filtering logic + prompt construction
```

---

## Naming Conventions

- Packages are lowercase, single word where possible
- No `util`, `helper`, `common` packages — functionality lives near where it's used
- Test files alongside the code they test (`_test.go`)
- Each `service.go` defines the primary type for that package as `Service`
- Interfaces are in `pkg/plugin/` (public) or at the top of the file that consumes them
