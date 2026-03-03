# Phase 10 — Frontend Detail Plan

This document is the implementation-ready expansion of `14-frontend.md`. After
reading this you should be able to open a text editor and start writing
`index.html`, `style.css`, and `app.js` without further research.

---

## 1. File Structure

```
web/
  static/
    index.html     — single HTML shell; all views live here as hidden <section>s
    style.css      — ~250 lines; custom properties + component classes
    app.js         — Alpine.js components for every view
  embed.go         — //go:embed directive, ServeIndex, StaticFS
```

Files served by the router:

| URL pattern     | Handler              | Notes                                  |
|-----------------|----------------------|----------------------------------------|
| `/`             | `ServeIndex(key)`    | Returns index.html with key injected   |
| `/static/*`     | `http.FileServer`    | Serves app.js, style.css verbatim      |
| `/*` catch-all  | `ServeIndex(key)`    | SPA fallback — every unknown path      |
| `/api/*`        | huma (existing)      | Registered before `/*`; takes priority |
| `/health`       | existing handler     | Registered before `/*`; takes priority |
| `/api/docs`     | huma (existing)      | Registered before `/*`; takes priority |

The `/static/` prefix is deliberate: it avoids collision with any future `/api/`
sub-paths and makes asset URLs stable and cache-friendly.

---

## 2. `web/embed.go` — Full Design

```
web/embed.go
```

Package: `web`

### Embed directive

```go
//go:embed static
var staticFiles embed.FS
```

This embeds the entire `web/static/` directory tree into the binary at compile
time. The embedded paths are prefixed with `static/` (e.g.
`static/index.html`).

### `ServeIndex(apiKey string) http.HandlerFunc`

- Called once at startup from `NewRouter`, not per-request.
- Reads `static/index.html` from `staticFiles`.
- Performs a single `strings.ReplaceAll` of `__LUMINARR_KEY__` with the real
  key. The result is stored in a closed-over `[]byte`.
- The returned `http.HandlerFunc` writes `Content-Type: text/html; charset=utf-8`
  and the pre-built `[]byte` on every request. No allocation per request.
- If `ReadFile` fails (should never happen with embed), the handler writes a
  plain-text error with status 500.

```go
func ServeIndex(apiKey string) http.HandlerFunc {
    raw, err := staticFiles.ReadFile("static/index.html")
    if err != nil {
        return func(w http.ResponseWriter, r *http.Request) {
            http.Error(w, "index.html missing from embedded FS", http.StatusInternalServerError)
        }
    }
    html := []byte(strings.ReplaceAll(string(raw), "__LUMINARR_KEY__", apiKey))
    return func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "text/html; charset=utf-8")
        w.Header().Set("Cache-Control", "no-store")
        _, _ = w.Write(html)
    }
}
```

`Cache-Control: no-store` prevents the browser from caching the injected key
across a server restart.

### `StaticFS() http.FileSystem`

```go
func StaticFS() http.FileSystem {
    sub, _ := fs.Sub(staticFiles, "static")
    return http.FS(sub)
}
```

`fs.Sub` strips the `static/` prefix so that `/static/app.js` resolves to
`app.js` in the sub-FS. `http.FS` converts it to the `http.FileSystem`
interface expected by `http.FileServer`.

---

## 3. Router Integration

Open `/data/home/davidfic/dev/luminarr/internal/api/router.go`.

Add these imports to the import block:

```go
"net/http"
"github.com/davidfic/luminarr/web"
```

(`net/http` is already imported; `web` is new.)

Add these lines at the very end of `NewRouter`, immediately before `return r`:

```go
// Static assets (app.js, style.css) — served verbatim with file-server caching.
r.Handle("/static/*", http.StripPrefix("/static", http.FileServer(web.StaticFS())))

// SPA catch-all — any path not matched above returns index.html with the key injected.
// /api/*, /health, /api/docs are already registered and take precedence in chi.
r.Get("/*", web.ServeIndex(cfg.Auth.Value()))
```

Order matters in chi: named routes registered first win. Since all `/api/v1/*`,
`/health`, and `/api/docs` routes are registered by the huma adapter and the
explicit `/health` handler before these two lines, they are unaffected.

Total diff to `router.go`: 2 route registrations + 1 import. No existing lines
change.

---

## 4. `index.html` — Full Shell Structure

The HTML file has four responsibilities:
1. Load CSS and Alpine.js.
2. Inject the API key via the server-side placeholder.
3. Provide the root Alpine component that owns the current view.
4. Contain all view sections as conditionally shown `<div>`s.

