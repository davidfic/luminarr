# React Frontend — Detailed Implementation Plan

> **Status**: Planning (design agent recommendations pending)
> **Stack**: React 18 + Vite + TypeScript + Tanstack Query v5
> **Replaces**: Alpine.js prototype in `web/static/`
> **Design system**: shadcn/ui + Tailwind CSS (see §Design System)

---

## 1. Guiding Principles

Lessons from the Alpine.js prototype:
- **Never show stale empty state.** Use `isLoading` / skeleton screens; never initialise `items: []` with `loading: false`.
- **Tanstack Query owns server state.** No manual `loading` flags, no manual refetch timers. Let the library do it.
- **Build one view at a time, fully.** Confirm it works end-to-end before moving on.
- **API first.** Every UI element is driven by the real API — no hard-coded data, no mocks in production code.
- **Measure, then build.** Run `go test ./...` and verify API behaviour with curl before wiring UI.

---

## 2. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Bundler | Vite 5 | Fast HMR, zero-config TS, optimised builds |
| Framework | React 18 | Team decision; Suspense + concurrent features |
| Language | TypeScript 5 | End-to-end type safety |
| Server state | Tanstack Query v5 | Automatic background refetch, stale-while-revalidate, cache invalidation — solves Alpine stale-state bug by design |
| Routing | React Router v6 | Declarative, nested routes, loader pattern |
| UI components | shadcn/ui + Tailwind CSS | Owned code, accessible, dark mode first, composable |
| Forms | React Hook Form + Zod | Type-safe validation, minimal re-renders |
| Icons | lucide-react | Consistent, tree-shakeable |
| Date formatting | date-fns | Lightweight, tree-shakeable |
| HTTP | native `fetch` (wrapped) | No extra dep; Tanstack Query handles caching |

---

## 3. Project Layout

```
web/
├── ui/                         # React source (Vite project root)
│   ├── src/
│   │   ├── api/                # API client + Tanstack Query hooks
│   │   │   ├── client.ts       # fetch wrapper (injects X-Api-Key, base URL)
│   │   │   ├── movies.ts       # useMovies(), useMovie(), useLookup(), etc.
│   │   │   ├── indexers.ts
│   │   │   ├── downloaders.ts
│   │   │   ├── notifications.ts
│   │   │   ├── libraries.ts
│   │   │   ├── quality-profiles.ts
│   │   │   ├── queue.ts
│   │   │   ├── history.ts
│   │   │   └── system.ts
│   │   ├── components/         # Shared, reusable UI pieces
│   │   │   ├── ui/             # shadcn/ui generated components
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── QualityBadge.tsx
│   │   │   ├── SkeletonTable.tsx
│   │   │   ├── SkeletonCards.tsx
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── ErrorBanner.tsx
│   │   ├── layouts/
│   │   │   ├── Shell.tsx       # Sidebar + main content wrapper
│   │   │   └── SettingsShell.tsx  # Settings sub-nav wrapper
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── movies/
│   │   │   │   ├── MovieList.tsx
│   │   │   │   ├── MovieDetail.tsx
│   │   │   │   └── AddMovieDialog.tsx
│   │   │   ├── queue/
│   │   │   │   └── Queue.tsx
│   │   │   ├── history/
│   │   │   │   └── History.tsx
│   │   │   ├── settings/
│   │   │   │   ├── libraries/
│   │   │   │   │   ├── LibraryList.tsx
│   │   │   │   │   └── LibraryForm.tsx
│   │   │   │   ├── quality-profiles/
│   │   │   │   │   ├── QualityProfileList.tsx
│   │   │   │   │   └── QualityProfileForm.tsx
│   │   │   │   ├── indexers/
│   │   │   │   │   ├── IndexerList.tsx
│   │   │   │   │   └── IndexerForm.tsx
│   │   │   │   ├── download-clients/
│   │   │   │   │   ├── DownloadClientList.tsx
│   │   │   │   │   └── DownloadClientForm.tsx
│   │   │   │   ├── notifications/
│   │   │   │   │   ├── NotificationList.tsx
│   │   │   │   │   └── NotificationForm.tsx
│   │   │   │   └── system/
│   │   │   │       └── SystemPage.tsx
│   │   ├── types/              # TypeScript interfaces (mirror API shapes)
│   │   │   ├── movie.ts
│   │   │   ├── indexer.ts
│   │   │   ├── downloader.ts
│   │   │   ├── notification.ts
│   │   │   ├── library.ts
│   │   │   ├── quality.ts
│   │   │   ├── queue.ts
│   │   │   ├── history.ts
│   │   │   └── system.ts
│   │   ├── hooks/
│   │   │   └── useApiKey.ts    # reads window.__LUMINARR_KEY__
│   │   ├── lib/
│   │   │   └── utils.ts        # cn() helper, formatBytes, etc.
│   │   ├── App.tsx             # Router setup
│   │   └── main.tsx            # Entry point, QueryClientProvider
│   ├── index.html              # Template with __LUMINARR_KEY__ placeholder
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── static/                     # Vite build output (committed, embedded in binary)
│   └── .gitkeep
└── embed.go                    # Updated to embed static/ correctly
```

