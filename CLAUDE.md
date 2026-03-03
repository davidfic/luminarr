# Luminarr — Claude Rules

## Working Rules

### Never guess. Read first.
Before suggesting or making any change, read the relevant files.
If you are not sure which file to read, ask. Do not assume structure, field names,
function signatures, or behaviour. Wrong guesses waste tokens and break things.

### Ask before implementing when the approach is unclear.
If there are multiple reasonable ways to do something, present the options and ask.
Do not silently pick one and code it up. One question upfront is cheaper than
reworking a wrong implementation.

### One problem at a time.
Fix the stated issue. Do not refactor surrounding code, add features, or "improve"
things that were not mentioned. Scope creep breaks working code.

---

## Auth — the API key

**How it works:**
- `config.EnsureAPIKey()` in `main.go` generates a random 32-byte hex key if
  `cfg.Auth.APIKey` is empty (no config file, no env var).
- `web.ServeIndex(apiKey)` in `web/embed.go` substitutes `__LUMINARR_KEY__` in
  `index.html` **once at startup**, baking the key into the served HTML.
- The browser stores the key in `window.__KEY`; every `apiFetch()` call sends it
  as `X-Api-Key`.
- The huma middleware in `internal/api/router.go` rejects any request where the
  header does not match the in-memory key.

**The Docker problem:**
In the scratch Docker image there is no `$HOME`, so no config file is read or
written. The key is re-generated on every container start. If a browser tab is
still open from a previous run, it holds a stale key → every API call returns 401.

**The fix:**
Set a fixed key. Either:
1. Add `LUMINARR_AUTH_API_KEY=<value>` to `docker-compose.yml` environment block.
2. Mount a `config.yaml` at `/config/config.yaml` containing `auth.api_key: <value>`.

**Rule: whenever a Docker or startup change is made, check whether the auth key
is still reachable (logged, injected into HTML, and consistent across restarts).
If it is not fixed, document the "hard-refresh after restart" requirement explicitly.**

---

## Docker local dev workflow

- Build + run: `make docker/run` (`docker compose -f docker/docker-compose.yml up --build`)
- Data persists in the `luminarr-config` named Docker volume at `/config`.
- The API key changes every restart unless `LUMINARR_AUTH_API_KEY` is set.
- After rebuilding, always hard-refresh the browser tab to pick up the new key.

---

## Key architectural facts

| Concern | Location |
|---|---|
| Config loading + defaults | `internal/config/load.go` |
| API key generation | `config.EnsureAPIKey()` in `internal/config/load.go` |
| HTML key injection | `web.ServeIndex()` in `web/embed.go` |
| Auth middleware | `internal/api/router.go` huma middleware block |
| DB path default (Docker) | `/config/luminarr.db` (no $HOME in scratch) |
| DB path default (local) | `~/.config/luminarr/luminarr.db` |
| Plugin registration | `init()` in each plugin, blank-imported in `cmd/luminarr/main.go` |
| sqlc queries | `internal/db/generated/sqlite/` — do not edit by hand |
| Migrations | `internal/db/migrations/` — goose numbered SQL files |
| Event bus | `internal/events/bus.go` |
| Scheduler | `internal/scheduler/` |

---

## Checklist before any change

1. Have I read the files I am about to modify?
2. Does the change touch auth, routing, or startup? If so, re-read `router.go`,
   `main.go`, and `web/embed.go` to verify the key flow is intact.
3. Does the change touch Docker? If so, verify the named volume still covers
   `/config` and that the API key situation is documented.
4. Am I within the scope of what was asked? If I am adding anything extra, stop
   and ask first.