### Script and CSS loading order

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Luminarr</title>
  <link rel="stylesheet" href="/static/style.css">
  <!-- Key injection: replaced at serve time, never reaches the browser as a literal -->
  <script>window.__KEY = "__LUMINARR_KEY__"</script>
  <!-- app.js must be loaded before Alpine so Alpine.data() calls are registered -->
  <script src="/static/app.js" defer></script>
  <!-- Alpine CDN — defer ensures DOM is ready before Alpine initialises -->
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
</head>
```

Loading order rationale: `app.js` is deferred and runs before Alpine's `defer`
script because scripts execute in document order. `Alpine.data()` registrations
in `app.js` happen before Alpine's own `init` event fires, which is the correct
Alpine 3 pattern.

### Body structure

```html
<body x-data="app">

  <!-- Navigation bar -->
  <nav class="topnav">
    <a class="topnav-brand" href="#" @click="setView('movies')">Luminarr</a>
    <div class="topnav-links">
      <a class="topnav-link" :class="{active: view==='movies'}"
         href="#" @click.prevent="setView('movies')">Movies</a>
      <div class="topnav-dropdown" x-data="{open:false}">
        <button class="topnav-link" @click="open=!open"
                @click.outside="open=false">Settings &#9662;</button>
        <div class="dropdown-menu" x-show="open" @click="open=false">
          <a class="dropdown-item" href="#"
             @click.prevent="setView('download-clients')">Download Clients</a>
          <a class="dropdown-item" href="#"
             @click.prevent="setView('indexers')">Indexers</a>
        </div>
      </div>
    </div>
    <!-- Health chip: green "Healthy", yellow "Degraded", red "Unhealthy" -->
    <div class="topnav-health">
      <span class="chip" :class="healthChipClass" x-text="healthLabel"
            title="System health"></span>
    </div>
  </nav>

  <!-- Main content area -->
  <main class="main-content">

    <!-- Movies view -->
    <div x-show="view === 'movies'" x-data="movies">
      <!-- ... see section 5 ... -->
    </div>

    <!-- Download Clients view -->
    <div x-show="view === 'download-clients'" x-data="downloadClients"
         x-init="view === 'download-clients' && load()">
      <!-- ... see section 5 ... -->
    </div>

    <!-- Indexers view -->
    <div x-show="view === 'indexers'" x-data="indexers"
         x-init="view === 'indexers' && load()">
      <!-- ... see section 5 ... -->
    </div>

  </main>

  <!-- Global modal overlay (used only by Add Movie) -->
  <div class="modal-overlay" x-show="$store.modal.open" @click.self="$store.modal.close()">
    <div class="modal">
      <!-- Modal content is injected by the movies component -->
    </div>
  </div>

</body>
```

Note: the Settings view `x-data` sub-components load lazily (`x-init` only
fires when the condition is true). The movies component loads immediately since
it is the default view.

---

## 5. CSS Design

### Token set (custom properties)

All tokens live on `:root`. The dark-mode block overrides only the color tokens;
spacing and typography are the same in both modes.

```css
:root {
  /* --- Color: light mode --- */
  --color-bg:          #f9fafb;   /* page background */
  --color-surface:     #ffffff;   /* cards, table rows, modals */
  --color-border:      #e5e7eb;   /* subtle dividers */
  --color-text:        #111827;   /* primary text */
  --color-text-muted:  #6b7280;   /* secondary / placeholder text */
  --color-accent:      #4f46e5;   /* indigo — primary action */
  --color-accent-hover:#4338ca;   /* darker indigo on hover */
  --color-accent-fg:   #ffffff;   /* text on accent backgrounds */
  --color-danger:      #dc2626;   /* destructive actions */
  --color-danger-hover:#b91c1c;
  --color-success:     #16a34a;
  --color-warn:        #d97706;

  /* --- Status chip backgrounds --- */
  --chip-healthy-bg:   #dcfce7;
  --chip-healthy-fg:   #15803d;
  --chip-degraded-bg:  #fef9c3;
  --chip-degraded-fg:  #a16207;
  --chip-unhealthy-bg: #fee2e2;
  --chip-unhealthy-fg: #b91c1c;
  --chip-monitored-bg: #e0e7ff;
  --chip-monitored-fg: #3730a3;

  /* --- Spacing scale (4px base) --- */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;

  /* --- Typography --- */
  --font-sans:  system-ui, -apple-system, sans-serif;
  --font-mono:  ui-monospace, "Cascadia Code", "Fira Code", monospace;
  --text-sm:    0.8125rem;   /* 13px */
  --text-base:  0.9375rem;   /* 15px */
  --text-lg:    1.125rem;    /* 18px */
  --text-xl:    1.375rem;    /* 22px */
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-bold:   600;

  /* --- Layout --- */
  --topnav-height: 52px;
  --radius-sm:  4px;
  --radius-md:  6px;
  --radius-lg:  8px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:          #0f1117;
    --color-surface:     #1a1d27;
    --color-border:      #2d3148;
    --color-text:        #f1f5f9;
    --color-text-muted:  #94a3b8;
    --color-accent:      #6366f1;
    --color-accent-hover:#818cf8;
    --chip-healthy-bg:   #14532d;
    --chip-healthy-fg:   #4ade80;
    --chip-degraded-bg:  #451a03;
    --chip-degraded-fg:  #fbbf24;
    --chip-unhealthy-bg: #450a0a;
    --chip-unhealthy-fg: #f87171;
    --chip-monitored-bg: #1e1b4b;
    --chip-monitored-fg: #a5b4fc;
  }
}
```

### Component classes

**Reset and base:**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.5;
}
a { color: var(--color-accent); text-decoration: none; }
```