---

## 4. API Key Injection Strategy

The existing Go mechanism (`ServeIndex` replaces `__LUMINARR_KEY__`) continues to work.

In `web/ui/index.html` (the Vite template):
```html
<script>window.__LUMINARR_KEY__ = "__LUMINARR_KEY__";</script>
```

In `web/ui/src/hooks/useApiKey.ts`:
```ts
export function getApiKey(): string {
  return (window as any).__LUMINARR_KEY__ ?? "";
}
```

In `web/ui/src/api/client.ts`:
```ts
import { getApiKey } from "../hooks/useApiKey";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": getApiKey(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ title: res.statusText }));
    throw new APIError(res.status, err.title ?? res.statusText, err.detail);
  }
  return res.json();
}

export class APIError extends Error {
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
  }
}
```

---

## 5. Vite Configuration

```ts
// web/ui/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "../static",   // outputs directly into web/static/
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:7878",
        changeOrigin: true,
      },
    },
  },
});
```

The `server.proxy` allows `vite dev` to hit the real Go backend during development without CORS issues. Set `VITE_API_KEY` env var or hardcode a dev key during local dev (never commit keys).

---

## 6. Go embed.go Update

After the React build, `web/static/` will contain `index.html`, `assets/`, etc.
The `embed.go` needs a minor update to serve SPA routing correctly:

```go
// ServeIndex reads the built React index.html and injects the API key.
// For SPA routing, ALL non-asset, non-API GET requests return this handler.
// (Already handled by r.Get("/*", web.ServeIndex(...)) in router.go)
```

No structural change needed — the existing `r.Get("/*", web.ServeIndex(...))` already handles SPA fallback routing. All deep links (e.g., `/movies/abc`) return `index.html` and React Router handles client-side routing.

The `StaticFS()` function continues to serve `/static/assets/*` for JS/CSS bundles.

**IMPORTANT**: Update the `/static/*` route in `router.go` to serve `/assets/*` instead, since Vite outputs assets to `assets/`:

```go
r.Handle("/assets/*", http.StripPrefix("/assets", http.FileServer(web.AssetsFS())))
```

Update `embed.go` to expose `AssetsFS()` pointing to `static/assets/`.

---

## 7. Design System

*Recommendations from frontend-design agent — incorporated 2026-03-02.*

### 7.1 Component Library: shadcn/ui + Tailwind CSS

shadcn/ui wins over alternatives (Mantine, Radix + CSS, MUI) because:
- Components live in the repo — no fighting library opinions, no override specificity wars
- Radix UI primitives underneath handle accessibility (focus management, ARIA, keyboard nav)
- Tailwind gives consistent spacing/color tokens without writing CSS files
- Dark mode first, naturally
- Ecosystem (cmdk, vaul, recharts) integrates seamlessly

