# Luminarr — Build Status

## Phase 0 — Skeleton ✓ COMPLETE

All infrastructure in place. `make run` starts the server.

### What's built
- `internal/config/` — viper config loading, `Secret` type, API key generation
- `internal/logging/` — slog (JSON/text, configurable level)
- `internal/events/` — in-process event bus
- `internal/db/` — SQLite (WAL) + Postgres connection, goose migrations
- `internal/api/` — Chi router, huma OpenAPI, auth/logging/recovery middleware
- `internal/api/v1/system.go` — `GET /api/v1/system/status`
- `cmd/luminarr/main.go` — wires everything, graceful shutdown
- `PRIVACY.md`, `config.example.yaml`, `Makefile`, `Dockerfile`, `air.toml`

### Verified working
- `/health` → 200 (no auth)
- `/api/v1/system/status` → 401 without key, 200 with key
- `/api/docs` → Scalar UI (huma auto-generated)
- Env var override: `LUMINARR_AUTH_API_KEY` etc.
- SQLite WAL mode, migrations idempotent on restart
- Graceful SIGTERM shutdown
- 6/6 config unit tests passing

### Known decisions made
- Manual DI (no framework)
- `Secret` type requires `BindEnv` + decode hook for viper (documented in load.go)
- Go 1.21.6 on this machine (go1.25.0 runtime via toolchain)

---

## Phase 1 — Core Domain ✓ COMPLETE

### What's built
- `pkg/plugin/types.go` — Quality, Resolution, Source, Codec, HDR value types + Score/BetterThan/AtLeast
- `internal/core/quality/` — Parser (56 tests), Profile logic (25 tests), CRUD Service
- `internal/core/library/` — Library Service with disk stats via syscall.Statfs
- `internal/core/movie/` — Movie Service with MetadataProvider interface
- `internal/metadata/tmdb/` — TMDB API client (8 tests, httptest mocks)
- `internal/testutil/` — NewTestDB / NewTestDBWithSQL helpers (2 isolation tests)
- DB migrations 00002 (quality_profiles, libraries) + 00003 (movies, movie_files)
- sqlc generated code: `internal/db/generated/sqlite/`
- API handlers: quality-profiles, libraries, movies (all CRUD + stats + lookup + refresh)

### Verified working (smoke test)
- POST /api/v1/quality-profiles → 201 with full JSON body
- POST /api/v1/libraries → 201 with created_at/updated_at
- GET /api/v1/libraries/{id}/stats → disk free bytes, movie count, health status
- DELETE quality profile in use → 409 Conflict
- DELETE library → 204; DELETE now-unused profile → 204
- Movie endpoints return 503 when TMDB not configured (correct graceful degradation)
- All migrations idempotent, run on startup

### Test coverage
- config: 6 tests | quality: 81 tests | library: ~10 tests
- movie: 10 tests | tmdb: 8 tests | testutil: 2 tests
- Total: **117+ tests, all passing**

### Key design decisions
- `movie.MetadataProvider` interface (not concrete `*tmdb.Client`) enables test mocking
- Quality parser: source detected before resolution (DVD → SD inference)
- Tags stored as JSON arrays in DB TEXT columns; marshaled at service boundary
- Library stats: FreeSpaceBytes = -1 when syscall.Statfs unavailable

---

## Phase 2 — Indexer + Manual Search ✓ COMPLETE

### What's built
- `pkg/plugin/indexer.go` — Indexer interface (Search, GetRecent, Capabilities, Test)
- `pkg/plugin/downloader.go` — DownloadClient interface (Add, Status, GetQueue, Remove, Test)
- `pkg/plugin/notification.go` — Notifier interface + NotificationEvent type
- `internal/registry/` — Plugin registry with `New()` constructor + `Default` singleton; `init()` registration pattern
- `plugins/indexers/torznab/` — Torznab protocol (Prowlarr/Jackett); XML parsing with correct namespace URIs; RFC1123Z pubDate fallback
- `plugins/indexers/newznab/` — Newznab protocol (NZBHydra2); same feed shape, NZB protocol
- `internal/core/indexer/` — Indexer service: CRUD, fan-out search with concurrent goroutines, quality parsing, result sorting
- DB migration 00004: `indexer_configs` + `grab_history` tables
- sqlc queries: indexer CRUD + grab history
- API handlers: `GET/POST/PUT/DELETE /api/v1/indexers`, `POST .../test`, `GET /api/v1/movies/{id}/releases`, `POST .../releases/{guid}/grab`

### Key design decisions
- `registry.New()` constructor prevents nil map panic; `Default` uses it
- Torznab XML namespace: `http://torznab.com/schemas/2015/feed` (URI, not prefix) — Go's encoding/xml ignores prefix
- Newznab XML namespace: `http://www.newznab.com/DTD/2010/feeds/attributes/`
- `torznab:attr name="size"` preferred over enclosure `length` (aggregators sometimes get enclosure wrong)
- Search fans out concurrently to all enabled indexers; partial results returned if some fail
- Quality parsed from release title by indexer service (not the plugin itself)
- Grab endpoint stubbed (records to grab_history, no download client yet — Phase 3)
- `bus` nil-guarded in Grab() for testability

### Test coverage
- indexer service: 15 tests | torznab: 10 tests | newznab: 10 tests
- Total across all phases: **165+ tests, all passing**

---

## Phase 3 — Download Clients + Queue ✓ COMPLETE