**Top navigation (`.topnav`):**

```
.topnav            — fixed top bar, height --topnav-height, surface bg, border-bottom
.topnav-brand      — bold wordmark, left-pinned
.topnav-links      — flex row, centered items
.topnav-link       — nav link/button, no underline, medium weight
  .topnav-link.active  — accent color underline indicator
.topnav-health     — right-pinned; contains the health chip
.topnav-dropdown   — position: relative container
.dropdown-menu     — position: absolute, surface bg, border, shadow, min-width 160px
.dropdown-item     — full-width link, hover bg-tint
```

**Main content area (`.main-content`):**

```
.main-content      — padding-top: --topnav-height; padding: --sp-6 --sp-8; max-width 1200px; margin auto
```

**Page heading row (`.page-header`):**

```
.page-header       — display flex, justify-content space-between, align-items center; margin-bottom --sp-6
.page-title        — font-size --text-xl, font-weight --weight-bold
```

**Tables (`.data-table`):**

```
.data-table        — width 100%, border-collapse collapse, font-size --text-sm
.data-table th     — text-left, text-muted, weight-medium, padding --sp-2 --sp-3,
                      border-bottom 2px solid --color-border, white-space nowrap
.data-table td     — padding --sp-3, border-bottom 1px solid --color-border, vertical-align middle
.data-table tr:last-child td  — border-bottom: none
.data-table tbody tr:hover td — background: rgba of accent at 3% opacity (subtle highlight)
```

**Buttons:**

```
.btn               — inline-flex, align-center, gap --sp-2, padding --sp-2 --sp-4,
                      border-radius --radius-md, font-size --text-sm, weight-medium,
                      cursor pointer, border: 1px solid transparent, transition 120ms
.btn-primary       — bg accent, fg accent-fg, border accent; hover bg accent-hover
.btn-secondary     — bg transparent, fg text, border --color-border; hover bg-surface tint
.btn-danger        — bg danger, fg white, border danger; hover bg danger-hover
.btn-sm            — padding --sp-1 --sp-3; font-size smaller (0.75rem)
.btn[disabled]     — opacity 0.5, cursor not-allowed
```

**Chips / badges (`.chip`):**

```
.chip              — inline-block, padding 2px 8px, border-radius 99px,
                      font-size 0.75rem, weight-medium, white-space nowrap
.chip-healthy      — bg chip-healthy-bg, fg chip-healthy-fg
.chip-degraded     — bg chip-degraded-bg, fg chip-degraded-fg
.chip-unhealthy    — bg chip-unhealthy-bg, fg chip-unhealthy-fg
.chip-monitored    — bg chip-monitored-bg, fg chip-monitored-fg
.chip-unmonitored  — bg --color-border, fg text-muted
```

**Monospace cells:**

```
.mono              — font-family var(--font-mono), font-size --text-sm
```

Applied inline to ID, path, URL, size cells in tables. Not a separate component
— just a utility class.

**Forms:**

```
.form-group        — display flex, flex-direction column, gap --sp-1; margin-bottom --sp-4
.form-label        — font-size --text-sm, weight-medium, color text
.form-input        — width 100%, padding --sp-2 --sp-3, border 1px solid --color-border,
                      border-radius --radius-md, bg surface, color text, font-size --text-sm
                      focus: outline none, border-color accent, box-shadow 0 0 0 2px accent/20%
.form-select       — same as form-input; appearance none; background arrow SVG
.form-hint         — font-size 0.75rem, color text-muted, margin-top --sp-1
.form-error        — font-size 0.75rem, color danger, margin-top --sp-1
.form-check        — display flex, align-items center, gap --sp-2
.form-check input  — width 16px, height 16px, accent-color var(--color-accent)
```

**Inline add-form panel (`.add-panel`):**

```
.add-panel         — bg surface, border 1px solid --color-border, border-radius --radius-lg,
                      padding --sp-6, margin-bottom --sp-6
.add-panel-title   — font-size --text-lg, weight-bold, margin-bottom --sp-4
.add-panel-actions — display flex, justify-content flex-end, gap --sp-3, margin-top --sp-4
```

**Modal (`.modal-overlay`, `.modal`):**

```
.modal-overlay     — fixed inset-0, bg rgba(0,0,0,0.45), display flex,
                      align-items center, justify-content center, z-index 100
.modal             — bg surface, border-radius --radius-lg, padding --sp-6,
                      width min(560px, 90vw), max-height 85vh, overflow-y auto,
                      box-shadow 0 20px 60px rgba(0,0,0,0.3)
.modal-header      — display flex, justify-content space-between, align-items center,
                      margin-bottom --sp-4
.modal-title       — font-size --text-lg, weight-bold
.modal-close       — btn-icon: 24px square, no border, text-muted, hover text, cursor pointer
.modal-body        — margin-bottom --sp-4
.modal-footer      — display flex, justify-content flex-end, gap --sp-3
```

**Loading and empty states:**

