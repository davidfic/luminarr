# Tech Stack

## Language

**Go (latest stable)**

No reason to pin below latest. Go has excellent backwards compatibility guarantees.
Benefits: single static binary, excellent concurrency primitives, small runtime footprint,
strong stdlib, fast compile times.

---

## HTTP / API Layer

### Router: Chi (`github.com/go-chi/chi/v5`)

Chi is lightweight, composable, and idiomatic. Middleware is plain `http.Handler` — no
framework lock-in. Go 1.22+ stdlib routing handles path params now, but Chi's middleware
ecosystem (auth, logging, CORS, rate limiting) saves meaningful boilerplate.

**Not chosen:**
- Gin / Echo / Fiber — faster benchmarks but more opinionated; harder to stay idiomatic
- stdlib mux only — would require reimplementing middleware patterns Chi already has

### OpenAPI: Huma (`github.com/danielgtaylor/huma/v2`)

Code-first OpenAPI 3.1 generation. Define handlers in Go; Huma generates the spec.
Avoids annotation soup (swaggo) and avoids spec-first code generation complexity (ogen).

Benefits:
- Auto-validates request/response against schema
- Interactive docs at /api/docs out of the box
- Works with Chi

### Real-time: WebSocket

`nhooyr.io/websocket` — modern, context-aware, no gorilla dependency chain.
Used for pushing events to connected clients (download progress, grab notifications, etc.)

---

## Database

### SQLite (default): `modernc.org/sqlite`

Pure Go SQLite driver — zero CGO, cross-compiles cleanly. This is the default for
all users. Database file stored alongside config.

### PostgreSQL (optional): `github.com/jackc/pgx/v5`

Best-in-class Postgres driver. Used when `database.driver: postgres` is set in config.
pgx v5's stdlib-compatible mode means we can use the same `database/sql` interface.

### Query generation: `sqlc`

Type-safe Go code generated from SQL. No ORM magic, no reflection at runtime.
SQL is readable and version-controlled. Two query directories: `sqlite/` and `postgres/`.
The generated code satisfies the same `Querier` interface regardless of database.

Decision: sqlc over GORM/ent/bun because:
- SQL is explicit and auditable
- No N+1 footguns hiding behind magic
- Generated code is readable Go, not reflection soup

### Migrations: `github.com/pressly/goose/v3`

Embedded SQL migrations, works with both SQLite and Postgres.
Migration files committed to repo. Run at startup or via CLI subcommand.

---

## Configuration

**Viper** (`github.com/spf13/viper`) — YAML config file with environment variable overrides.

Config file search order:
1. `--config` flag (explicit path)
2. `$LUMINARR_CONFIG_PATH`
3. `~/.config/luminarr/config.yaml`
4. `/etc/luminarr/config.yaml`

All config keys have `LUMINARR_` prefixed env var equivalents.

---

## Scheduling

**robfig/cron** (`github.com/robfig/cron/v3`)

Cron-expression scheduling for recurring tasks. Tasks are registered by the scheduler
subsystem at startup. Each task is also triggerable manually via the API.

---

## Logging

**slog** (Go stdlib, 1.21+)

No external dependency. Structured JSON logging in production, human-readable text in
development. Log level configurable via config/env var.

---

## AI

**Anthropic Go SDK** (`github.com/anthropics/anthropic-sdk-go`)

Used for the three AI features:
1. Release title → movie matching confidence
2. Release scoring (0–100)
3. Release filtering (keep/reject with reasons)

The `ai.Service` interface is satisfied by both the Claude implementation and a no-op
implementation. If no API key is configured, the no-op is used silently.

---

## Metadata

**TMDB API** — HTTP client wrapping The Movie Database API v3/v4.
Internal package: `internal/metadata/tmdb/`

No third-party TMDB library — the API surface we need is small enough that a thin
hand-written client is preferable to a dependency.

---

## Build & Dev Tooling

| Tool             | Purpose                                    |
|------------------|--------------------------------------------|
| `make`           | Common tasks (build, test, lint, generate) |
| `air`            | Hot reload during development              |
| `golangci-lint`  | Linting (staticcheck, errcheck, etc.)      |
| `sqlc`           | Regenerate DB query code                   |
| `goose`          | Run/rollback migrations manually           |
| Docker           | Container image (distroless base)          |

---

## Summary: Dependency Budget

We are deliberate about dependencies. Each one must justify its existence.

| Package                     | Why                                    |
|-----------------------------|----------------------------------------|
| go-chi/chi                  | HTTP router + middleware               |
| danielgtaylor/huma           | OpenAPI generation                     |
| nhooyr.io/websocket          | WebSocket server                       |
| modernc.org/sqlite           | SQLite driver (no CGO)                 |
| jackc/pgx                   | Postgres driver                        |
| pressly/goose               | Migrations                             |
| spf13/viper                 | Config                                 |
| robfig/cron                 | Task scheduling                        |
| anthropics/anthropic-sdk-go | AI features                            |
| sqlc (dev tool, not runtime)| Query code generation                  |