### What's built
- `pkg/plugin/downloader.go` — DownloadClient interface (unchanged from Phase 2 skeleton)
- `internal/registry/` — extended with `RegisterDownloader` / `NewDownloader` / `DownloaderKinds`
- `plugins/downloaders/qbittorrent/` — qBittorrent Web API v2 client (auth, add magnet/URL, queue, status, remove)
- `internal/core/downloader/` — CRUD service for download_client_configs + `Add()` (finds first compatible enabled client)
- `internal/core/queue/` — `GetQueue`, `RemoveFromQueue`, `PollAndUpdate` (polls clients, updates grab_history status, fires events)
- `internal/scheduler/` — interval-based background scheduler
- `internal/scheduler/jobs/queue_poll.go` — polls every 60s, logs task start/finish per plan
- DB migration 00005: `download_client_configs` table + `download_status` / `downloaded_bytes` columns on `grab_history`
- sqlc generated: `DownloadClientConfig` model + full CRUD + `ListActiveGrabs`, `UpdateGrabStatus`, `MarkGrabRemoved`, etc.
- API handlers: `GET/POST/PUT/DELETE /api/v1/download-clients`, `POST .../test`, `GET /api/v1/queue`, `DELETE /api/v1/queue/{id}`
- Grab endpoint now submits to a download client before recording history; returns 503 if no compatible client configured

### Verified working (build + unit tests)
- All existing tests pass (no regressions)
- qBittorrent plugin: 8/8 tests covering auth, add (magnet), get-queue, status, remove, state mapping
- Full build clean

### Key design decisions
- Plugin extensibility: adding any new download client = implement `plugin.DownloadClient`, register in `init()`, blank-import in `main.go`
- Settings stored as opaque JSON per client (same pattern as indexers)
- Queue status cached in grab_history (avoids separate table); poller keeps it fresh every 60s
- `GrabHistoryStatus` defaults to `"queued"` for Phase 2 rows; queue service filters by `client_item_id IS NOT NULL`
- Scheduler uses simple `time.Ticker` goroutines (no external cron dependency)
- `.torrent` URL hash identification: magnet links parsed deterministically; HTTP URLs use recently-added heuristic (see TODO.md)

### Test coverage
- qbittorrent plugin: 8 tests
- All prior tests unchanged and passing
- Total: **173+ tests, all passing**

---

## Phase 4 — Import + File Management ✓ COMPLETE

### What's built
- `pkg/plugin/downloader.go` — added `ContentPath string` to `QueueItem`
- `plugins/downloaders/qbittorrent/` — populated `ContentPath` from qBittorrent's `content_path` field; fallback to `save_path + "/" + name` when empty
- `internal/core/quality/parser.go` — exported `BuildName()` for use by importer
- `internal/core/renamer/` — template-based filename/folder generation (`Apply`, `FolderName`, `CleanTitle`, `DestPath`); 8 tests
- `internal/core/importer/` — event-driven import service: subscribes to `TypeDownloadDone`, resolves source file (single file or largest-video-in-dir), hardlinks (falls back to copy+delete on cross-filesystem), creates `movie_files` record, updates movie status/path, fires `TypeImportComplete`/`TypeImportFailed`; 4 tests
- `internal/core/library/service.go` — added `Scan()` method: walks tracked movie files, updates `indexed_at` for present files, marks movies "missing" for absent files
- `internal/core/queue/service.go` — `TypeDownloadDone` event now includes `content_path` from the download client's `QueueItem`
- `internal/scheduler/jobs/library_scan.go` — library scan job (24h interval, scans all libraries)
- `internal/api/v1/libraries.go` — added `POST /api/v1/libraries/{id}/scan` endpoint (202 Accepted, async)
- DB queries: `GetGrabByID`, `ListMovieFilesByLibrary`, `GetMovieFileByPath` (sqlc-generated)
- `cmd/luminarr/main.go` — wires importer service + library scan job into startup

### Verified working
- Full `go build ./...` — clean
- `go test ./...` — all tests pass

### Key design decisions
- Importer subscribes to bus (decoupled from queue service)
- Hardlink preferred for zero-copy on same filesystem; falls back to io.Copy + os.Remove cross-filesystem
- Content path resolution: single video file used directly; directory → walk and pick largest video file
- Quality name reconstructed from grab_history fields via `quality.BuildName()`
- Library scan is idempotent; runs every 24h via scheduler + available on-demand via API
- `POST /api/v1/libraries/{id}/scan` returns 202 immediately; scan runs in background goroutine

### Test coverage
- renamer: 8 tests | importer: 4 tests | qbittorrent: 8 tests (updated)
- Total: **185+ tests, all passing**

---

## Phase 5 — Automation (RSS Sync) ⏳ PENDING
## Phase 6 — AI Features ⏳ PENDING
## Phase 7 — Notifications + Health ⏳ PENDING
## Phase 8 — Polish + Docs ⏳ PENDING

---

## Key Files Reference

| What | Where |
|---|---|
| Architecture plans | `plans/00-overview.md` … `plans/13-testing.md` |
| Config struct | `internal/config/config.go` |
| Secret type | `internal/config/secret.go` |
| Event types | `internal/events/bus.go` |
| Plugin interfaces | `pkg/plugin/indexer.go`, `downloader.go`, `notification.go` |
| Plugin registry | `internal/registry/registry.go` |
| Torznab plugin | `plugins/indexers/torznab/` |
| Newznab plugin | `plugins/indexers/newznab/` |
| Indexer service | `internal/core/indexer/service.go` |
| Importer service | `internal/core/importer/importer.go` |
| Renamer | `internal/core/renamer/renamer.go` |
| Scheduler jobs | `internal/scheduler/jobs/` |
| DB migrations | `internal/db/migrations/` |
| sqlc queries | `internal/db/queries/sqlite/` |
| API router | `internal/api/router.go` |
| Example config | `config.example.yaml` |
