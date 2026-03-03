# Implementation Phases

Each phase produces a working, runnable binary. Nothing is scaffolded and left
half-done. Phases build on each other without breaking what came before.

---

## Phase 0 — Skeleton (infrastructure only)

**Goal**: A compiling, running binary with nothing but plumbing.

Deliverables:
- `go.mod` with all planned dependencies vendored
- `config/` — viper config loading, `config.example.yaml`
- `internal/db/` — SQLite + Postgres connection, goose migrations, first schema
- `internal/api/` — Chi router, auth middleware, `/api/v1/system/status` endpoint
- `internal/events/` — event bus
- `Makefile` — build, run, test, lint, generate targets
- `.golangci.yaml` — linting config
- `sqlc.yaml` — query generation config
- `docker/Dockerfile` — distroless container build
- `air.toml` — hot reload config for development

At the end of Phase 0: `make run` starts a server, `curl /api/v1/system/status` returns JSON.

---

## Phase 1 — Core Domain

**Goal**: Movies and libraries can be managed. Metadata comes from TMDB.

Deliverables:
- `internal/metadata/tmdb/` — TMDB API client (search, movie detail, images)
- `internal/core/movie/` — Movie service (add, list, get, update, delete, refresh)
- `internal/core/quality/` — Quality profile CRUD + quality value parsing
- DB schema: `movies`, `libraries`, `quality_profiles`, `movie_files`
- API endpoints:
  - `GET/POST /api/v1/movies`
  - `GET/PUT/DELETE /api/v1/movies/{id}`
  - `POST /api/v1/movies/lookup`
  - `GET/POST/PUT/DELETE /api/v1/libraries`
  - `GET /api/v1/libraries/{id}/stats`
  - `GET/POST/PUT/DELETE /api/v1/quality-profiles`
- WebSocket hub (connected, no events yet)

At the end of Phase 1: A user can add movies to libraries via the API, metadata is
fetched from TMDB, movies appear in the list.

---

## Phase 2 — Indexer + Manual Search

**Goal**: Search for releases manually. Evaluate and grab them.

Deliverables:
- `pkg/plugin/` — Indexer, DownloadClient, Notifier interfaces + shared types
- `internal/registry/` — Plugin registry with init() registration pattern
- `plugins/indexers/torznab/` — Torznab protocol implementation
- `plugins/indexers/newznab/` — Newznab protocol implementation
- `internal/core/release/` — Release parser (title → quality), search orchestration
- `internal/core/quality/` — Parser: parse quality from scene title strings
- DB schema: `indexer_configs`, `grab_history`
- API endpoints:
  - `GET/POST/PUT/DELETE /api/v1/indexers`
  - `POST /api/v1/indexers/{id}/test`
  - `GET /api/v1/movies/{id}/releases`
  - `POST /api/v1/movies/{id}/releases/{guid}/grab` (without a download client yet — stub)

At the end of Phase 2: A user can configure Prowlarr/Jackett, search for a movie's
releases manually, and see scored/sorted results. The grab endpoint is stubbed.

---

## Phase 3 — Download Clients + Queue

**Goal**: Grab releases for real. Monitor download progress.

Deliverables:
- `plugins/downloaders/qbittorrent/` — qBittorrent Web API integration
- `plugins/downloaders/transmission/` — Transmission RPC integration
- `plugins/downloaders/sabnzbd/` — SABnzbd API integration
- `internal/core/queue/` — Queue service (poll download clients, update status)
- `internal/scheduler/` — Scheduler with cron runner
- `internal/scheduler/jobs/queue_poll.go` — Poll download clients every 60s
- DB schema: `download_client_configs`
- API endpoints:
  - `GET/POST/PUT/DELETE /api/v1/download-clients`
  - `POST /api/v1/download-clients/{id}/test`
  - `GET /api/v1/queue`
  - `DELETE /api/v1/queue/{id}`
- WebSocket events: `grab_started`, `download_progress`, `download_done`