```
.state-loading     — text-center, padding --sp-8, color text-muted, font-size --text-sm
                      include a CSS spinner (border-based, accent color)
.state-empty       — text-center, padding --sp-8, color text-muted
.state-error       — text-center, padding --sp-6, color danger, font-size --text-sm
                      include a retry button
```

**Inline test result (`.test-result`):**

```
.test-result       — font-size --text-sm, padding --sp-2 --sp-3, border-radius --radius-sm,
                      margin-left --sp-3, display inline-block
.test-result.ok    — bg chip-healthy-bg, fg chip-healthy-fg
.test-result.fail  — bg chip-unhealthy-bg, fg chip-unhealthy-fg
```

**Spinner (CSS only):**

```css
.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

Total estimated CSS: 220–260 lines. No pre-processor needed.

---

## 6. Alpine.js Component Breakdown

### 6.1 Root component — `app`

Owns: current view name, health status, polling interval.

**State shape:**

```js
Alpine.data('app', () => ({
  view: 'movies',          // 'movies' | 'download-clients' | 'indexers'
  health: null,            // null | { status, checks: [] }
  healthLoading: true,

  // Computed
  get healthLabel() {
    if (this.healthLoading) return '...'
    if (!this.health) return 'unknown'
    return this.health.status  // 'healthy' | 'degraded' | 'unhealthy'
  },
  get healthChipClass() {
    const s = this.health?.status
    if (s === 'healthy')   return 'chip chip-healthy'
    if (s === 'degraded')  return 'chip chip-degraded'
    if (s === 'unhealthy') return 'chip chip-unhealthy'
    return 'chip'
  },
}))
```

**Lifecycle (`x-init` on `<body>`):**

```js
async init() {
  await this.loadHealth()
  // Poll health every 60 seconds
  setInterval(() => this.loadHealth(), 60_000)
},

async loadHealth() {
  try {
    const res = await apiFetch('/api/v1/system/health')
    if (res.ok) this.health = await res.json()
  } catch (_) {}
  this.healthLoading = false
},

