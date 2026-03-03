# Phase 10 — Frontend (MVP)

## Goal

A minimal, functional web UI served from the Go binary itself. No Node.js, no build
step, no bundler. The UI is an embedded static SPA that talks to the existing REST API.

Scope is deliberately narrow: enough to replace curl for day-to-day use.

---

## What We're Building

Three views:

1. **Movies** — table of monitored movies, search/add new
2. **Settings → Download Clients** — add/test/remove qBittorrent (and others)
3. **Settings → Indexers** — add/test/remove indexers (torznab/newznab)

That's it for the MVP. Quality profiles, libraries, notifications, queue — all
accessible via the API but not yet in the UI.

---

## Tech Stack

### Rendering: Alpine.js (CDN, no build step)

Alpine.js is a ~15 KB script tag. It provides reactive `x-data`, `x-for`, `x-show`,
`x-on` directives directly in HTML. No virtual DOM, no JSX, no compiler.

Why not vanilla JS: Alpine removes the imperative DOM manipulation boilerplate while
staying HTML-first. The resulting code is readable without knowing any framework.

Why not React/Vue/Svelte: all require a build pipeline (Node, npm, bundler). We want
`go build` to be the only build step.

Why not HTMX: HTMX is server-driven and would require Go template endpoints alongside
the existing huma/JSON API. Alpine keeps the API unchanged.

### Styling: Hand-written CSS with custom properties

No Tailwind, no Bootstrap. ~200 lines of CSS using `--var` tokens for colors and
spacing. This keeps the bundle trivially small and makes theming straightforward.

**Design direction (intentionally different from Radarr):**
- Light theme by default, `prefers-color-scheme` dark mode via `@media`
- Top navigation bar (not a sidebar)
- Table-first layout for lists (not poster cards)
- Monospace font for IDs, paths, sizes — communicates "technical tool"
- Accent color: indigo (`#4f46e5`) — not gold/yellow
- Status chips use filled backgrounds, not outlines

### Serving: `embed.FS` in Go + API key injection

```
web/
  static/
    index.html     ← single HTML file; all views rendered by Alpine
    app.js         ← Alpine components + fetch wrappers
    style.css      ← ~200 lines of CSS
  embed.go         ← //go:embed static + ServeIndex handler
```

The router serves `web/static/` under `/`. API routes (`/api/`, `/health`) take
precedence. All unmatched paths return `index.html` for client-side routing.

**API key injection:** because the frontend is served by the same process that owns the
API key, the server injects it directly into `index.html` at serve time. No login page,
no localStorage prompt, no round-trip required.

The `web` package exposes a `ServeIndex(key string) http.HandlerFunc` that reads the
embedded `index.html`, performs a single string replace of the placeholder
`__LUMINARR_KEY__`, and writes the result. Every other static file (`app.js`,
`style.css`) is served verbatim by `http.FileServer`.

```
index.html contains:
  <script>window.__KEY = "__LUMINARR_KEY__"</script>

At serve time becomes:
  <script>window.__KEY = "a3f9b2..."</script>
```

`app.js` reads `window.__KEY` once at startup and uses it for all API calls. No
localStorage, no user interaction.

No changes to the existing API. The frontend is a consumer of it.

---

## File Structure

```
web/
  static/
    index.html
    app.js
    style.css
  embed.go
internal/api/router.go    ← add static file serving (3 lines)
```

---

## View Specifications

### Nav Bar

```
[ Luminarr ]   [ Movies ]  [ Settings ▾ ]          [ system status chip ]
```

- "Luminarr" is the wordmark / home link
- Settings dropdown: Download Clients | Indexers
- Status chip: green "ok" or red "degraded" pulled from `GET /health`

---

### Movies View (`/`)

```
Movies                                          [ + Add Movie ]

 Title                 Year   Status     Quality Profile   Monitored
 ─────────────────────────────────────────────────────────────────────
 Inception              2010   released   HD                ● Yes
 The Dark Knight        2008   released   HD                ● Yes
 Tenet                  2020   released   4K HDR            ○ No

```

- Fetches `GET /api/v1/movies`
- Monitored toggle calls `PUT /api/v1/movies/{id}` inline
- Row click → future: movie detail (out of scope for MVP)
- "+ Add Movie" opens a search modal

**Add Movie Modal:**

```
  ┌──────────────────────────────────────────────────┐
  │  Add Movie                                    ✕  │
  │                                                  │
  │  Search  [ Inception_______________ ] [Search]   │
  │                                                  │
  │  Results:                                        │
  │  ● Inception (2010)  — A thief who steals...     │
  │    Inception: Special Edition (2011)             │
  │                                                  │
  │  Library          [ Test Movies          ▾ ]     │
  │  Quality Profile  [ HD                   ▾ ]     │
  │  Monitored        [✓]                            │
  │                                                  │
  │                         [Cancel]  [Add Movie]    │
  └──────────────────────────────────────────────────┘
```

