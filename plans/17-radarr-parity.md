# Radarr Feature Parity — Gap Analysis

Last updated: 2026-03-03

This document captures features Radarr supports that Luminarr does not yet have.
Items are grouped by implementation priority. Use this as a reference when planning future phases.

---

## Tier 1 — High Value (Phase 18)

These gaps have the highest user-facing impact and are achievable without major architectural changes.

### Blocklist
**What Radarr does:** Keeps a list of releases that failed or were manually rejected. Blocked
releases are skipped during automatic and manual searches. Users can view and clear blocklist entries.

**Current Luminarr state:** No blocklist table, service, or UI. Bad releases will be re-grabbed
indefinitely on next search cycle.

**Required work:**
- DB migration: `blocklist` table (id, movie_id, release_guid, release_title, indexer_id,
  release_source, release_resolution, protocol, size, added_at, notes)
- sqlc queries: `CreateBlocklistEntry`, `ListBlocklist`, `DeleteBlocklistEntry`,
  `IsBlocklisted` (by release_guid)
- `internal/core/blocklist/service.go` — CRUD + IsBlocklisted check
- API: `GET /blocklist`, `DELETE /blocklist/{id}`, `POST /blocklist` (manual add),
  `DELETE /blocklist` (clear all)
- Integrate into grab pipeline: check IsBlocklisted before sending release to downloader;
  add to blocklist on grab failure
- Frontend: Settings → Blocklist page (table of blocked releases, delete per-entry, clear all)

---

### Wanted — Missing Movies
**What Radarr does:** A "Wanted" section with two sub-pages:
1. **Missing** — monitored movies with no file
2. **Cutoff Unmet** — movies with a file that doesn't meet the quality profile cutoff

**Current Luminarr state:** Dashboard shows counts but there's no dedicated "Wanted" page and
no way to trigger a search or view the specific movies needing attention.

**Required work:**
- SQL: `ListMonitoredMoviesWithoutFile` (join movies + movie_files WHERE movie_files.id IS NULL)
- SQL: `ListMoviesWithCutoffUnmet` (join movie_files + quality_profiles WHERE quality < cutoff)
- API: `GET /wanted/missing` (paginated), `GET /wanted/cutoff` (paginated)
- Frontend: sidebar nav entry "Wanted", two-tab page (Missing / Cutoff Unmet), each with
  movie cards/table + "Search" button per movie (triggers existing grab pipeline)

---

### Minimum Availability
**What Radarr does:** Each movie has a `minimum_availability` field that controls when it's
eligible for search: `announced`, `in_cinemas`, `released`, `tba`. A movie below its minimum
availability is not searched for even if monitored.

**Current Luminarr state:** No such field. All monitored movies are treated as eligible.

**Required work:**
- DB migration: add `minimum_availability TEXT NOT NULL DEFAULT 'released'` to `movies`
- sqlc: update affected queries (`ListMovies`, `GetMovie`, `UpdateMovie`)
- `movie.AddRequest` / `movie.UpdateRequest` to include the field
- Scheduler / search pipeline: skip movies where current TMDB status doesn't meet threshold
- Frontend: add dropdown in Add Movie and Edit Movie modals (Announced / In Cinemas / Released / TBA)

---

### Manual Search UI
**What Radarr does:** A "Manual Search" modal per movie that shows all available releases
from all configured indexers. User can click "Grab" on any release. Supports filtering
by quality, indexer, size.

**Current Luminarr state:** The backend API for searching releases already exists
(`GET /api/v1/movies/{id}/releases` and `POST /api/v1/releases/grab`). There is no frontend
UI that exposes this.

**Required work:**
- Frontend only: add "Search" button/icon per movie (movie detail panel or movie card)
- Modal that fetches `/movies/{id}/releases`, displays results in a sortable table
  (title, quality, size, age, indexer, seeds/peers), allows clicking "Grab" on any row
- Show grab status/spinner per row; disable after successful grab

---

### History Per Movie
**What Radarr does:** Each movie has a history tab showing grabs, imports, failures for
that specific movie.

**Current Luminarr state:** `GET /api/v1/history` returns global history. No per-movie
endpoint exists. The movie detail panel has no history tab.

**Required work:**
- Backend: `GET /api/v1/movies/{id}/history` — filtered grab_history by movie_id
  (trivial SQL filter, existing history model reused)
- Frontend: History tab in movie detail panel, shows grab date, release title, quality,
  indexer, status

---

### Movie File Management
**What Radarr does:** Lets users view files associated with a movie (path, size, quality),
delete files (remove from disk and database), and in some versions manage multiple editions/cuts.

**Current Luminarr state:** Files are tracked in `movie_files` table. No API to list or
delete them. No UI beyond the file path shown in movie detail.

**Required work:**
- SQL: `ListMovieFilesByMovie` (already exists as `ListMovieFilesByLibrary`; need per-movie variant)
- API: `GET /api/v1/movies/{id}/files`, `DELETE /api/v1/movies/{id}/files/{fileId}`
  (removes DB record and optionally deletes from disk)
- Frontend: Files section in movie detail panel with list of files and delete button per file

---

### Calendar View
**What Radarr does:** A calendar page showing upcoming movie release dates. Color-coded
by status (monitored/unmonitored, has file/missing).

**Current Luminarr state:** `movies.release_date` stores the TMDB theatrical release date.
No calendar page exists.

**Required work:**
- Frontend only: new "Calendar" page in sidebar nav
- Fetch all movies with release_date, render on a monthly calendar grid
- Color coding: green = has file, yellow = monitored/missing, grey = unmonitored
- Click on a movie to open detail panel

---

## Tier 2 — Medium Value

Lower urgency but meaningful parity improvements.

### Tags Routing
Allow assigning tags to movies and libraries, then use tags to route searches to specific
indexers that share the same tags. Currently tags are stored but unused in search routing.

### Additional Notification Providers
- Slack (webhook-based, similar to Discord)
- Pushover (mobile push)
- Telegram (bot API)
- Ntfy (self-hosted push)

### Media Server Integration
- Plex: refresh library after import via Plex API
- Jellyfin: same via Jellyfin API
Both as notification-style plugins triggered by `import_complete` event.

### Bulk Movie Editor
Select multiple movies and change: monitored status, quality profile, minimum availability,
tags. Radarr has a bulk edit mode on the movie list.

### History Filtering
The global history page currently has no filtering. Add filter by: event type, indexer,
date range, movie title search.

### Release Profiles / Preferred Words
Score releases based on keyword presence (e.g., prefer "REMUX", avoid "CAM"). Currently
quality selection is entirely profile-cutoff based with no keyword scoring.

---

## Tier 3 — Nice to Have

### Language Filtering
Filter/prefer releases by audio language (requires indexer to expose language metadata).

### TMDB Collections
Group sequels/prequels by TMDB collection ID. "Add collection" adds all movies in the set.

### List Import (Trakt / TMDB / IMDb)
Import watchlists from external services as batch add operations.

### File Rename on Import
Rename files using the library's `naming_format` template on import. Currently files are
linked in place without renaming.

### Backup / Restore
Export and import the database (config, movies, quality profiles) as a ZIP file.

### Download Client Categories
Assign torrents to specific qBittorrent categories based on library or tags.

### Torrent Seeding Control
After seeding ratio/time is met, instruct the download client to remove or pause the torrent.

---

## Non-Goals

Features Radarr has that are intentionally out of scope:

- **Kodi/Emby integration** — niche, low demand
- **Custom scripts on events** — security surface, not worth the complexity
- **Multi-instance sync** — single-instance design
- **Drone Factory** (auto-import folder scan on timer) — disk scan import covers this