setView(v) {
  this.view = v
  history.pushState({}, '', v === 'movies' ? '/' : '/' + v)
},
```

**API calls:**

- `GET /api/v1/system/health` on init and every 60 s.
  Response: `{ status: "healthy"|"degraded"|"unhealthy", checks: [{ name, status, message }] }`

**Edge cases:**

- If `/api/v1/system/health` fails (network error), `health` stays `null` and
  the chip shows `"unknown"` in the border/muted style. No error is surfaced to
  the user — health is best-effort.

---

### 6.2 Movies view — `movies`

**State shape:**

```js
Alpine.data('movies', () => ({
  items: [],          // array of movieBody objects from the API
  loading: true,
  error: null,

  // Add modal state
  modalOpen: false,
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: null,
  selectedResult: null,

  // Form fields for Add Movie
  addLibraryId: '',
  addProfileId: '',
  addMonitored: true,
  addSaving: false,
  addError: null,

  // Reference data for dropdowns
  libraries: [],
  profiles: [],
}))
```

**Init:**

```js
async init() {
  await Promise.all([this.load(), this.loadDropdowns()])
},
```

**API calls:**

| Call | Method | Path | Fields used |
|------|--------|------|-------------|
| List movies | GET | `/api/v1/movies` | `movies[]`: id, title, year, status, monitored, quality_profile_id, library_id |
| Toggle monitored | PUT | `/api/v1/movies/{id}` | Body: `{ monitored, title, library_id, quality_profile_id }` |
| TMDB search | POST | `/api/v1/movies/lookup` | Body: `{ query }` → array of searchResultBody |
| Add movie | POST | `/api/v1/movies` | Body: `{ tmdb_id, library_id, quality_profile_id, monitored }` |
| List libraries | GET | `/api/v1/libraries` | `id`, `name` |
| List profiles | GET | `/api/v1/quality-profiles` | `id`, `name` |

Note: the lookup endpoint is `POST /api/v1/movies/lookup` with body
`{ query: "..." }` — not a GET with query params. This is different from what
plan 14 implied.

**`movieBody` fields used in the table:**

```
id                 — used as key and for PUT call
title              — display
year               — display
status             — "released" | "announced" — rendered as chip
monitored          — boolean — rendered as toggle chip
quality_profile_id — UUID — resolve to name via profiles array
```

`quality_profile_id` is a UUID; the UI resolves it to a human name using the
locally cached `profiles` array:

```js
profileName(id) {
  return this.profiles.find(p => p.id === id)?.name ?? id.slice(0, 8)
},
```

**User actions:**

- `load()` — fetches `GET /api/v1/movies`, sets `items`, clears loading/error.
- `loadDropdowns()` — fetches libraries and quality profiles in parallel.
- `toggleMonitored(movie)` — calls `PUT /api/v1/movies/{id}` with the full
  required body (title, library_id, quality_profile_id, monitored toggled).
  Optimistically updates `movie.monitored` before the call; reverts on error.
- `openModal()` — sets `modalOpen = true`, resets all search/form state.
- `closeModal()` — sets `modalOpen = false`.
- `search()` — calls `POST /api/v1/movies/lookup` with `{ query: searchQuery }`.
  Debounce is handled by a button click, not automatic. Shows results list.
- `selectResult(result)` — sets `selectedResult`, auto-populates `addLibraryId`
  and `addProfileId` with first available options if empty.
- `addMovie()` — validates `selectedResult`, `addLibraryId`, `addProfileId` are
  set. Calls `POST /api/v1/movies`. On 201: closes modal, calls `load()`. On
  409: shows "Movie already in library" inline. On other errors: shows message.

**Empty state:** "No movies. Add your first movie with the button above."

**Loading state:** spinner centered in the table area.

**Error state:** "Failed to load movies. [Retry]" with a retry button that
calls `load()`.

**Add modal search results display:**

```
Results list: show title + year. On click, select and highlight that result.
If no results returned: "No results found for '...'"
If search error: "TMDB search failed. Check server logs."
```

**searchResultBody fields used:**

```
tmdb_id        — used in POST /api/v1/movies body
title          — display
year           — display
overview       — display as subtitle (truncated to 100 chars)
```

`poster_path` and `backdrop_path` are intentionally not used in MVP (no image
loading).

---

### 6.3 Download Clients view — `downloadClients`

**State shape:**

```js
Alpine.data('downloadClients', () => ({
  items: [],          // array of downloadClientBody
  loading: true,
  error: null,

  // Inline add-form state
  showAddForm: false,
  addKind: 'qbittorrent',
  addName: '',
  addSettings: {},    // plain object; fields depend on addKind
  addSaving: false,
  addError: null,

  // Per-row test state: { [id]: { testing, result } }
  testState: {},
  // Per-row delete state: { [id]: deleting }
  deleteState: {},
}))
```

**API calls:**

| Call | Method | Path | Notes |
|------|--------|------|-------|
| List | GET | `/api/v1/download-clients` | `id, name, kind, enabled, settings` |
| Create | POST | `/api/v1/download-clients` | Body: `{ name, kind, enabled:true, priority:1, settings: {...} }` |
| Test | POST | `/api/v1/download-clients/{id}/test` | Response: `{ ok, message? }` |
| Delete | DELETE | `/api/v1/download-clients/{id}` | 204 No Content |

**`downloadClientBody` fields used in table:**

```
id       — key, test/delete operations
name     — display
kind     — display (qbittorrent, deluge)
enabled  — shown as chip: "Active" / "Disabled"
settings — parse url field for display (sanitized; password shows "***")
```

The `settings` field is `json.RawMessage` — a raw JSON object. Parse it with
`JSON.parse(JSON.stringify(item.settings))` (it arrives pre-parsed from fetch).
To extract the URL for display: `item.settings.url ?? '-'`.

**User actions:**

- `load()` — fetch list, set `items`.
- `openAddForm()` — `showAddForm = true`, reset all add fields.
- `cancelAdd()` — `showAddForm = false`.
- `testExisting(id)` — sets `testState[id] = { testing: true }`, calls test,
  sets `testState[id] = { testing: false, result: { ok, message } }`. Result
  shown inline next to the Test button for 5 seconds then cleared.
- `deleteClient(id)` — `confirm()` dialog first. Sets `deleteState[id] = true`.
  Calls DELETE. On 204: removes item from `items` array. Clears `deleteState[id]`.
- `addClient()` — builds settings object from form fields. Calls POST. On 201:
  appends to `items`, closes form. On error: shows `addError`.

**Kind selection resets settings fields:**

When `addKind` changes (via `x-model`), reset `addSettings` to `{}`.

**Settings fields rendered per kind:**

The form section is a chain of `x-show` blocks keyed on `addKind`. No dynamic
schema fetch — the fields are hardcoded per kind in the HTML. This is simpler
and more reliable than schema-driven forms for an MVP.

```
Kind: qbittorrent
  url       text  required  placeholder "http://localhost:8080"
  username  text  required  placeholder "admin"
  password  password  required
  category  text  optional  placeholder "luminarr"
  save_path text  optional  placeholder "/mnt/media/movies"

Kind: deluge
  url       text  required  placeholder "http://localhost:8112"
  password  password  required  placeholder "deluge"
  label     text  optional  placeholder "luminarr"
  save_path text  optional  placeholder "/mnt/media/movies"