- Search calls `GET /api/v1/movies/search?q=...`
- Populate Library and Quality Profile dropdowns from their respective list endpoints
- "Add Movie" calls `POST /api/v1/movies`

---

### Settings → Download Clients (`/settings/download-clients`)

```
Download Clients                             [ + Add Client ]

 Name           Kind          URL                    Status
 ──────────────────────────────────────────────────────────
 qBittorrent    qbittorrent   http://localhost:8080  ✓ OK   [Test] [Delete]

```

- Fetches `GET /api/v1/download-clients`
- "Test" calls `POST /api/v1/download-clients/{id}/test` and shows inline result
- "Delete" calls `DELETE /api/v1/download-clients/{id}` with a confirm prompt
- "+ Add Client" opens an add form (kind selector → dynamic settings fields)

**Add Client Form (inline expansion, not modal):**

```
  Kind       [ qbittorrent ▾ ]
  Name       [ _____________ ]
  URL        [ http://localhost:8080 ]
  Username   [ admin ]
  Password   [ ••••••••••• ]
  Category   [ luminarr ]   (optional)
  Save Path  [ /movies ]    (optional)

                             [Cancel]  [Test & Save]
```

- "Test & Save": calls test endpoint first; only saves on success
- Settings fields are driven by kind selection — different fields per kind

---

### Settings → Indexers (`/settings/indexers`)

Same pattern as Download Clients.

```
Indexers                                         [ + Add Indexer ]

 Name        Kind      URL                         Status
 ──────────────────────────────────────────────────────────────
 Prowlarr    torznab   http://prowlarr:9696/1/api  ✓ OK   [Test] [Delete]

```

Add form fields for torznab:
- Name, URL, API Key

Add form fields for newznab:
- Name, URL, API Key

---

## Alpine.js Component Architecture

```js
// app.js top-level structure

// Key is injected by the server into window.__KEY at page load — no prompt needed.
const API_KEY = window.__KEY

Alpine.data('app', () => ({        // root component: routing, nav state
  view: 'movies',
  settingsTab: null,
}))

Alpine.data('movies', () => ({     // movies list + add modal
  items: [],
  showAddModal: false,
  searchQuery: '',
  searchResults: [],
  ...
}))

Alpine.data('downloadClients', () => ({   // download clients settings
  items: [],
  showAddForm: false,
  ...
}))

Alpine.data('indexers', () => ({          // indexers settings
  items: [],
  showAddForm: false,
  ...
}))
```

All fetch calls wrap `fetch()` with the injected key:

```js
async function apiFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json', ...options.headers }
  })
}
```

No localStorage, no prompt, no session management.

---

## Router Integration

`internal/api/router.go`:

```go
// Serve index.html with the API key injected for all non-API paths.
r.Get("/*", web.ServeIndex(cfg.Auth.Value()))

// Serve static assets (app.js, style.css) verbatim.
r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(web.StaticFS())))
```

`web/embed.go`:

```go
package web

import (
    "embed"
    "io/fs"
    "net/http"
    "strings"
)

//go:embed static
var staticFiles embed.FS

// ServeIndex returns a handler that injects the API key into index.html.
func ServeIndex(apiKey string) http.HandlerFunc {
    raw, _ := staticFiles.ReadFile("static/index.html")
    html := strings.ReplaceAll(string(raw), "__LUMINARR_KEY__", apiKey)
    return func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "text/html; charset=utf-8")
        _, _ = w.Write([]byte(html))
    }
}

// StaticFS returns the embedded static directory for serving assets.
func StaticFS() http.FileSystem {
    sub, _ := fs.Sub(staticFiles, "static")
    return http.FS(sub)
}
```

The key is substituted once at startup (not per-request). `/api/*` and `/health`
routes registered before `/*` take precedence in chi.

---

## Explicitly Out of Scope (MVP)

- Poster artwork / TMDB images
- Movie detail page
- Queue / active downloads view
- Quality profile editor
- Library management
- Notifications settings
- Dark mode toggle (auto via `prefers-color-scheme` only)
- Pagination (load all, reasonable for personal collections < 1000 movies)
- WebSocket live updates

These can follow in a Phase 10b once the MVP is validated.

---

## Deliverables Checklist

- [ ] `web/static/index.html` — HTML shell with Alpine + nav
- [ ] `web/static/style.css` — ~200 line stylesheet, CSS custom properties
- [ ] `web/static/app.js` — Alpine components for all three views
- [ ] `web/embed.go` — embed declaration + `ServeIndex(key)` + `StaticFS()`
- [ ] `internal/api/router.go` — static file serving wired in
- [ ] API key injected server-side into `index.html` at startup (no prompt)
- [ ] Movies view: list, monitored toggle, add modal with TMDB search
- [ ] Download Clients view: list, add form, test, delete
- [ ] Indexers view: list, add form, test, delete
