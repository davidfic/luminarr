# Phase A: High-Value Download Clients

**Branch:** `feature/download-clients-phase-a`
**Parent:** [24-integration-expansion.md](24-integration-expansion.md)

---

## Goal

Add the three most-requested missing download clients: **Transmission** (torrent), **SABnzbd** (Usenet), and **NZBGet** (Usenet). This unlocks the entire Usenet workflow and covers the most popular torrent client after qBittorrent.

**No framework changes needed.** The `plugin.DownloadClient` interface and `plugin.ProtocolNZB` already exist. Each plugin is a self-contained package following the qBittorrent/Deluge pattern exactly.

---

## Plugin 1: Transmission

### File: `plugins/downloaders/transmission/transmission.go`

**Config:**
```go
type Config struct {
    URL      string `json:"url"`                // e.g. "http://localhost:9091"
    Username string `json:"username,omitempty"`
    Password string `json:"password,omitempty"`
}
```

**Protocol:** `plugin.ProtocolTorrent`

**API details:**
- Endpoint: `{url}/transmission/rpc` — JSON over HTTP POST
- Auth: HTTP Basic Auth (optional) + mandatory `X-Transmission-Session-Id` CSRF header
- Session-ID dance: first request returns 409 with the session ID in a response header → retry with that header. Implement as a `do()` helper with up to 3 retries on 409.

**Interface mapping:**

| Method | Transmission RPC call |
|--------|----------------------|
| `Add(release)` | `torrent-add` with `filename` (magnet/URL) or `metainfo` (base64 .torrent bytes) |
| `Status(itemID)` | `torrent-get` with `ids: [hashString]`, fields: name, status, percentDone, sizeWhenDone, leftUntilDone, downloadDir, error, errorString, uploadRatio, addedDate |
| `GetQueue()` | `torrent-get` with no `ids` (returns all), same fields |
| `Remove(itemID, deleteFiles)` | `torrent-remove` with `ids: [id]`, `delete-local-data: deleteFiles` |
| `Test()` | `session-get` (validates connectivity + auth) |

**State mapping:**

| Transmission status | plugin.DownloadStatus |
|----|-----|
| 0 (Stopped) | `StatusPaused` |
| 1 (QueuedToVerify) | `StatusQueued` |
| 2 (Verifying) | `StatusQueued` |
| 3 (QueuedToDownload) | `StatusQueued` |
| 4 (Downloading) | `StatusDownloading` |
| 5 (QueuedToSeed) | `StatusCompleted` |
| 6 (Seeding) | `StatusCompleted` |

If `error > 0` (tracker warning/error/local error), override to `StatusFailed`.

**ClientItemID:** Use `hashString` (40-char hex). Transmission uses integer IDs internally, but `torrent-get` accepts hash strings in the `ids` field, which is stable across restarts.