```

These map exactly to the `Config` structs in `qbittorrent.go` and `deluge.go`.

**Settings object construction for POST:**

```js
buildSettings() {
  if (this.addKind === 'qbittorrent') {
    return {
      url:       this.addSettings.url,
      username:  this.addSettings.username,
      password:  this.addSettings.password,
      category:  this.addSettings.category || undefined,
      save_path: this.addSettings.save_path || undefined,
    }
  }
  if (this.addKind === 'deluge') {
    return {
      url:       this.addSettings.url,
      password:  this.addSettings.password,
      label:     this.addSettings.label || undefined,
      save_path: this.addSettings.save_path || undefined,
    }
  }
  return {}
}
```

The POST body:

```js
{
  name:     this.addName,
  kind:     this.addKind,
  enabled:  true,
  priority: 1,
  settings: this.buildSettings(),
}
```

**Empty state:** "No download clients configured. Add one with the button above."

**Table columns:** Name | Kind | URL | Status | Actions

---

### 6.4 Indexers view — `indexers`

Structurally identical to `downloadClients` with different fields.

**State shape:** same pattern, named `indexers`.

**API calls:**

| Call | Method | Path |
|------|--------|------|
| List | GET | `/api/v1/indexers` |
| Create | POST | `/api/v1/indexers` |
| Test | POST | `/api/v1/indexers/{id}/test` |
| Delete | DELETE | `/api/v1/indexers/{id}` |

**`indexerBody` fields used in table:**

```
id       — key
name     — display
kind     — "torznab" | "newznab"
enabled  — Active/Disabled chip
settings — settings.url for display; settings.api_key shows "***" (sanitized server-side)
```

**Settings fields per kind:**

```
Kind: torznab
  url     text  required  placeholder "http://prowlarr:9696/1/api"
  api_key text  optional  placeholder "your-api-key"

Kind: newznab
  url     text  required  placeholder "http://nzbhydra:5076"
  api_key text  optional  placeholder "your-api-key"
```

Both torznab and newznab have identical field sets (`url` + optional `api_key`).
The form can use a single shared block — the `addKind` label is the only
difference.

**Settings object for POST:**

```js
{
  url:     this.addSettings.url,
  api_key: this.addSettings.api_key || undefined,
}
```

The POST body:

```js
{
  name:     this.addName,
  kind:     this.addKind,  // 'torznab' or 'newznab'
  enabled:  true,
  priority: 1,
  settings: this.buildSettings(),
}
```

Default `addKind`: `'torznab'`.

**Table columns:** Name | Kind | URL | Status | Actions

---

### 6.5 Shared `apiFetch` helper

At the top of `app.js`, before any `Alpine.data()` call:

```js
const API_KEY = window.__KEY

async function apiFetch(path, options = {}) {
  const headers = {
    'X-Api-Key': API_KEY,
    ...options.headers,
  }
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json'
    options = { ...options, body: JSON.stringify(options.body) }
  }
  return fetch(path, { ...options, headers })
}
```

All `Alpine.data` components call `apiFetch` — never `fetch` directly.

**Error handling convention:**

```js
const res = await apiFetch('/api/v1/...')
if (!res.ok) {
  let msg = `HTTP ${res.status}`
  try {
    const body = await res.json()
    msg = body.detail ?? body.title ?? msg
  } catch (_) {}
  this.error = msg
  return
}
const data = await res.json()
```

The server returns RFC 9457 problem details with `title` and `detail` fields.
Prefer `detail` (more specific), fall back to `title`, fall back to HTTP status.

---

## 7. API Key Security

### Injection mechanism

1. At process startup, `NewRouter` calls `web.ServeIndex(cfg.Auth.Value())`.
2. `cfg.Auth.Value()` returns the plaintext API key (a `config.Secret` type).
3. `ServeIndex` performs `strings.ReplaceAll` on the embedded HTML bytes once.
4. The result is stored in a Go closure. No further string allocation per request.
5. The literal string `__LUMINARR_KEY__` never reaches the browser — it is
   replaced before any HTTP response is sent.

### Why this is safe

- The API key travels only over the loopback interface (or internal network),
  since Luminarr is a locally-run tool. It is not exposed over the public internet.
- The browser receives the injected key in the same HTML response it would need
  to load anyway. An attacker who can read the page can also read the key —
  but such an attacker already has access to the machine.
- No `localStorage` storage means the key is not persisted across sessions. A
  fresh page load always gets the current server-injected key.
- `Cache-Control: no-store` on the `ServeIndex` response prevents intermediary
  caches from serving stale pages with a stale key.

### What happens if the key changes

The server must restart for a new key to be injected. At restart:
- `ServeIndex` is called again with the new key.
- Existing browser tabs will get `401 Unauthorized` on the next API call.
- Refreshing the page fetches the new `index.html` with the updated key.
- No user action beyond a page refresh is required.

This is acceptable for a locally-run tool where the operator controls the
restart cycle.

### What `window.__KEY` is NOT

- Not stored in `localStorage` or `sessionStorage`.
- Not sent to any third party (all calls go to the same origin).
- Not in a cookie (no cookie jar management needed).
- Not in the URL (no leak via `Referer` headers).

---

## 8. Settings Forms — Dynamic Fields Detail

The forms are NOT schema-driven at runtime (no `/schema/{plugin}` API calls).
The fields are hardcoded in HTML for each known kind. This is deliberate: for
four plugin kinds with two or five fields each, the complexity of a dynamic
schema renderer is not justified.

### Full field tables

**qbittorrent:**

| Field | JSON key | Type | Required | Input type | Placeholder |
|-------|----------|------|----------|------------|-------------|
| URL | `url` | string | yes | text | `http://localhost:8080` |
| Username | `username` | string | yes | text | `admin` |
| Password | `password` | string | yes | password | — |
| Category | `category` | string | no | text | `luminarr` |
| Save Path | `save_path` | string | no | text | `/mnt/media/movies` |

**deluge:**

