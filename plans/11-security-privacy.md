# Security & Privacy

## Core Principle

Luminarr never initiates a network connection the user has not explicitly configured.
There is no telemetry, no analytics, no crash reporting, no usage pings, no "phone home"
of any kind. Ever.

Every outbound HTTP request is:
- Initiated by user configuration (TMDB, indexers, download clients, Claude API, notifications)
- Logged with method, URL (auth stripped), and status code so users can audit exactly
  what the application talks to

---

## No Telemetry Policy

**What Luminarr connects to:**

| Destination        | When                          | User control                    |
|--------------------|-------------------------------|---------------------------------|
| TMDB API           | Movie search / metadata fetch | Disabled if no API key set      |
| Configured indexers| RSS sync / manual search      | Only what the user configures   |
| Download clients   | Queue poll / grab             | Only what the user configures   |
| Claude API         | AI scoring / filtering        | Disabled if no API key set      |
| Notification targets | On events                   | Only what the user configures   |

**What Luminarr never connects to:**
- Any Luminarr-controlled server
- Any analytics service
- Any error reporting service (Sentry, etc.)
- Any update check endpoint

This is enforced architecturally: there is no update check code, no analytics client,
no crash reporter. Absence of code, not configuration.

The `PRIVACY.md` at the repo root documents this for end users.

---

## Secret Hygiene

### The `Secret` Type

All sensitive values (API keys, passwords, tokens) are stored as `Secret`, not `string`.
`Secret` is defined in `internal/config/secret.go` and is safe to pass anywhere:

```go
// internal/config/secret.go

// Secret is a string type that never reveals its value when logged,
// printed, or JSON-serialized. Use it for API keys, passwords, and tokens.
type Secret string

// String implements fmt.Stringer. Always returns "***".
func (s Secret) String() string { return "***" }

// GoString implements fmt.GoStringer. Always returns "***".
func (s Secret) GoString() string { return "***" }

// MarshalJSON always serializes as "***".
// Prevents accidental exposure in JSON API responses.
func (s Secret) MarshalJSON() ([]byte, error) { return []byte(`"***"`), nil }

// MarshalText always encodes as "***".
// Covers YAML, TOML, and other text-based serializers.
func (s Secret) MarshalText() ([]byte, error) { return []byte("***"), nil }

// LogValue implements slog.LogValuer. Always returns "***".
// Prevents exposure in structured log output.
func (s Secret) LogValue() slog.Value { return slog.StringValue("***") }

// Value returns the underlying secret value.
// Only call this when you actually need the value (e.g., to make an HTTP request).
func (s Secret) Value() string { return string(s) }
```

### Usage in Config

```go
type Config struct {
    TMDB struct {
        APIKey Secret `yaml:"api_key"`
    } `yaml:"tmdb"`
    AI struct {
        APIKey Secret `yaml:"api_key"`
    } `yaml:"ai"`
}
```

If `cfg.TMDB.APIKey` ever ends up in a log line or API response, it renders as `***`.

### Plugin Settings Redaction

Plugin configs store settings as a JSON blob (see domain model). Settings contain
API keys, passwords, and hostnames. Every plugin must implement:

```go
// Sanitize returns a version of the settings JSON safe for logging and API responses.
// Secret fields must be replaced with "***".
type SettingsSanitizer interface {
    Sanitize(settings json.RawMessage) json.RawMessage
}
```

The API layer always calls `Sanitize` before returning plugin config in responses.
Raw settings are never logged.

If a plugin does not implement `SettingsSanitizer`, the API layer falls back to
returning `{}` for the settings field rather than risking exposure.

### Config File Permissions

On startup, Luminarr checks the permissions of `config.yaml`. If the file is
world-readable (mode & 0o004 != 0), a warning is logged:

```
WARN config file is world-readable — recommend chmod 600 config.yaml
```

This is advisory, not fatal. Users in containers often run as root where this is
irrelevant.

---

## API Authentication

A single API key authenticates all requests via the `X-Api-Key` header.

### Key Generation

On first startup, if no API key is configured:
1. A cryptographically random 32-byte key is generated (`crypto/rand`)
2. It is written to `config.yaml`
3. It is printed to the log at INFO level (once, on generation only)

```
INFO  generated new API key — copy this to your client configuration
      key=abc123...  (this is the only time it will be logged)
```

### Key Handling Rules

- The API key is stored as `Secret` in the config struct
- It is NEVER logged after the one-time generation message
- It is NEVER returned in any API response
- The `GET /api/v1/system/status` endpoint does NOT include the key
- HTTP request logs redact the `X-Api-Key` header value

### WebSocket Auth

WebSocket connections authenticate via a query parameter (`?api_key=...`) because
browsers cannot set custom headers on WebSocket upgrades. The middleware strips this
parameter from the URL before logging the request.

---

## Outbound HTTP Client

All outbound HTTP requests (TMDB, indexers, download clients, Claude API) go through
a shared `internal/httpclient` wrapper that:

1. Logs every request: `method=GET url=https://api.themoviedb.org/... status=200 duration=142ms`
2. Strips authentication from logged URLs (removes `api_key=` query params, `Authorization` headers)
3. Sets a reasonable timeout (configurable, default 30s)
4. Sets a descriptive `User-Agent: Luminarr/0.1.0` header
5. Does NOT follow redirects to different hosts (protection against SSRF via config)

```go
// internal/httpclient/client.go

type Client struct {
    inner  *http.Client
    logger *slog.Logger
}

func (c *Client) Do(req *http.Request) (*http.Response, error) {
    start := time.Now()
    resp, err := c.inner.Do(req)
    c.logger.Info("outbound request",
        "method", req.Method,
        "url", sanitizeURL(req.URL),   // strips auth params
        "status", resp.StatusCode,
        "duration", time.Since(start),
    )
    return resp, err
}
```

---

## What Is Never Logged

- API keys (any — Luminarr's, TMDB's, Claude's, indexer API keys)
- Passwords or tokens of any kind
- Raw plugin settings JSON
- Full HTTP request or response bodies
- The `X-Api-Key` request header value
- Query parameters containing `key`, `token`, `password`, `secret`, `auth`
- Full Claude prompts or responses (movie titles are not sensitive, but the principle
  of not logging full AI I/O avoids future issues)

---

## Dependency Audit

Every dependency is vetted before inclusion. The `go.sum` file is committed and
verified in CI. No dependencies that themselves phone home or include analytics
(some popular libraries do this — we check).

Guiding rule: if we can't read the source and understand what it does on the network,
we don't include it.
