# Integration Layer Expansion — Analysis & Roadmap

Last updated: 2026-03-05

---

## Part 1: Current Codebase Integration Analysis

### How Integrations Are Implemented

Luminarr uses a **factory-pattern plugin registry** with three plugin categories — indexers, downloaders, and notifiers. Each category has:

1. **An interface** (`pkg/plugin/`) that defines the contract
2. **A registry** (`internal/registry/registry.go`) that maps `kind` strings to factory functions
3. **Plugin implementations** (`plugins/`) that self-register via `init()`
4. **A service layer** (`internal/core/`) that does CRUD and orchestrates plugin usage
5. **API handlers** (`internal/api/v1/`) that expose CRUD + test endpoints
6. **Frontend forms** (`web/ui/src/pages/settings/`) with per-kind sub-components

### Where Integration Logic Lives

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Interfaces | `pkg/plugin/{indexer,downloader,notification}.go` | Contracts only — no implementation |
| Registry | `internal/registry/registry.go` | Kind→factory map, sanitizers, instantiation |
| Plugins | `plugins/{indexers,downloaders,notifications}/` | External service communication |
| Services | `internal/core/{indexer,downloader,notification}/service.go` | Config CRUD, orchestration, settings merge |
| Dispatcher | `internal/notifications/dispatcher.go` | Event bus → notifier routing |
| API | `internal/api/v1/{indexers,download_clients,notifications}.go` | HTTP CRUD + test endpoints |
| Frontend | `web/ui/src/pages/settings/{indexers,download-clients,notifications}/` | Configuration UI |
| Wiring | `cmd/luminarr/main.go` | Blank imports, dependency injection |

### Existing Abstractions

**`plugin.Indexer` interface:**
- `Search(ctx, query) → []Release` — TMDB ID, IMDB ID, or free-text
- `GetRecent(ctx) → []Release` — RSS-style latest
- `Capabilities(ctx) → Capabilities` — what search modes are supported
- `Test(ctx) → error` — connectivity check

**`plugin.DownloadClient` interface:**
- `Add(ctx, release) → clientItemID` — submit download
- `Status(ctx, itemID) → QueueItem` — poll single item
- `GetQueue(ctx) → []QueueItem` — poll all items
- `Remove(ctx, itemID, deleteFiles)` — remove download
- `Test(ctx) → error`

**`plugin.Notifier` interface:**
- `Notify(ctx, event) → error` — send notification
- `Test(ctx) → error`

**Registry pattern:** Each plugin registers a factory (`func(json.RawMessage) → (Interface, error)`) and an optional sanitizer (`func(json.RawMessage) → json.RawMessage`) in its `init()`. Services call `registry.NewXxx(kind, settingsJSON)` to instantiate on demand. Settings are opaque JSON per kind — the service layer never inspects them.

**Settings merging:** On update, services merge new settings with existing ones to preserve omitted secret fields (passwords, API keys). The sanitizer redacts secrets before API responses.

### Current Plugin Inventory

| Category | Kind | Protocol | External Service |
|----------|------|----------|-----------------|
| Indexer | `torznab` | Torznab XML/RSS | Prowlarr, Jackett, native trackers |
| Indexer | `newznab` | Newznab XML/RSS | NZBHydra2, native Usenet indexers |
| Downloader | `qbittorrent` | HTTP REST + cookies | qBittorrent Web API v2 |
| Downloader | `deluge` | JSON-RPC + cookies | Deluge Web UI |
| Notifier | `discord` | HTTP POST | Discord Webhook API |
| Notifier | `slack` | HTTP POST | Slack Incoming Webhook |
| Notifier | `webhook` | HTTP POST/PUT | Any HTTP endpoint |
| Notifier | `email` | SMTP/STARTTLS | Any SMTP server |
| Notifier | `command` | Local exec | User scripts |

### What Does NOT Exist

- **No media server integration** — no Plex, Emby, Jellyfin, or Kodi library update support
- **No "connection" abstraction** — Radarr has a generic "Connection" category that overlaps with notifications but also includes media server library refreshes. Luminarr has no equivalent.
- **No list import** — no Trakt, TMDB list, or Plex watchlist import
- **No alternative metadata providers** — TMDB only (via injectable `MetadataProvider` interface, but no swap exists)
- **No Usenet download clients** — SABnzbd, NZBGet absent
- **No additional torrent clients** — Transmission, rTorrent, Aria2, Flood absent

---

## Part 2: Radarr Ecosystem Gap Analysis

### Download Clients