**Content path:** `downloadDir + "/" + name` (Transmission doesn't have a separate "move completed" concept in the API — it uses `downloadDir`).

**Torrent file handling:** Same pattern as qBittorrent — if release URL is a magnet, use `filename`. Otherwise fetch .torrent bytes, base64-encode, use `metainfo`.

### File: `plugins/downloaders/transmission/transmission_test.go`

- Factory validation (empty URL rejected)
- State mapping for all 7 status values
- Session-ID retry logic (mock 409 → 200 flow)
- Add torrent (magnet and .torrent file paths)
- Sanitizer redacts password

---

## Plugin 2: SABnzbd

### File: `plugins/downloaders/sabnzbd/sabnzbd.go`

**Config:**
```go
type Config struct {
    URL      string `json:"url"`       // e.g. "http://localhost:8080"
    APIKey   string `json:"api_key"`
    Category string `json:"category,omitempty"`
}
```

**Protocol:** `plugin.ProtocolNZB`

**API details:**
- Endpoint: `{url}/sabnzbd/api?output=json&apikey={key}&mode={mode}`
- Auth: API key as query parameter
- All responses are JSON with mode-specific top-level keys

**Interface mapping:**

| Method | SABnzbd API call |
|--------|-----------------|
| `Add(release)` | `mode=addurl&name={nzbURL}&nzbname={title}&cat={category}` → returns `nzo_ids[0]` |
| `Status(itemID)` | `mode=queue` → find slot by `nzo_id`; if not found, `mode=history` → find by `nzo_id` |
| `GetQueue()` | `mode=queue` → map all slots + `mode=history&limit=50` → map completed/failed slots |
| `Remove(itemID, deleteFiles)` | `mode=queue&name=delete&value={id}&del_files={0|1}`; if not in queue, `mode=history&name=delete&value={id}&del_files={0|1}` |
| `Test()` | `mode=version` (no key, verify connectivity) → `mode=queue&limit=0` (verify key) |

**State mapping (queue):**

| SABnzbd status | plugin.DownloadStatus |
|---|---|
| `Downloading` | `StatusDownloading` |
| `Queued` | `StatusQueued` |
| `Paused` | `StatusPaused` |
| `Fetching`, `Grabbing`, `Propagating` | `StatusQueued` |
| `Checking` | `StatusQueued` |

**State mapping (history):**

| SABnzbd status | plugin.DownloadStatus |
|---|---|
| `Completed` (any SUCCESS/*) | `StatusCompleted` |
| `Failed` (any FAILURE/*) | `StatusFailed` |
| `Extracting`, `Verifying`, `Repairing`, `Moving` | `StatusDownloading` |

**ClientItemID:** SABnzbd's `nzo_id` string (e.g. `SABnzbd_nzo_kyt1f0`).

**Content path:** From history slot `storage` field (final path after post-processing).

**Size parsing note:** SABnzbd returns `mb` and `mbleft` as *strings*. Parse with `strconv.ParseFloat`, multiply by 1024*1024 for bytes.

### File: `plugins/downloaders/sabnzbd/sabnzbd_test.go`

- Factory validation (empty URL, empty API key rejected)
- State mapping for queue and history statuses
- Size string parsing
- Add NZB (URL path)
- Sanitizer redacts api_key
- Test method (version + queue check)

---

## Plugin 3: NZBGet

### File: `plugins/downloaders/nzbget/nzbget.go`

**Config:**
```go
type Config struct {
    URL      string `json:"url"`       // e.g. "http://localhost:6789"
    Username string `json:"username"`
    Password string `json:"password"`
    Category string `json:"category,omitempty"`
}
```

**Protocol:** `plugin.ProtocolNZB`

**API details:**
- Endpoint: `{url}/jsonrpc` — JSON-RPC over HTTP POST
- Auth: HTTP Basic Auth (username/password)
- Request: `{"method": "...", "params": [...], "id": N}`
- Response: `{"version": "1.1", "result": ..., "id": N}`

**Interface mapping:**

| Method | NZBGet JSON-RPC method |
|--------|----------------------|
| `Add(release)` | `append` with params: `["", nzbURL, category, 0, false, false, "", 0, "Score", []]` → returns NZBID (int) |
| `Status(itemID)` | `listgroups` → find by NZBID; if not found, `history` → find by NZBID |
| `GetQueue()` | `listgroups` → map all items + `history(false)` → map recent items |
| `Remove(itemID, deleteFiles)` | `editqueue("GroupFinalDelete", "", [id])` for queue items; `editqueue("HistoryFinalDelete", "", [id])` for history items |
| `Test()` | `version` → returns version string |

**State mapping (listgroups):**

| NZBGet status | plugin.DownloadStatus |
|---|---|
| `DOWNLOADING` | `StatusDownloading` |
| `QUEUED`, `LOADING_PARS`, `FETCHING` | `StatusQueued` |
| `PAUSED` | `StatusPaused` |
| `PP_QUEUED`, `VERIFYING_SOURCES`, `REPAIRING`, `VERIFYING_REPAIRED`, `RENAMING`, `UNPACKING`, `MOVING`, `EXECUTING_SCRIPT` | `StatusDownloading` |
| `PP_FINISHED` | `StatusCompleted` |

**State mapping (history):**

| NZBGet status prefix | plugin.DownloadStatus |
|---|---|
| `SUCCESS/*` | `StatusCompleted` |
| `FAILURE/*` | `StatusFailed` |
| `WARNING/*` | `StatusFailed` |
| `DELETED/*` | `StatusFailed` |

**ClientItemID:** NZBGet NZBID as string (e.g. `"12345"`). Convert with `strconv.Atoi`/`strconv.Itoa`.

**Content path:** From history `FinalDir` (preferred) or `DestDir` (fallback). From listgroups, `DestDir`.

**Size:** `FileSizeMB * 1024 * 1024` for bytes (or use `FileSizeLo`/`FileSizeHi` for precision: `int64(Hi)<<32 | int64(Lo)`).

### File: `plugins/downloaders/nzbget/nzbget_test.go`

- Factory validation (empty URL rejected)
- State mapping for queue and history statuses
- NZBID string↔int conversion
- Append method params ordering
- Sanitizer redacts password
- Test method (version call)

---

## Frontend Changes

### File: `web/ui/src/pages/settings/download-clients/DownloadClientList.tsx`

For each new plugin, add:

1. **Kind dropdown option:** `<option value="transmission">Transmission</option>`, same for `sabnzbd`, `nzbget`

2. **Settings sub-components:**

   **TransmissionSettings:** URL, Username, Password fields (same layout as qBittorrent)

   **SABnzbdSettings:** URL, API Key, Category fields

   **NZBGetSettings:** URL, Username, Password, Category fields

3. **KindBadge colors/labels:**
   - `transmission` → `#B71C1C` (dark red, Transmission brand), label "Transmission"
   - `sabnzbd` → `#F57C00` (orange, SABnzbd brand), label "SABnzbd"
   - `nzbget` → `#388E3C` (green, NZBGet brand), label "NZBGet"

4. **Form state fields:** `trans_url`, `trans_username`, `trans_password`, `sab_url`, `sab_api_key`, `sab_category`, `nzbget_url`, `nzbget_username`, `nzbget_password`, `nzbget_category`

5. **formToRequest():** Build correct JSON settings per kind.

6. **notifToForm():** Extract settings from API response per kind.

---

## Wiring

### File: `cmd/luminarr/main.go`

Add three blank imports:
```go
_ "github.com/davidfic/luminarr/plugins/downloaders/transmission"
_ "github.com/davidfic/luminarr/plugins/downloaders/sabnzbd"
_ "github.com/davidfic/luminarr/plugins/downloaders/nzbget"
```

No other wiring changes needed — the registry auto-discovers via `init()`.

---

## Implementation Order

| # | Commit | Files | Test |
|---|--------|-------|------|
| 1 | Transmission plugin | `plugins/downloaders/transmission/transmission.go`, `main.go` | `make check` |
| 2 | Transmission tests | `plugins/downloaders/transmission/transmission_test.go` | `go test ./plugins/downloaders/transmission/...` |
| 3 | SABnzbd plugin | `plugins/downloaders/sabnzbd/sabnzbd.go`, `main.go` | `make check` |
| 4 | SABnzbd tests | `plugins/downloaders/sabnzbd/sabnzbd_test.go` | `go test ./plugins/downloaders/sabnzbd/...` |
| 5 | NZBGet plugin | `plugins/downloaders/nzbget/nzbget.go`, `main.go` | `make check` |
| 6 | NZBGet tests | `plugins/downloaders/nzbget/nzbget_test.go` | `go test ./plugins/downloaders/nzbget/...` |
| 7 | Frontend: all three clients | `DownloadClientList.tsx` | `npm run build` |

---

## Verification

- `make check` passes at each commit
- Each plugin: configure client, click Test → should verify connectivity
- Transmission: add magnet URI → appears in Transmission queue
- SABnzbd: search NZB indexer, grab release → appears in SABnzbd queue, status polling works
- NZBGet: same as SABnzbd
- Queue page shows items from all configured clients with correct status mapping
