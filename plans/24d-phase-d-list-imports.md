# Phase D: List Import System

**Branch:** `feature/list-imports`
**Parent:** [24-integration-expansion.md](24-integration-expansion.md)

---

## Goal

Allow users to import movies from external watchlists (TMDB lists, Trakt, Plex watchlist). Movies from lists are automatically added to the library when they appear and optionally removed when deleted from the list.

This requires a **new subsystem** — new plugin interface, new DB tables, new service, new scheduler job, new API endpoints, and a new frontend page.

---

## Scope

This is the largest integration feature. A detailed plan will be written when Phases A-C are complete. This document captures the high-level design only.

---

## New Plugin Interface

```go
// pkg/plugin/listprovider.go
type ListProvider interface {
    Name() string
    Fetch(ctx context.Context) ([]ListMovie, error)
    Test(ctx context.Context) error
}

type ListMovie struct {
    TMDBID int
    IMDBID string
    Title  string
    Year   int
}
```

---

## Database Tables

- `lists` — config table (id, name, kind, enabled, settings, sync_interval, auto_add, auto_remove, quality_profile_id, root_folder, created_at, updated_at)
- `list_items` — tracking table (list_id, tmdb_id, added_at, removed_at, movie_id FK)

---

## Service

- `internal/core/listimport/service.go` — CRUD + sync logic
- Sync: fetch from provider → diff against list_items → add new movies (if auto_add) → mark removed (if auto_remove)

---

## Scheduler

- New job: `list_sync` — runs each list at its configured interval
- Default: every 6 hours

---

## Plugins (future)

- `plugins/lists/tmdb/` — TMDB public lists, collections, popular, trending
- `plugins/lists/trakt/` — Trakt lists, watchlist (requires OAuth)
- `plugins/lists/plex/` — Plex watchlist (requires Plex token)
- `plugins/lists/imdb/` — IMDb lists (RSS scraping)

---

## Dependencies

- Phases A-C should be complete first
- TMDB metadata provider must be wired (already is)
- Quality profiles must exist (already do)

---

## Detailed planning deferred until Phases A-C are shipped.