| Client | Radarr | Luminarr | Protocol | Priority | Notes |
|--------|--------|----------|----------|----------|-------|
| qBittorrent | ✓ | ✓ | Torrent | — | Done |
| Deluge | ✓ | ✓ | Torrent | — | Done |
| Transmission | ✓ | ✗ | Torrent | **High** | Very popular, simple RPC API |
| rTorrent | ✓ | ✗ | Torrent | Medium | XML-RPC, popular in seedbox setups |
| SABnzbd | ✓ | ✗ | Usenet | **High** | Most popular Usenet client |
| NZBGet | ✓ | ✗ | Usenet | **High** | Second most popular Usenet client |
| Aria2 | ✓ | ✗ | Torrent | Low | Niche, JSON-RPC |
| Flood | ✓ | ✗ | Torrent | Low | rTorrent frontend, same backend |
| Transmission | ✓ | ✗ | Torrent | High | RPC API, very common |
| Vuze | ✓ | ✗ | Torrent | Low | Declining usage |
| uTorrent | ✓ | ✗ | Torrent | Low | Legacy, declining |
| Download Station | ✓ | ✗ | Both | Low | Synology-specific |
| Torrent Blackhole | ✓ | ✗ | Torrent | Low | Watch folder, no API |
| Usenet Blackhole | ✓ | ✗ | Usenet | Low | Watch folder, no API |

### Indexers

| Indexer Type | Radarr | Luminarr | Notes |
|-------------|--------|----------|-------|
| Torznab | ✓ | ✓ | Done — covers Prowlarr, Jackett, native |
| Newznab | ✓ | ✓ | Done — covers Usenet indexers |

**Assessment:** Indexer coverage is complete. Torznab and Newznab are the universal standards — Prowlarr and Jackett both expose feeds via these protocols. No individual indexer plugins are needed.

### Connections / Notifications

| Connection | Radarr | Luminarr | Type | Priority | Notes |
|-----------|--------|----------|------|----------|-------|
| Discord | ✓ | ✓ | Notifier | — | Done |
| Slack | ✓ | ✓ | Notifier | — | Done |
| Webhook | ✓ | ✓ | Notifier | — | Done |
| Email | ✓ | ✓ | Notifier | — | Done |
| Custom Script | ✓ | ✓ | Notifier | — | Done (command plugin) |
| **Plex** | ✓ | ✗ | **Media Server** | **Critical** | Library refresh + notify on import |
| **Emby/Jellyfin** | ✓ | ✗ | **Media Server** | **Critical** | Library refresh + notify on import |
| Telegram | ✓ | ✗ | Notifier | **High** | Very popular in self-hosting community |
| Pushover | ✓ | ✗ | Notifier | Medium | Popular push notification service |
| Gotify | ✓ | ✗ | Notifier | Medium | Self-hosted push notifications |
| ntfy | ✓ | ✗ | Notifier | Medium | Self-hosted, rising popularity |
| Apprise | ✓ | ✗ | Notifier | Low | Meta-notifier (bridges to 80+ services) |
| Kodi (XBMC) | ✓ | ✗ | Media Server | Low | JSON-RPC library update |
| Pushbullet | ✓ | ✗ | Notifier | Low | Declining usage |
| Trakt | ✓ | ✗ | List Sync | Medium | Watch tracking + list import |
| Join | ✓ | ✗ | Notifier | Low | Niche |
| Prowl | ✓ | ✗ | Notifier | Low | iOS-only, niche |
| Signal | ✓ | ✗ | Notifier | Low | Requires Signal CLI daemon |
| Simplepush | ✓ | ✗ | Notifier | Low | Niche |
| Mailgun | ✓ | ✗ | Notifier | Low | Email-as-a-service (Email plugin covers this) |
| SendGrid | ✓ | ✗ | Notifier | Low | Email-as-a-service (Email plugin covers this) |
| Boxcar | ✓ | ✗ | Notifier | Low | Discontinued |
| Synology Indexer | ✓ | ✗ | Media Server | Low | Synology-specific |
| Twitter | ✓ | ✗ | Notifier | Low | API now paywalled |

### Lists (Import Sources) — Not Yet in Luminarr

Radarr supports importing movies from external lists:
- TMDB Lists / Collections / Popular / Trending
- Trakt Lists / Watchlist / Popular
- Plex Watchlist
- IMDb Lists
- Custom RSS feeds

Luminarr has **no list import system** at all. This is a significant gap for users who manage watchlists externally.

---

## Part 3: Architecture Scalability Evaluation

### What Scales Well

1. **Plugin registry is fully extensible.** Adding a new download client, indexer, or notifier requires zero changes to the registry, service layer, or API. The pattern is proven across 9 plugins.