| Field | JSON key | Type | Required | Input type | Placeholder |
|-------|----------|------|----------|------------|-------------|
| URL | `url` | string | yes | text | `http://localhost:8112` |
| Password | `password` | string | yes | password | `deluge` |
| Label | `label` | string | no | text | `luminarr` |
| Save Path | `save_path` | string | no | text | `/mnt/media/movies` |

**torznab:**

| Field | JSON key | Type | Required | Input type | Placeholder |
|-------|----------|------|----------|------------|-------------|
| URL | `url` | string | yes | text | `http://prowlarr:9696/1/api` |
| API Key | `api_key` | string | no | text | (your Prowlarr/Jackett API key) |

**newznab:**

| Field | JSON key | Type | Required | Input type | Placeholder |
|-------|----------|------|----------|------------|-------------|
| URL | `url` | string | yes | text | `http://nzbhydra2:5076` |
| API Key | `api_key` | string | no | text | (your NZBHydra API key) |

### HTML pattern for per-kind conditional blocks

```html
<!-- Shared: kind selector + name -->
<div class="form-group">
  <label class="form-label">Kind</label>
  <select class="form-select" x-model="addKind" @change="addSettings = {}">
    <option value="qbittorrent">qBittorrent</option>
    <option value="deluge">Deluge</option>
  </select>
</div>
<div class="form-group">
  <label class="form-label">Name</label>
  <input class="form-input" type="text" x-model="addName" placeholder="My qBittorrent">
</div>

<!-- qbittorrent fields -->
<template x-if="addKind === 'qbittorrent'">
  <div>
    <div class="form-group">
      <label class="form-label">URL</label>
      <input class="form-input" type="text" x-model="addSettings.url"
             placeholder="http://localhost:8080">
    </div>
    <!-- username, password, category, save_path ... -->
  </div>
</template>

<!-- deluge fields -->
<template x-if="addKind === 'deluge'">
  <div>
    <!-- url, password, label, save_path ... -->
  </div>
</template>
```

Note: `<template x-if>` is used instead of `x-show` so that `x-model` bindings
for fields that are hidden are not included in form state. This avoids
submitting stale values from the previously selected kind.

### Client-side validation before POST

Before calling the API, validate:
- `addName` is non-empty (trim whitespace).
- `addSettings.url` is non-empty.
- For qbittorrent/deluge: `addSettings.password` is non-empty.
- Trim all values before sending.

Show inline validation errors per field using `form-error` class spans.

---

## 9. ASCII Mockups (for reference during implementation)

### Movies view

```
+------------------------------------------------------------+
| Luminarr    Movies    Settings v          [Healthy]        |
+------------------------------------------------------------+
| Movies                                    [+ Add Movie]    |
|                                                            |
|  Title              Year  Status    Profile    Monitored   |
|  ──────────────────────────────────────────────────────    |
|  Inception          2010  released  HD-1080p   [monitored] |
|  The Dark Knight    2008  released  HD-1080p   [monitored] |
|  Tenet              2020  released  4K HDR     [unmonitor] |
+------------------------------------------------------------+
```

### Add Movie modal

```
+--------------------------------------------+
| Add Movie                              [x]  |
|                                            |
| Search  [inception_____________] [Search]  |
|                                            |
| > Inception (2010)                         |
|   A thief who enters the dreams...         |
|   Inception: Origins (2011)                |
|                                            |
| Library          [Test Movies         v]   |
| Quality Profile  [HD-1080p            v]   |
| Monitored        [x]                       |
|                                            |
|                      [Cancel] [Add Movie]  |
+--------------------------------------------+
```

### Download Clients view

```
+------------------------------------------------------------+
| Download Clients                       [+ Add Client]      |
|                                                            |
|  Name         Kind         URL                  Status     |
|  ──────────────────────────────────────────────────────   |
|  My qBit      qbittorrent  http://localhost:808 [Active]   |
|               [Test] [Delete]           [OK] (inline)      |
+------------------------------------------------------------+
|  Add Download Client                                       |
|  Kind      [qbittorrent v]                                 |
|  Name      [__________________]                            |
|  URL       [http://localhost:8080]                         |
|  Username  [admin]                                         |
|  Password  [••••••••••]                                    |
|  Category  [luminarr]          (optional)                  |
|  Save Path [/mnt/media/movies] (optional)                  |
|                                                            |
|                             [Cancel] [Test & Save]         |
+------------------------------------------------------------+
```

### Indexers view (same pattern)

```
+------------------------------------------------------------+
| Indexers                               [+ Add Indexer]     |
|                                                            |
|  Name       Kind     URL                         Status    |
|  ──────────────────────────────────────────────────────   |
|  Prowlarr   torznab  http://prowlarr:9696/1/api   [Active] |
|             [Test] [Delete]            [OK]                |
+------------------------------------------------------------+
|  Add Indexer                                               |
|  Kind     [torznab v]                                      |
|  Name     [__________________]                             |
|  URL      [http://prowlarr:9696/1/api]                     |
|  API Key  [______________________________]  (optional)     |
|                                                            |
|                             [Cancel] [Test & Save]         |
+------------------------------------------------------------+
```

