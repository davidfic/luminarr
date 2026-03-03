# API Design

## Principles

- REST for all CRUD operations
- All routes under `/api/v1/` — versioned from day one
- JSON request/response bodies
- OpenAPI 3.1 spec auto-generated via huma
- Authentication: `X-Api-Key` header (single key, configured in `config.yaml`)
- WebSocket at `/api/v1/ws` for real-time event streaming
- Errors follow RFC 9457 Problem Details format

## Authentication

Every request must include:
```
X-Api-Key: <configured api key>
```

The API key is configured in `config.yaml` or `LUMINARR_API_KEY` env var.
On first startup, a key is generated and printed to the log.

One exception: `GET /api/v1/system/status` may be unauthenticated for health checks
(configurable, default: requires auth).

---

## Error Format (RFC 9457)

```json
{
  "type": "https://luminarr.app/errors/not-found",
  "title": "Movie not found",
  "status": 404,
  "detail": "No movie with id '550e8400-e29b-41d4-a716-446655440000' exists.",
  "instance": "/api/v1/movies/550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Endpoint Reference

### Movies

```
GET    /api/v1/movies
  Query: ?library_id=<uuid>&monitored=true&status=wanted&tags=4k&q=inception&page=1&per_page=50
  Response: { movies: [...], total: 342, page: 1, per_page: 50 }

POST   /api/v1/movies
  Body: { tmdb_id: 155, library_id: "<uuid>", quality_profile_id: "<uuid>", monitored: true }
  Response: Movie

GET    /api/v1/movies/{id}
  Response: Movie (with files, latest history entries)

PUT    /api/v1/movies/{id}
  Body: partial Movie fields (monitored, quality_profile_id, library_id, tags)
  Response: Movie

DELETE /api/v1/movies/{id}
  Query: ?delete_files=false
  Response: 204 No Content

GET    /api/v1/movies/{id}/releases
  Query: ?force_search=false  (false = use cache; true = query indexers now)
  Response: { releases: [...], cached: true, cached_at: "..." }

POST   /api/v1/movies/{id}/releases/{release_guid}/grab
  Response: { grab_id: "<uuid>", message: "Release sent to download client" }

POST   /api/v1/movies/lookup
  Body: { query: "inception" } OR { tmdb_id: 27205 }
  Response: [ TMDBMovieResult, ... ]  (not yet added to library)

GET    /api/v1/movies/{id}/history
  Response: [ GrabHistory, ... ]

POST   /api/v1/movies/{id}/refresh
  Response: 202 Accepted (triggers metadata refresh job)
```

### Libraries

```
GET    /api/v1/libraries
  Response: [ Library, ... ]

POST   /api/v1/libraries
  Body: { name, root_path, default_quality_profile_id, min_free_space_gb, naming_format, tags }
  Response: Library

GET    /api/v1/libraries/{id}
  Response: Library

PUT    /api/v1/libraries/{id}
  Body: partial Library fields
  Response: Library

DELETE /api/v1/libraries/{id}
  Note: does NOT delete movie records or files. Movies become library-less.
  Response: 204 No Content

GET    /api/v1/libraries/{id}/stats
  Response: { movie_count: 142, total_size_bytes: 4398046511104, free_space_bytes: 1234567890, health: "ok" }

POST   /api/v1/libraries/{id}/scan
  Response: 202 Accepted

GET    /api/v1/libraries/{id}/movies
  Response: [ Movie, ... ]  (same shape as /movies with library filter applied)
```

### Quality Profiles

```
GET    /api/v1/quality-profiles
  Response: [ QualityProfile, ... ]

POST   /api/v1/quality-profiles
  Body: { name, cutoff, qualities: [...], upgrade_allowed, upgrade_until }
  Response: QualityProfile

GET    /api/v1/quality-profiles/{id}
  Response: QualityProfile

PUT    /api/v1/quality-profiles/{id}
  Response: QualityProfile

DELETE /api/v1/quality-profiles/{id}
  Response: 204 No Content (fails if profile is in use)