2. **Settings-as-JSON is flexible.** Each plugin defines its own config struct. No schema migrations needed when adding new plugins.

3. **Event bus decouples producers from consumers.** New event types can be published from any service; the dispatcher routes them to all interested notifiers automatically.

4. **Sanitizer pattern is consistent.** Every plugin that stores secrets has a sanitizer. New plugins follow the same pattern.

### What Needs Architectural Work

1. **No "Connection" abstraction for media servers.** Plex/Emby/Jellyfin are not notifiers — they need to:
   - Refresh their library after file import (triggered by `TypeImportComplete` event)
   - Optionally send notifications through their own UI
   - This is a **new plugin category**, not a notifier variant

2. **No list import system.** This requires:
   - A new `plugin.ListProvider` interface (`Fetch(ctx) → []ListMovie`)
   - A new service (`internal/core/listimport/`) with CRUD + sync scheduling
   - Scheduler integration for periodic sync
   - This is a medium-sized feature, not just a plugin

3. **Download client protocol matching is binary.** `ProtocolTorrent` or `ProtocolNZB` — works fine. No changes needed for new clients that use these protocols.

4. **`MetadataProvider` interface exists but is hardcoded to TMDB.** The `movie.Service` accepts a `MetadataProvider` interface, so swapping to another source is theoretically possible, but no alternative implementation exists.

### Verdict

The existing architecture **handles new plugins within existing categories excellently**. Adding Transmission, SABnzbd, Telegram, etc. is purely implementation work — the framework supports them natively.

The two gaps requiring new abstractions are:
1. **Media server connections** (new plugin category)
2. **List imports** (new subsystem)

---

## Part 4: Extensible Integration Framework Design

### Approach: Minimal New Abstractions

Rather than building a generic "connection" system, add **one new plugin category** for media servers and **one new subsystem** for list imports. Everything else fits the existing patterns.

### New Plugin Category: Media Server

```go
// pkg/plugin/mediaserver.go
type MediaServer interface {
    Name() string
    // RefreshLibrary tells the media server to re-scan a specific path or its entire library.
    RefreshLibrary(ctx context.Context, moviePath string) error
    Test(ctx context.Context) error
}
```

**Registry additions:**
- `RegisterMediaServer(kind, factory)` / `NewMediaServer(kind, settings)`
- `RegisterMediaServerSanitizer(kind, fn)` / `SanitizeMediaServerSettings(kind, settings)`

**Dispatcher integration:**
- On `TypeImportComplete` events, iterate enabled media server configs and call `RefreshLibrary()`
- Same pattern as notification dispatcher — separate `MediaServerDispatcher` or extend existing

**Plugins:** `plugins/mediaservers/plex/`, `plugins/mediaservers/emby/`, `plugins/mediaservers/jellyfin/`

**DB:** Reuse `notifications` table pattern — new `media_servers` table with `kind`, `settings`, `enabled`.

### New Subsystem: List Import

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

This is a larger feature and should be its own plan document when the time comes.

### No Changes Needed For

- New download clients (Transmission, SABnzbd, etc.) — just implement `plugin.DownloadClient`
- New notifiers (Telegram, Pushover, etc.) — just implement `plugin.Notifier`
- New indexers — just implement `plugin.Indexer` (unlikely needed — Torznab/Newznab cover everything)

---

## Part 5: Implementation Plan

### Phase A: High-Value Download Clients

**Goal:** Cover the most-requested missing download clients.

| # | Plugin | Effort | Notes |
|---|--------|--------|-------|
| 1 | `transmission` | Medium | JSON-RPC API, session ID header auth |
| 2 | `sabnzbd` | Medium | REST API with API key auth — first Usenet client |
| 3 | `nzbget` | Medium | JSON-RPC API — second Usenet client |

Each plugin follows the exact pattern of qBittorrent/Deluge:
- `plugins/downloaders/{name}/{name}.go` — Config, init(), factory, sanitizer, interface impl
- `plugins/downloaders/{name}/{name}_test.go` — factory validation, state mapping
- Blank import in `main.go`
- Frontend: add `<option>` + settings sub-component in `DownloadClientList.tsx`

**Usenet note:** The `plugin.DownloadClient` interface and `plugin.Protocol` enum already support `ProtocolNZB`. The grab pipeline in `indexer.Grab()` already checks protocol compatibility. No framework changes needed — just implement the plugins.

### Phase B: Media Server Connections

**Goal:** Plex and Emby/Jellyfin library refresh after import.