---

## 10. Build Order (Phasing)

Implement in this order to get something visible on screen as fast as possible.

### Step 1 — Shell (30 min)

1. Create `web/static/index.html` with the nav, three empty view divs, and the
   key injection placeholder.
2. Create `web/embed.go` with `ServeIndex` and `StaticFS`.
3. Wire 2 lines into `router.go`.
4. Run `go build ./...` and verify the server starts and `/` returns HTML.

Milestone: opening `http://localhost:7000` shows "Luminarr" in the page title.

### Step 2 — CSS skeleton (45 min)

Write `style.css` with all token definitions and the nav layout. The page
should look like a real app with a top bar and readable typography. No data yet.

Milestone: nav bar renders correctly in both light and dark mode.

### Step 3 — Movies list (1–2 hours)

1. Write `app.js` with `apiFetch` and the `movies` Alpine component (list only,
   no modal).
2. Wire the `x-data="movies"` into the movies view div with the table structure.
3. Implement loading, error, and empty states.
4. Add the monitored toggle (PUT call).

Milestone: movies table renders real data from the API with a working monitored
toggle.

### Step 4 — Add Movie modal (1–2 hours)

1. Add modal HTML to `index.html`.
2. Extend the `movies` component with modal state, search, and add logic.
3. Implement the `loadDropdowns` call and populate library/profile selectors.

Milestone: can search TMDB and add a movie to the library from the UI.

### Step 5 — Health chip (30 min)

1. Add `app` root component with `loadHealth` and polling.
2. Wire health chip into the nav.

Milestone: health status shows in top-right corner.

### Step 6 — Download Clients view (1–1.5 hours)

1. Write `downloadClients` Alpine component.
2. Implement list, inline add form, test, and delete.
3. Write per-kind field blocks for qbittorrent and deluge.

Milestone: can add a qBittorrent instance and test it.

### Step 7 — Indexers view (45 min)

1. Copy the `downloadClients` pattern for `indexers`.
2. Write the torznab/newznab field blocks (they are nearly identical).

Milestone: can add a torznab indexer and test it.

### Step 8 — Polish and edge cases (1 hour)

- Confirm button states (disabled during in-flight requests).
- Error messages clear on retry.
- Modal closes on Escape key: `@keydown.escape.window="closeModal()"`.
- Tab focus trapping is out of scope for MVP; accessibility can be improved later.
- Verify dark mode renders correctly.
- Test with empty database (no movies, no clients, no indexers).

---

## 11. Out of Scope (Explicitly Deferred)

These items are documented here so they do not creep into the MVP implementation.

| Feature | Reason deferred |
|---------|----------------|
| Poster artwork (TMDB images) | Requires CORS proxy or server-side image serving; adds complexity |
| Movie detail page | Requires a new view and routing; separate phase |
| Queue / active downloads view | Queue data is not meaningful without WS updates |
| Quality profile editor | Complex multi-field form; separate phase |
| Library management UI | Rarely changed after initial setup |
| Notifications settings UI | Out of MVP scope per plan 14 |
| Dark mode toggle | Auto via `prefers-color-scheme` only; explicit toggle is cosmetic |
| Pagination | Personal collections are small; load-all is acceptable |
| WebSocket live updates | Deferred in the backend plan; no WS endpoint served yet |
| Keyboard navigation / ARIA | Accessibility improvements for a later phase |
| Edit existing clients/indexers | MVP covers add/test/delete; edit requires PUT forms |
| Enabled/disabled toggle per item | Can be done with a PUT; deferred to polish phase |
| Movie delete from UI | High-risk operation; can be done via API for now |

---

## 12. Key Decisions Recorded

**Why `<template x-if>` instead of `x-show` for form fields:**
`x-show` keeps the DOM element and its `x-model` binding alive. If the user
fills in qbittorrent fields, switches to deluge, then switches back, `x-show`
fields retain stale values. `x-if` destroys and recreates the DOM, resetting
values cleanly. The perf cost is negligible for these tiny forms.

**Why not debounced TMDB search:**
Autocomplete TMDB search would cost a request per keystroke. A manual search
button is intentionally simpler, avoids rate-limiting issues with TMDB, and
matches the Radarr UX that users already know.

**Why not `Alpine.store` for shared state:**
The three views (movies, download-clients, indexers) have no shared mutable
state that the root `app` component needs to read. The root `app` component
only needs the health data. Using stores for per-view data would add indirection
without benefit. The health data is on `app` itself since the nav renders it.

**Why the key is pre-computed at startup, not per request:**
The key does not change at runtime. Pre-computing avoids one `strings.ReplaceAll`
and one string allocation per page load. The closure captures the `[]byte`
result — the handler is a trivial `w.Write` call.

**Why the `/static/` prefix for assets:**
If assets were served at `/`, a URL like `/app.js` would match the SPA catch-all
in some routers. The `/static/` prefix makes the intent explicit and keeps
asset URLs stable regardless of SPA routing logic. It also allows easy future
differentiation (e.g., `/static/fonts/`, `/static/img/`).