```

### Indexers

```
GET    /api/v1/indexers
  Response: [ IndexerConfig (settings redacted), ... ]

POST   /api/v1/indexers
  Body: { name, plugin: "torznab", enabled: true, priority: 1, settings: {...}, tags: [] }
  Response: IndexerConfig

GET    /api/v1/indexers/{id}
  Response: IndexerConfig

PUT    /api/v1/indexers/{id}
  Response: IndexerConfig

DELETE /api/v1/indexers/{id}
  Response: 204 No Content

POST   /api/v1/indexers/{id}/test
  Response: { ok: true } or { ok: false, error: "connection refused" }

GET    /api/v1/indexers/schema/{plugin}
  Response: JSON Schema for the plugin's settings object
```

### Download Clients

```
GET    /api/v1/download-clients
POST   /api/v1/download-clients
GET    /api/v1/download-clients/{id}
PUT    /api/v1/download-clients/{id}
DELETE /api/v1/download-clients/{id}
POST   /api/v1/download-clients/{id}/test
GET    /api/v1/download-clients/schema/{plugin}
```
Same shape as indexers.

### Notifications

```
GET    /api/v1/notifications
POST   /api/v1/notifications
GET    /api/v1/notifications/{id}
PUT    /api/v1/notifications/{id}
DELETE /api/v1/notifications/{id}
POST   /api/v1/notifications/{id}/test
GET    /api/v1/notifications/schema/{plugin}
```

### Queue

```
GET    /api/v1/queue
  Query: ?protocol=torrent&status=downloading
  Response: { items: [ QueueItem, ... ], total: 12 }

DELETE /api/v1/queue/{id}
  Query: ?delete_files=false
  Response: 204 No Content
```

### History

```
GET    /api/v1/history
  Query: ?movie_id=<uuid>&status=grabbed&page=1&per_page=50
  Response: { history: [ GrabHistory, ... ], total: 88 }
```

### Tasks

```
GET    /api/v1/tasks
  Response: [ Task, ... ]  (name, display_name, last_run, next_run, status)

POST   /api/v1/tasks/{name}/run
  Response: 202 Accepted

GET    /api/v1/tasks/{name}
  Response: Task
```

### System

```
GET    /api/v1/system/status
  Response: {
    app_name: "Luminarr",
    version: "0.1.0",
    build_time: "2025-...",
    go_version: "go1.24.0",
    db_type: "sqlite",
    uptime_seconds: 3600,
    start_time: "...",
    ai_enabled: true
  }

GET    /api/v1/system/health
  Response: [ { name: "disk_space", ok: true, message: "..." }, ... ]

GET    /api/v1/system/logs
  Query: ?level=error&lines=100
  Response: [ { time, level, message, fields }, ... ]

GET    /api/v1/system/plugins
  Response: { indexers: ["torznab", "newznab"], downloaders: [...], notifications: [...] }
```

### WebSocket

```
GET    /api/v1/ws
  Upgrade: websocket
  Auth: ?api_key=<key>  (query param, as headers not available on WS upgrade in some clients)
```

WebSocket messages are JSON with a `type` field:

```json
{ "type": "grab_started",  "movie_id": "...", "release_title": "...", "timestamp": "..." }
{ "type": "download_progress", "queue_item_id": "...", "progress": 0.42 }
{ "type": "import_complete", "movie_id": "...", "path": "/mnt/media/movies/..." }
{ "type": "health_issue", "name": "disk_space", "message": "Library 'Family' below 5GB free" }
{ "type": "task_started", "task": "rss_sync" }
{ "type": "task_finished", "task": "rss_sync", "duration_ms": 1240 }
```

---

## Pagination

List endpoints use page-based pagination:

```
?page=1&per_page=50
```

Response envelope:
```json
{
  "items": [...],
  "total": 342,
  "page": 1,
  "per_page": 50,
  "total_pages": 7
}
```

---

## OpenAPI Docs

Served at `/api/docs` (Scalar UI) and `/api/openapi.json` (raw spec).
Both require authentication unless `system.public_docs: true` is set in config.
