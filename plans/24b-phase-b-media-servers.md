# Phase B: Media Server Connections

**Branch:** `feature/media-servers`
**Parent:** [24-integration-expansion.md](24-integration-expansion.md)

---

## Goal

Add Plex, Emby, and Jellyfin media server integration. After a movie is imported, Luminarr tells the media server to refresh its library so the movie appears immediately without waiting for a scheduled scan.

This requires a **new plugin category** — media servers are not notifiers.

---

## New Abstraction: `plugin.MediaServer`

### File: `pkg/plugin/mediaserver.go`

```go
type MediaServer interface {
    Name() string
    RefreshLibrary(ctx context.Context, moviePath string) error
    Test(ctx context.Context) error
}
```

`RefreshLibrary` accepts the movie's filesystem path so the media server can scope its scan to the relevant library/section rather than rescanning everything.

---

## Registry Additions

### File: `internal/registry/registry.go`

Add four methods mirroring the existing pattern:
- `RegisterMediaServer(kind string, factory MediaServerFactory)`
- `RegisterMediaServerSanitizer(kind string, fn SanitizerFunc)`
- `NewMediaServer(kind string, settings json.RawMessage) (plugin.MediaServer, error)`
- `SanitizeMediaServerSettings(kind string, settings json.RawMessage) json.RawMessage`

---

## Database

### Migration: `internal/db/migrations/NNNN_media_servers.sql`

```sql
CREATE TABLE media_servers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    settings   TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Same shape as `notifications` table.

---

## Service Layer

### File: `internal/core/mediaserver/service.go`

CRUD service following `notification.Service` pattern exactly:
- `Create(ctx, req)` — validate via registry, persist
- `Get(ctx, id)` — fetch by ID
- `List(ctx)` — list all
- `Update(ctx, id, req)` — merge settings, validate
- `Delete(ctx, id)` — remove
- `Test(ctx, id)` — instantiate + test

---

## Dispatcher

### File: `internal/mediaservers/dispatcher.go`

Subscribe to event bus. On `TypeImportComplete`:
1. Load enabled media server configs
2. Instantiate each via registry
3. Extract movie path from event data
4. Call `RefreshLibrary(ctx, moviePath)`
5. Log errors, don't retry

---

## Plugins

### Plex (`plugins/mediaservers/plex/plugin.go`)
- Config: `url`, `token` (X-Plex-Token)
- API: `GET /library/sections` to find section containing path, then `GET /library/sections/{id}/refresh`
- Test: `GET /` with token → check 200

### Emby (`plugins/mediaservers/emby/plugin.go`)
- Config: `url`, `api_key`
- API: `POST /Library/Refresh?api_key={key}` (full) or `POST /Items/{id}/Refresh` (targeted)
- Test: `GET /System/Info?api_key={key}` → check 200

### Jellyfin (`plugins/mediaservers/jellyfin/plugin.go`)
- Config: `url`, `api_key`
- API: Same as Emby (Jellyfin forked from Emby, API is compatible)
- Test: `GET /System/Info` with `X-Emby-Token` header

---

## API, Frontend, Wiring

- `internal/api/v1/media_servers.go` — CRUD + test endpoints
- `internal/api/router.go` — register routes
- `web/ui/src/pages/settings/media-servers/MediaServerList.tsx` — settings page
- `cmd/luminarr/main.go` — blank imports + dispatcher wiring

---

## Implementation Order

| # | Task |
|---|------|
| 1 | Interface + registry additions |
| 2 | DB migration + sqlc queries |
| 3 | Service layer |
| 4 | API endpoints |
| 5 | Dispatcher (event → refresh) |
| 6 | Plex plugin |
| 7 | Emby plugin |
| 8 | Jellyfin plugin |
| 9 | Tests |
| 10 | Frontend |
| 11 | Wiring in main.go |
