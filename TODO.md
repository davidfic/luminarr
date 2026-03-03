# Deferred Work

Items consciously left out of the current phase. Each entry notes why it was deferred.

---

## AI Features (Phase 6)

Full design is in `plans/06-ai-integration.md`. Deferred in favour of shipping Phase 7 first.

Planned deliverables:
- `internal/ai/service.go` — `Service` interface + shared types (`Movie`, `MatchResult`, `ScoreResult`, `FilterResult`)
- `internal/ai/noop.go` — No-op fallback (string-similarity match, rule-based scoring/filtering)
- `internal/ai/claude.go` — Anthropic SDK-backed implementation (`github.com/anthropics/anthropic-sdk-go`)
- `internal/ai/scorer.go`, `matcher.go`, `filter.go` — Prompt construction + JSON response parsing
- AI scores added to `indexer.SearchResult` and surfaced in `GET /api/v1/movies/{id}/releases`
- RSS sync uses AI filter before quality evaluation to reduce candidate set

Config already wired: `ai.api_key`, `ai.match_model`, `ai.score_model`, `ai.filter_model`.
`AIEnabled` already plumbed through to `GET /api/v1/system/status`.

---

## Download Client Plugins

- **Transmission** — Phase 3 plan item, deferred to keep scope tight. RPC protocol differs from qBittorrent Web API but interface is identical.
- **SABnzbd** — Phase 3 plan item, deferred. NZB protocol client; needed before NZB indexers (newznab) are useful end-to-end.
- **NZBGet** — Not in original plan. Similar to SABnzbd; add alongside or instead depending on user demand.
- **Deluge** — Mentioned in Phase 8. Deluge uses a JSON-RPC daemon; slightly more involved auth flow.
- **Aria2** — Not in original plan. Useful for direct URL downloads; evaluate if there's demand.

## Plugin Settings Storage — Postgres Evaluation

Currently settings are stored as opaque `json.RawMessage` (TEXT in SQLite, JSONB in Postgres).
This is fine for SQLite but Postgres JSONB enables:
- Indexed queries on settings fields (`WHERE settings->>'host' = 'x'`)
- DB-level constraints on settings structure (check constraints)
- Easier admin inspection of stored configs

If Postgres becomes the primary target, revisit whether opaque blob vs. structured JSONB columns
(with a typed schema per plugin kind) is the better tradeoff. The plugin interface doesn't need
to change — only how the service layer stores and retrieves the blob.

## Plugin Settings Schema Endpoint

Each plugin should expose a JSON Schema document describing its settings fields. This enables:
- API-level validation before storing settings (currently caught only at instantiation)
- Future UI form generation without hardcoding field names

Blocked on: deciding whether schema lives as a method on the factory or on the plugin instance.

## Plugin Settings Migrations

When a plugin renames or restructures a settings field, stored JSON rows in the DB need updating.
No mechanism exists for this yet. Options:
- Version field inside the settings JSON + migration function per plugin
- Accept that breaking changes require manual re-configuration (acceptable for now)

## Download Client Routing

When multiple download clients are configured, there's no routing logic:
- Which client gets a torrent vs. an NZB?
- Priority ordering when a client is unreachable?

Current behavior: the grab endpoint uses the first enabled compatible client.
Future: per-library or per-quality-profile client selection.

## Download Client Health Monitoring

Phase 7 adds health checks. Download client connectivity check should be a named health check
surfaced in `GET /api/v1/system/health`, not just the Test endpoint.

## gRPC Plugin Transport

External (out-of-process) plugins in any language. Architecture is ready; transport is not built.
See `plans/05-plugin-system.md` for the proxy struct approach.

## Prowlarr App Sync (Push Integration)

Prowlarr can automatically push indexer configs to *arr-compatible apps via its
**Applications** settings page. This eliminates the need to manually add each indexer —
Prowlarr detects what's configured and syncs additions/removals in real time.

To support this, Luminarr needs to implement a small Radarr-compatible API subset that
Prowlarr calls when syncing:

**Endpoints required:**

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/v3/indexer` | List current indexers (Prowlarr checks what's already there) |
| `POST` | `/api/v3/indexer` | Add a new indexer pushed from Prowlarr |
| `PUT`  | `/api/v3/indexer/{id}` | Update an existing synced indexer |
| `DELETE` | `/api/v3/indexer/{id}` | Remove a synced indexer |
| `GET`  | `/api/v3/system/status` | Prowlarr calls this to confirm it's talking to a Radarr-compatible app |

**Request/response shape:** Prowlarr sends Newznab/Torznab settings using Radarr's
`fields` array format: `[{"name":"baseUrl","value":"http://..."},{"name":"apiKey","value":"..."}]`.
The implementation needs to translate this to the plugin settings JSON Luminarr uses
internally (`{"url":"...","api_key":"..."}`).

**Auth:** Prowlarr sends the key as `?apikey=` query param (not a header). The
`/api/v3/*` endpoints need to accept both `X-Api-Key` header and `apikey` query param.

**Workaround until implemented:** Add Prowlarr as a single torznab indexer using its
aggregate endpoint (`http://prowlarr:9696/api?apikey=KEY`) which searches all Prowlarr
indexers at once. See the README Getting Started section.

---

## Grab → Queue Linkage for NZBs

`grab_history` stores `client_item_id` for polling. SABnzbd/NZBGet return a different ID format
than qBittorrent/Transmission. Verify the queue poller handles both ID spaces correctly once
NZB clients are added.
