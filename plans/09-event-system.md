# Event System

## Architecture

An in-process event bus connects core business logic to:
1. The WebSocket hub (push to connected clients)
2. The notification dispatcher (fire configured notifiers)
3. The history writer (persist significant events)

```
[core logic]
     │
     ▼
[event bus]  (internal/events/bus.go)
     │
     ├──► [WebSocket hub]         — push JSON to connected browser/client
     ├──► [Notification dispatcher] — call configured notifier plugins
     └──► [History writer]        — persist to grab_history / audit log
```

Core logic never calls the WebSocket hub or notifiers directly. It publishes an event
and moves on. All fanout is the event bus's responsibility.

---

## Event Bus Design

Simple, synchronous fanout to subscribers. Each subscriber runs in its own goroutine
to avoid blocking the publisher.

```go
// internal/events/bus.go

type EventType string

const (
    EventMovieAdded     EventType = "movie_added"
    EventMovieDeleted   EventType = "movie_deleted"
    EventMovieUpdated   EventType = "movie_updated"
    EventGrabStarted    EventType = "grab_started"
    EventGrabFailed     EventType = "grab_failed"
    EventDownloadDone   EventType = "download_done"
    EventImportComplete EventType = "import_complete"
    EventImportFailed   EventType = "import_failed"
    EventHealthIssue    EventType = "health_issue"
    EventHealthOK       EventType = "health_ok"
    EventTaskStarted    EventType = "task_started"
    EventTaskFinished   EventType = "task_finished"
)

type Event struct {
    Type      EventType      `json:"type"`
    Timestamp time.Time      `json:"timestamp"`
    MovieID   string         `json:"movie_id,omitempty"`
    Data      map[string]any `json:"data,omitempty"`
}

type Handler func(ctx context.Context, e Event)

type Bus struct {
    mu       sync.RWMutex
    handlers []Handler
}

func (b *Bus) Subscribe(h Handler) {
    b.mu.Lock()
    defer b.mu.Unlock()
    b.handlers = append(b.handlers, h)
}

func (b *Bus) Publish(ctx context.Context, e Event) {
    b.mu.RLock()
    handlers := b.handlers
    b.mu.RUnlock()

    for _, h := range handlers {
        h := h
        go func() {
            // Recover from panics in handlers so one bad handler
            // doesn't crash the publisher goroutine.
            defer func() {
                if r := recover(); r != nil {
                    slog.Error("event handler panicked", "event", e.Type, "panic", r)
                }
            }()
            h(ctx, e)
        }()
    }
}
```

This is intentionally simple. No channels, no backpressure, no persistence. Events
are fire-and-forget. If a handler is slow, it doesn't block publishing.

If a handler needs durability (e.g., "never miss a notification"), it is the handler's
responsibility to write to a queue or retry internally.

---

## WebSocket Hub

Manages connected WebSocket clients. Subscribes to the event bus and broadcasts
relevant events as JSON.

```go
// internal/api/v1/ws.go

type Hub struct {
    clients map[*Client]struct{}
    mu      sync.RWMutex
}

type Client struct {
    conn   *websocket.Conn
    send   chan []byte
    hub    *Hub
}

func (h *Hub) HandleEvent(ctx context.Context, e events.Event) {
    payload, err := json.Marshal(e)
    if err != nil {
        return
    }

    h.mu.RLock()
    defer h.mu.RUnlock()

    for client := range h.clients {
        select {
        case client.send <- payload:
        default:
            // Client send buffer full — drop. Client is too slow.
        }
    }
}

// Each client runs a write pump goroutine draining its send channel.
func (c *Client) writePump() {
    for msg := range c.send {
        if err := c.conn.Write(context.Background(), websocket.MessageText, msg); err != nil {
            break
        }
    }
}
```

---

## Notification Dispatcher

Subscribes to the event bus. For each event, checks which configured notifiers
should fire (based on their `on_grab`, `on_import`, etc. flags), and calls them.

```go
// internal/notifications/dispatcher.go

type Dispatcher struct {
    store   db.Querier         // to load notification configs
    registry *registry.Registry
}

func (d *Dispatcher) HandleEvent(ctx context.Context, e events.Event) {
    configs, _ := d.store.ListNotificationConfigs(ctx)

    for _, cfg := range configs {
        if !cfg.Enabled || !shouldFire(cfg, e) {
            continue
        }

        notifier, err := d.registry.Notifier(cfg.Plugin, cfg.Settings)
        if err != nil {
            slog.Error("failed to load notifier", "plugin", cfg.Plugin, "error", err)
            continue
        }

        go func(n plugin.Notifier) {
            if err := n.Notify(ctx, toPluginEvent(e)); err != nil {
                slog.Warn("notifier failed", "plugin", cfg.Plugin, "error", err)
            }
        }(notifier)
    }
}
```

---

## Startup Wiring

In `main.go` (or a dedicated `wire.go`):

```go
bus := events.NewBus()

// Wire up subscribers
wsHub := ws.NewHub()
bus.Subscribe(wsHub.HandleEvent)

dispatcher := notifications.NewDispatcher(querier, registry)
bus.Subscribe(dispatcher.HandleEvent)

// History writer subscribes for grab/import events
historyWriter := history.NewWriter(querier)
bus.Subscribe(historyWriter.HandleEvent)

// Pass bus to services that need to publish
movieService := movie.NewService(querier, tmdbClient, bus)
grabService := release.NewGrabService(querier, registry, aiService, bus)
```

---

## Event Payload Examples

```json
{ "type": "grab_started",
  "timestamp": "2025-06-01T14:32:00Z",
  "movie_id": "550e8400-...",
  "data": {
    "release_title": "Inception.2010.2160p.BluRay.REMUX.x265-GROUP",
    "indexer": "Prowlarr",
    "quality": "2160p / BluRay Remux",
    "size_bytes": 58432145000
  }
}

{ "type": "import_complete",
  "timestamp": "2025-06-01T15:01:22Z",
  "movie_id": "550e8400-...",
  "data": {
    "path": "/mnt/movies/Inception (2010)/Inception.2010.2160p.BluRay.REMUX.mkv",
    "quality": "2160p / BluRay Remux",
    "size_bytes": 58432145000
  }
}

{ "type": "health_issue",
  "timestamp": "2025-06-01T15:05:00Z",
  "data": {
    "name": "disk_space",
    "library": "4K Collection",
    "message": "Free space (3.2 GB) is below threshold (5 GB)"
  }
}

{ "type": "task_finished",
  "timestamp": "2025-06-01T15:10:00Z",
  "data": {
    "task": "rss_sync",
    "duration_ms": 1842,
    "grabs": 2,
    "errors": 0
  }
}
```

---

## Design Decisions

**Why not channels?**
Channels add ordering guarantees and backpressure that we don't need. Events are
independent. A slow WebSocket client shouldn't delay a notification. Goroutine-per-handler
is simple and correct.

**Why not a message queue (Redis, NATS)?**
Out of scope for v1. In-process is sufficient and keeps the deployment as a single
binary. The interface boundary makes adding an external broker later feasible without
changing subscriber code.

**Why not typed events?**
A single `Event` struct with a `Type` discriminator and `map[string]any` data is
sufficient for WebSocket delivery and notification rendering. Typed events would require
type assertions in every handler. If we add a second backend service later, we revisit.