| # | Task | Effort |
|---|------|--------|
| 1 | `pkg/plugin/mediaserver.go` — interface | Small |
| 2 | Registry additions (4 methods) | Small |
| 3 | DB migration: `media_servers` table | Small |
| 4 | `internal/core/mediaserver/service.go` — CRUD | Medium (copy notification service pattern) |
| 5 | `internal/api/v1/media_servers.go` — API endpoints | Medium |
| 6 | Media server dispatcher (event → refresh) | Small |
| 7 | `plugins/mediaservers/plex/plugin.go` | Medium (OAuth or token auth, REST API) |
| 8 | `plugins/mediaservers/emby/plugin.go` | Medium (API key auth, REST API) |
| 9 | `plugins/mediaservers/jellyfin/plugin.go` | Small (same API as Emby, different auth header) |
| 10 | Frontend: MediaServerList.tsx settings page | Medium |
| 11 | Wiring in main.go + router.go | Small |

### Phase C: Popular Notifiers

**Goal:** Cover the most-requested notification services.

| # | Plugin | Effort | Notes |
|---|--------|--------|-------|
| 1 | `telegram` | Small | Bot API, single POST endpoint |
| 2 | `pushover` | Small | REST POST with user/app tokens |
| 3 | `gotify` | Small | REST POST with app token |
| 4 | `ntfy` | Small | REST POST to topic URL |

All four are trivial HTTP POST notifiers — simpler than Discord. Each is a single file, ~80-120 lines.

### Phase D: List Import System (Future)

**Goal:** Import movies from external watchlists.

This is a larger feature requiring its own plan document. Rough scope:
- New plugin interface + registry category
- New DB tables (lists, list_items, sync state)
- New service with add/remove/sync logic
- Scheduler job for periodic sync
- API endpoints + frontend page
- Plugins: TMDB Lists, Trakt, Plex Watchlist

---

## Part 6: Prioritized Integration Roadmap

### Tier 1 — Critical (immediate user value)

| Integration | Category | Why |
|-------------|----------|-----|
| **Transmission** | Downloader | Most popular torrent client after qBittorrent |
| **SABnzbd** | Downloader | Most popular Usenet client — unlocks entire Usenet workflow |
| **Plex** | Media Server | ~70% of self-hosting users run Plex |
| **Emby/Jellyfin** | Media Server | Covers the remaining ~30% |

### Tier 2 — High Value (strong demand)

| Integration | Category | Why |
|-------------|----------|-----|
| **NZBGet** | Downloader | Second Usenet client — some users prefer it over SABnzbd |
| **Telegram** | Notifier | Extremely popular in self-hosting/arr community |
| **Gotify** | Notifier | Self-hosted push notifications, growing fast |
| **ntfy** | Notifier | Self-hosted, very simple, rising popularity |

### Tier 3 — Nice to Have

| Integration | Category | Why |
|-------------|----------|-----|
| **rTorrent** | Downloader | Popular in seedbox setups |
| **Pushover** | Notifier | Established push notification service |
| **Trakt** | List Sync | Watch tracking, requires list import subsystem |
| **Kodi** | Media Server | JSON-RPC library update |

### Tier 4 — Low Priority

| Integration | Category | Why |
|-------------|----------|-----|
| Aria2 | Downloader | Niche |
| Flood | Downloader | rTorrent frontend |
| Apprise | Notifier | Meta-notifier — users can use webhook instead |
| Signal | Notifier | Requires Signal CLI daemon |
| Vuze, uTorrent | Downloader | Declining usage |
| Blackhole (torrent/usenet) | Downloader | Watch folder — simple but rarely needed |

### Suggested Implementation Order

```
Phase A: Download clients     → Transmission, SABnzbd, NZBGet
Phase B: Media servers        → Plex, Emby, Jellyfin (new category)
Phase C: Notifiers           → Telegram, Gotify, ntfy, Pushover
Phase D: List imports        → TMDB Lists, Trakt (new subsystem, own plan)
Phase E: Long tail           → rTorrent, Kodi, remaining notifiers
```

Each phase is independently shippable. Phases A and C require zero architectural changes — pure plugin implementation. Phase B requires the new media server category. Phase D requires the list import subsystem.

---

## Sources

- [Radarr Supported | Servarr Wiki](https://wiki.servarr.com/radarr/supported)
- [Radarr Settings | Servarr Wiki](https://wiki.servarr.com/radarr/settings)
- [Radarr Download Clients — Buildarr](https://buildarr.github.io/plugins/radarr/configuration/settings/download-clients/)
- [Radarr Notifications — Buildarr](https://buildarr.github.io/plugins/radarr/configuration/settings/notifications/)