### 7.2 Color Palette: "Deep Violet"

Violet accent (not blue) — cinematic, premium, doesn't conflict with status colors (blue=downloading, green=completed).
Near-black base (#0d0d12) — pure black is flat; this has enough blue-gray shift for depth.

```css
:root {
  /* Backgrounds — layered depth */
  --bg-base:     #0d0d12;   /* page background */
  --bg-surface:  #13131a;   /* cards, sidebar */
  --bg-elevated: #1c1c27;   /* modals, dropdowns, hover */
  --bg-subtle:   #252535;   /* input backgrounds, table rows alt */

  /* Borders */
  --border-subtle:  #ffffff14;
  --border-default: #ffffff22;
  --border-strong:  #ffffff44;

  /* Primary accent — violet */
  --accent-primary:   #7c6af7;
  --accent-hover:     #9283f9;
  --accent-muted:     #7c6af720;
  --accent-foreground:#ffffff;

  /* Text */
  --text-primary:   #f0f0f5;
  --text-secondary: #9898b0;
  --text-muted:     #5a5a72;
  --text-inverse:   #0d0d12;

  /* Status */
  --status-downloading: #3b9eff;
  --status-completed:   #34d399;
  --status-failed:      #f87171;
  --status-queued:      #a78bfa;
  --status-paused:      #fb923c;
  --status-missing:     #5a5a72;

  /* Semantic */
  --color-danger:  #f87171;
  --color-warning: #fbbf24;
  --color-success: #34d399;
  --color-info:    #3b9eff;
}
```

### 7.3 Status Badge Design

Subtle tinted backgrounds; solid fill only for Failed (demands attention); pulsing dot for Downloading.

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.badge-downloading { color: var(--status-downloading); background: color-mix(in srgb, var(--status-downloading) 15%, transparent); }
.badge-completed   { color: var(--status-completed);   background: color-mix(in srgb, var(--status-completed)   15%, transparent); }
.badge-failed      { color: #fff; background: var(--status-failed); }  /* solid — demands action */
.badge-queued      { color: var(--status-queued);      background: color-mix(in srgb, var(--status-queued)      15%, transparent); }
.badge-paused      { color: var(--status-paused);      background: color-mix(in srgb, var(--status-paused)      15%, transparent); }
.badge-missing     { color: var(--text-muted);         background: var(--bg-subtle); }
```

### 7.4 Typography

```css
/* Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
}
```

Usage rules:
- Movie titles: `text-lg`, `font-semibold`, `text-primary`
- Metadata (year, runtime): `text-sm`, `text-secondary`
- Table rows: `text-sm`, `font-normal`
- File paths, hashes, quality strings: `font-mono`, `text-xs`, `text-secondary`
- Dashboard stat numbers: `text-3xl`, `font-bold`, `text-primary`
- Form labels: `text-sm`, `font-medium`, `text-secondary`

### 7.5 Sidebar

Fixed, 240px expanded / 60px icon-only collapsed. User-controlled toggle (persist to localStorage). No hover-to-expand flyout.

Groups:
- **Library**: Dashboard, Movies, Queue, History (no group label)
- **Configuration**: Libraries, Quality Profiles, Indexers, Download Clients, Notifications, System

Specs:
- Nav items: 40px height, 12px horizontal padding, `border-radius: 6px`
- Active: `background: var(--accent-muted)`, `2px solid var(--accent-primary)` left border, accent text
- Hover: `background: var(--bg-elevated)`
- Icons: Lucide, 18px, `strokeWidth={1.5}`
- Group labels: `text-xs`, `font-medium`, `text-muted`, uppercase, `letter-spacing: 0.08em`
- Collapse toggle: chevron at bottom, not top
- Collapsed state: hide labels, center icons, Radix tooltip on hover

### 7.6 Card Grid vs Table

- **Movie library → Card Grid** (primary) with list-view toggle
  - Grid: `repeat(auto-fill, minmax(160px, 1fr))`, gap 16px
  - Card: `2/3` aspect ratio poster, `border-radius: 8px`
  - Title + year overlay slides up on hover with dark gradient scrim
  - Status badge: top-right corner, 8px inset
  - Quality badge: top-left corner, 8px inset
  - List view (toggle): table with 48×72px poster thumbnail column
- **Queue → Table** (operational data: progress %, sizes, speeds, actions)
- **All settings lists → Table** (Indexers, Downloaders, Notifications, Libraries, Quality Profiles)

### 7.7 Spacing and Layout

```css
:root {
  /* Border radius */
  --radius-sm: 4px;    /* badges */
  --radius-md: 6px;    /* buttons, inputs, nav items */
  --radius-lg: 8px;    /* cards, panels */
  --radius-xl: 12px;   /* modals, drawers */

  /* Shadows — strong opacity on dark themes */
  --shadow-card:  0 2px 8px rgba(0, 0, 0, 0.4);
  --shadow-modal: 0 24px 64px rgba(0, 0, 0, 0.7);

  /* Content */
  --content-padding: 24px;
  --content-max-width: 1400px;
}
```

- Table row height: 52px
- Modal widths: sm=440px, md=560px, lg=720px; backdrop `blur(4px)` + `rgba(0,0,0,0.6)`
- Settings forms: max-width 680px

### 7.8 Animation Philosophy

Minimal and purposeful. Every animation communicates state, not performance.

**Use:**
- Skeleton screens (shimmer animation) — not spinners — for all loading states
- Fade-in for page transitions: `opacity 0→1`, `200ms ease`
- Slide-up for modals: `translateY(12px)→0` + fade, `200ms ease-out`
- Pulsing dot on Downloading badge
- `transition: background 150ms ease` on interactive elements
- Progress bar width: `600ms linear`

**Avoid:**
- Lateral page transitions
- Staggered list animations (entry delay per row)
- Card hover scale/lift effects
- Spinners or loading indicators for requests completing < 800ms (add 200ms delay before showing)

### 7.9 Tailwind Config

```ts
// web/ui/tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#0d0d12',
          surface:  '#13131a',
          elevated: '#1c1c27',
          subtle:   '#252535',
        },
        accent: {
          DEFAULT: '#7c6af7',
          hover:   '#9283f9',
          muted:   '#7c6af720',
        },
        text: {
          primary:   '#f0f0f5',
          secondary: '#9898b0',
          muted:     '#5a5a72',
        },
        status: {
          downloading: '#3b9eff',
          completed:   '#34d399',
          failed:      '#f87171',
          queued:      '#a78bfa',
          paused:      '#fb923c',
          missing:     '#5a5a72',
        },
        border: {
          subtle:  '#ffffff14',
          default: '#ffffff22',
          strong:  '#ffffff44',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        card:  '0 2px 8px rgba(0,0,0,0.4)',
        modal: '0 24px 64px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
}