At the end of Phase 3: Full manual grab-to-download workflow works end-to-end.

---

## Phase 4 — Import + File Management

**Goal**: Completed downloads are imported into the library automatically.

Deliverables:
- `internal/core/importer/` — Move/hardlink files into library path
- `internal/core/renamer/` — Apply naming format template to imported files
- `internal/scheduler/jobs/queue_poll.go` — Trigger import when download completes
- `internal/scheduler/jobs/library_scan.go` — Scan library for existing files
- Library scan API: `POST /api/v1/libraries/{id}/scan`
- WebSocket events: `import_complete`, `import_failed`

Naming format variables:
```
{Movie Title}     → Inception
{Movie CleanTitle} → Inception
{Release Year}    → 2010
{Quality Full}    → Bluray-1080p
{MediaInfo VideoCodec} → x265
{Original Title}  → Inception
```

At the end of Phase 4: A complete movie management workflow works. Manual grab →
download → auto-import → renamed file in library.

---

## Phase 5 — Automation (RSS Sync)

**Goal**: Luminarr monitors for releases automatically without user intervention.

Deliverables:
- `internal/scheduler/jobs/rss_sync.go` — Poll indexer RSS, match to monitored movies, auto-grab
- Quality upgrade logic — re-grab if better quality found and upgrade allowed
- `internal/scheduler/jobs/refresh_metadata.go` — Refresh TMDB metadata periodically
- Task management API: `GET /api/v1/tasks`, `POST /api/v1/tasks/{name}/run`
- WebSocket events: `task_started`, `task_finished`

RSS sync flow:
```
For each enabled indexer:
  → Fetch recent releases
  → For each release:
      → Parse quality from title
      → Match to a monitored movie
      → Check: does the movie want a file? Or is this an upgrade?
      → If yes: grab it
```

At the end of Phase 5: Luminarr runs unattended. Add a movie, it downloads automatically
when a release appears.

---

## Phase 6 — AI Features

**Goal**: AI-assisted release matching, scoring, and filtering.

Deliverables:
- `internal/ai/service.go` — Service interface
- `internal/ai/noop.go` — No-op implementation (already used in Phase 2+)
- `internal/ai/claude.go` — Claude API implementation
- `internal/ai/scorer.go`, `matcher.go`, `filter.go` — Prompt construction + response parsing
- Config: `ai.api_key`, `ai.match_model`, `ai.score_model`
- AI scores surfaced in release search results via API
- API: `GET /api/v1/system/status` includes `ai_enabled: true/false`

At the end of Phase 6: Release search results include AI scores. RSS sync uses AI filtering.
Users without an API key see no behavior change.

---

## Phase 7 — Notifications + Health

**Goal**: Users get notified. System issues are surfaced.

Deliverables:
- `plugins/notifications/webhook/`
- `plugins/notifications/discord/`
- `plugins/notifications/email/`
- `internal/notifications/dispatcher.go`
- `internal/core/health/` — Health checks (disk space, download client connectivity, indexer reachability)
- API: `GET/POST/PUT/DELETE /api/v1/notifications`, `POST .../test`
- API: `GET /api/v1/system/health`
- WebSocket events: `health_issue`, `health_ok`

At the end of Phase 7: Near parity with Radarr's feature set. Project is usable as a
daily driver.

---

## Phase 8 — Polish + Docs

**Goal**: Production-ready.

Deliverables:
- OpenAPI docs served at `/api/docs`
- `config.example.yaml` with every option documented
- Docker image in CI/CD (GitHub Actions)
- README with quickstart, configuration reference
- Integration test suite (test against a real SQLite + mock download client)
- Deluge download client plugin
- Radarr config import utility (migration helper)

---

## What We're NOT Building (Yet)

- User interface (consuming applications can be built against the API)
- External gRPC plugins (interface-ready, transport deferred)
- Multi-user auth (API key only for now)
- Custom indexer scripting
- Movie collection management (Trakt/Letterboxd sync)

These are all feasible given the architecture — they're just out of scope for near-parity.