export default config
```

### 7.10 Base CSS

```css
/* web/ui/src/index.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { @apply bg-bg-base text-text-primary font-sans; }
  body { @apply min-h-screen antialiased; }
}
```

---

## 8. Navigation Structure

```
Sidebar:
  [icon] Dashboard          /
  [icon] Movies             /movies
  [icon] Queue              /queue
  [icon] History            /history
  ─────── Settings ──────────
  [icon] Libraries          /settings/libraries
  [icon] Quality Profiles   /settings/quality-profiles
  [icon] Indexers           /settings/indexers
  [icon] Download Clients   /settings/download-clients
  [icon] Notifications      /settings/notifications
  [icon] System             /settings/system
```

---

## 9. Page Specifications

### 9.1 Dashboard (`/`)
- Stats row: Total Movies, Monitored, Missing, Queue Size
- Health warnings banner (if any health checks failing)
- Recent activity feed (last 10 history entries)
- Tasks status (last run times for rss_sync, refresh_metadata, etc.)
- Data: `GET /system/status`, `GET /system/health`, `GET /history?per_page=10`, `GET /tasks`

### 9.2 Movies (`/movies`)
- **List view**: Filterable table with poster thumbnail, title, year, library, status badge, quality badge
- **Toolbar**: Search input, Library filter dropdown, Monitored filter, "Add Movie" button
- **Add Movie dialog**: Search TMDB, select result, pick Library + Quality Profile, set monitored
- **Movie detail** (`/movies/:id`): Full-width page with poster, metadata, file info, releases tab, history tab
- **Releases tab**: Table of available releases with grab button
- Data: `GET /movies`, `POST /movies/lookup`, `POST /movies`, `GET /movies/:id/releases`, `POST /movies/:id/releases/:guid/grab`

### 9.3 Queue (`/queue`)
- Live table: Title, Size, Progress bar, Status, ETA, Actions (remove)
- Tanstack Query refetchInterval: 5000ms when any item is downloading
- Status-based row styling
- Data: `GET /queue`, `DELETE /queue/:id`

### 9.4 History (`/history`)
- Paginated table: Movie, Release, Date, Status, Download client
- Movie name links to movie detail
- Data: `GET /history`

### 9.5 Libraries (`/settings/libraries`)
- Table: Name, Root Path, Movie Count, Free Space, Quality Profile, Actions
- Add/Edit: slide-over or modal form
- Fields: name, root_path, default_quality_profile_id, min_free_space_gb
- Data: `GET /libraries`, `POST /libraries`, `PUT /libraries/:id`, `DELETE /libraries/:id`

### 9.6 Quality Profiles (`/settings/quality-profiles`)
- Table: Name, Cutoff, # Qualities, Upgrade Allowed
- Form: name, cutoff select, ordered quality list (drag to reorder), upgrade settings
- Data: `GET /quality-profiles`, `POST /quality-profiles`, etc.

### 9.7 Indexers (`/settings/indexers`)
- Table: Name, Plugin, Priority, Enabled toggle, Test button, Edit/Delete actions
- Form: dynamic — loads JSON schema from `GET /indexers/schema/:plugin`, renders fields from schema
- Test button: calls `POST /indexers/:id/test`, shows inline success/error
- Data: `GET /indexers`, `GET /indexers/schema/:plugin`, `POST /indexers/:id/test`

### 9.8 Download Clients (`/settings/download-clients`)
- Same pattern as Indexers
- Fields specific to each plugin (qbittorrent: url, username, password, category, save_path)
- Dynamic form from schema
- Data: `GET /download-clients`, etc.

### 9.9 Notifications (`/settings/notifications`)
- Same pattern as Indexers/Download Clients
- Plugins: discord, webhook, email
- Data: `GET /notifications`, etc.

### 9.10 System (`/settings/system`)
Sub-sections on one page (or tabs):
- **Status**: app version, uptime, db type, AI enabled
- **Health**: health check items with ok/warning indicators
- **Tasks**: list with last_run, next_run, manual trigger button
- **Logs**: last 100 lines, level filter (error/warn/info/debug)
- **Configuration**: TMDB API key field (already hot-swaps; show current status)
- Data: `GET /system/status`, `GET /system/health`, `GET /tasks`, `POST /tasks/:name/run`, `GET /system/logs`, `PUT /system/config`

---

## 10. Tanstack Query Patterns

### Standard query hook (list):
```ts
// api/indexers.ts
export function useIndexers() {
  return useQuery({
    queryKey: ["indexers"],
    queryFn: () => apiFetch<IndexerConfig[]>("/indexers"),
  });
}
```

### Standard mutation hook (create):
```ts
export function useCreateIndexer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIndexerRequest) =>
      apiFetch<IndexerConfig>("/indexers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indexers"] }),
  });
}
```

### Polling (Queue):
```ts
export function useQueue() {
  const { data } = useQuery({
    queryKey: ["queue"],
    queryFn: () => apiFetch<QueueResponse>("/queue"),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasActive = items.some(i => i.status === "downloading" || i.status === "queued");
      return hasActive ? 5000 : 30000;
    },
  });
}
```

### Loading state (never empty + loading=false):
```tsx
function IndexerList() {
  const { data, isLoading, error } = useIndexers();

  if (isLoading) return <SkeletonTable rows={5} cols={4} />;
  if (error)     return <ErrorBanner message={error.message} />;
  if (!data?.length) return <EmptyState message="No indexers configured" action="Add Indexer" />;

  return <table>...</table>;
}
```

---

## 11. Form Pattern (Dynamic Settings)

Indexers/Download Clients/Notifications use plugin-specific settings stored as opaque JSON.
The server exposes a JSON Schema per plugin at `GET /{resource}/schema/{plugin}`.

Strategy: **Don't render from JSON Schema dynamically** (fragile, over-engineered for current plugin count). Instead, write a typed settings form component per plugin:

```
IndexerForm → plugin === "torznab" → TorznabSettingsFields
           → plugin === "newznab" → NewznabSettingsFields

DownloadClientForm → plugin === "qbittorrent" → QBittorrentSettingsFields
                  → plugin === "deluge"       → DelugeSettingsFields

NotificationForm → plugin === "discord" → DiscordSettingsFields
                → plugin === "webhook"  → WebhookSettingsFields
                → plugin === "email"    → EmailSettingsFields
```

Each settings component is a simple set of React Hook Form fields. Total ~6 components, all small.

---

## 12. Error Handling

All errors from `apiFetch` are typed `APIError` instances with `status`, `message`, and optional `detail`.

Global: React Query's `useQuery`/`useMutation` error states handle per-component display.
No global error boundary needed for API errors — show inline in each component.

Toast notifications (via shadcn/ui `Toaster`) for:
- Mutation success ("Indexer saved")
- Mutation failure ("Failed to save: connection refused")
- Grab success/failure

---

## 13. Build Integration with Go

### Makefile targets
```makefile
ui/install:
	cd web/ui && npm install

ui/dev:
	cd web/ui && npm run dev

ui/build:
	cd web/ui && npm run build
	# Output lands in web/static/

build: ui/build
	go build ./cmd/luminarr
```

### Development workflow
```bash
# Terminal 1: Go backend
go run ./cmd/luminarr

# Terminal 2: Vite dev server (proxies /api to :7878)
cd web/ui && npm run dev
# Open http://localhost:5173
```

The Vite dev server proxies `/api/*` to `localhost:7878`. The API key is read from the Go server's index.html response — but in dev mode, set it via `window.__LUMINARR_KEY__` in the browser console or a local `.env` file with `VITE_DEV_API_KEY`.

### `.gitignore` updates
```gitignore
# Vite
web/ui/node_modules/
web/ui/dist/

# Build output (IMPORTANT: web/static/ IS committed — it's the embedded binary content)
# Do NOT gitignore web/static/
```

---

## 14. TypeScript Types (key shapes)

```ts
// types/movie.ts
export interface Movie {
  id: string;
  title: string;
  year: number;
  tmdb_id: number;
  imdb_id?: string;
  overview?: string;
  poster_path?: string;
  status: string;
  monitored: boolean;
  library_id?: string;
  quality_profile_id?: string;
  tags: string[];
  added_at: string;
}

// types/indexer.ts
export interface IndexerConfig {
  id: string;
  name: string;
  plugin: string;
  enabled: boolean;
  priority: number;
  settings: Record<string, unknown>; // sanitized (no secrets)
  tags: string[];
  created_at: string;
}

// types/queue.ts
export interface QueueItem {
  id: string;
  client_item_id: string;
  movie_id?: string;
  title: string;
  status: "queued" | "downloading" | "completed" | "failed" | "paused";
  size: number;
  downloaded: number;
  seed_ratio: number;
  error?: string;
  content_path?: string;
}

// types/system.ts
export interface SystemStatus {
  app_name: string;
  version: string;
  go_version: string;
  db_type: string;
  uptime_seconds: number;
  start_time: string;
  ai_enabled: boolean;
  tmdb_enabled: boolean;
}
```

---

## 15. Implementation Phases

### Phase A — Foundation (do this first, verify before moving on)
1. `cd web && npm create vite@latest ui -- --template react-ts`
2. Install deps: `@tanstack/react-query`, `react-router-dom`, `react-hook-form`, `zod`, `@hookform/resolvers`, `lucide-react`, `date-fns`
3. Install shadcn/ui: `npx shadcn@latest init`
4. Configure `vite.config.ts` (outDir, proxy)
5. Write `api/client.ts` with `apiFetch` + `APIError`
6. Write `hooks/useApiKey.ts`
7. Write `types/` interfaces for all API shapes
8. Write `App.tsx` with React Router routes (all routes render `<div>TODO</div>` placeholder)
9. Build layout Shell (sidebar + content area) with real navigation
10. `npm run build` → verify `web/static/` has output → `go run ./cmd/luminarr` → visit app

**Stop and verify**: All routes render, sidebar works, no console errors, API key is injected.

### Phase B — System Page (simplest real page)
1. Write `api/system.ts` with `useSystemStatus`, `useSystemHealth`, `useTasks`, `useSystemLogs`
2. Write `pages/settings/system/SystemPage.tsx` — status section, health section
3. Tasks section with manual trigger
4. Config section (TMDB key form, hot-swap feedback)
5. Logs section

**Stop and verify**: Each section loads real data, health indicators show correct state, task trigger works.

### Phase C — Settings CRUD Pages
Order: Libraries → Quality Profiles → Indexers → Download Clients → Notifications

For each:
1. Write `api/*.ts` hooks (useList, useCreate, useUpdate, useDelete, useTest)
2. Write list page (table, actions)
3. Write form component (modal/slide-over)
4. Wire up test button with inline feedback
5. Verify mutations invalidate cache (list updates after add/edit/delete)

### Phase D — Dashboard
1. Stats cards (count queries)
2. Health banner
3. Recent history feed
4. Task status

### Phase E — Movies
1. Movie list (table with search/filter)
2. Add Movie dialog (TMDB lookup → select → configure → add)
3. Movie detail page (poster, metadata, releases tab, history tab)
4. Grab release action

### Phase F — Queue & History
1. Queue page with progress bars + polling
2. History page with pagination

### Phase G — Polish
1. Skeleton screens on all loading states
2. Empty states on all list views
3. Toast notifications for mutations
4. Error boundaries for catastrophic failures
5. Responsive layout (tablet/mobile sidebar collapse)
6. Accessibility audit (keyboard nav, ARIA)

---

## 16. What NOT to Do

- **Don't build a design system from scratch.** Use shadcn/ui components as-is, only customise colors.
- **Don't add WebSocket yet.** Queue polling (Tanstack Query `refetchInterval`) is sufficient for Phase 1.
- **Don't render forms dynamically from JSON Schema.** Write typed per-plugin components.
- **Don't commit `node_modules/`.** Do commit `web/static/` (it's the binary asset).
- **Don't add pagination to settings lists.** They have <50 items each.
- **Don't add drag-to-reorder for quality profiles** in Phase C. Simple ordered list is fine initially.

---

## 17. Pre-Build Checklist

Before writing any React code:
- [ ] Design agent recommendations received and incorporated into §7 (Design System)
- [ ] All Go tests pass: `go test ./...`
- [ ] All current API endpoints verified working via curl
- [ ] Node.js 18+ available: `node --version`
- [ ] Plan reviewed and approach agreed

---

*Last updated: 2026-03-02*
