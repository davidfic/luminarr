# Plugin System

## Design Philosophy

Start with interface-based (in-process) plugins. All built-in implementations
(qBittorrent, Torznab, Discord, etc.) are just Go structs that satisfy the plugin
interfaces. The interface boundary is clean enough that adding an external process
transport (gRPC) later is a transport change, not an architecture change.

The plugin interfaces live in `pkg/plugin/` — the public package — so that future
external plugin authors have a stable contract to depend on.

---

## Evolution Path

```
Phase 1 (now): interface-based, in-process
    [Luminarr core] → [plugin.Indexer interface] ← [torznab.Indexer struct]

Phase 2 (later): gRPC transport layer
    [Luminarr core] → [plugin.Indexer interface] ← [grpc.IndexerProxy]
                                                            ↓
                                                    [external process (any language)]
```

The core never changes. Only the right side of the interface changes.

---

## Plugin Interfaces

### `pkg/plugin/indexer.go`

```go
// Protocol identifies the release download mechanism.
type Protocol string

const (
    ProtocolTorrent Protocol = "torrent"
    ProtocolNZB     Protocol = "nzb"
    ProtocolUnknown Protocol = "unknown"
)

// Capabilities describes what an indexer supports.
type Capabilities struct {
    SearchAvailable   bool
    TVSearchAvailable bool // unused in Luminarr v1, future-proofing
    MovieSearch       bool
    Categories        []Category
}

// SearchQuery is the input to an indexer search.
type SearchQuery struct {
    Query    string  // free text or scene title
    TMDBID   int     // preferred: structured ID search
    IMDBID   string
    Year     int
    Category Category
}

// Indexer is the plugin interface for release indexers.
type Indexer interface {
    // Name returns the human-readable plugin name, e.g. "Torznab".
    Name() string

    // Protocol returns the release download mechanism this indexer provides.
    Protocol() Protocol

    // Capabilities returns what search types this indexer supports.
    Capabilities(ctx context.Context) (Capabilities, error)

    // Search queries the indexer for releases matching the query.
    Search(ctx context.Context, q SearchQuery) ([]Release, error)

    // GetRecent returns the most recent releases from the indexer's RSS feed.
    GetRecent(ctx context.Context) ([]Release, error)
}
```

### `pkg/plugin/downloader.go`

```go
// DownloadStatus is the state of an item in the download client.
type DownloadStatus string

const (
    StatusQueued      DownloadStatus = "queued"
    StatusDownloading DownloadStatus = "downloading"
    StatusCompleted   DownloadStatus = "completed"
    StatusPaused      DownloadStatus = "paused"
    StatusFailed      DownloadStatus = "failed"
)

// QueueItem represents an item tracked in the download client.
type QueueItem struct {
    ClientItemID string
    Title        string
    Status       DownloadStatus
    Size         int64
    Downloaded   int64
    SeedRatio    float64  // torrent only
    Error        string
}

// DownloadClient is the plugin interface for download clients.
type DownloadClient interface {
    Name() string
    Protocol() Protocol

    // Add submits a release to the download client.
    // Returns the client-assigned item ID for future status queries.
    Add(ctx context.Context, r Release) (clientItemID string, err error)

    // Status returns the current state of a download client item.
    Status(ctx context.Context, clientItemID string) (QueueItem, error)

    // GetQueue returns all items currently in the download client.
    GetQueue(ctx context.Context) ([]QueueItem, error)

    // Remove deletes an item from the download client.
    // If deleteFiles is true, the downloaded data is also deleted.
    Remove(ctx context.Context, clientItemID string, deleteFiles bool) error

    // Test validates that the connection to the download client works.
    Test(ctx context.Context) error
}
```

### `pkg/plugin/notification.go`

```go
// EventType identifies what happened.
type EventType string

const (
    EventMovieAdded    EventType = "movie_added"
    EventMovieDeleted  EventType = "movie_deleted"
    EventGrabStarted   EventType = "grab_started"
    EventDownloadDone  EventType = "download_done"
    EventImportDone    EventType = "import_done"
    EventImportFailed  EventType = "import_failed"
    EventHealthIssue   EventType = "health_issue"
    EventHealthOK      EventType = "health_ok"
)

// Event carries the context of something that happened.
type Event struct {
    Type      EventType
    Timestamp time.Time
    MovieID   string // UUID, if movie-related
    Message   string
    Data      map[string]any // event-specific extra fields
}

// Notifier is the plugin interface for notification channels.
type Notifier interface {
    Name() string
    Notify(ctx context.Context, event Event) error
    Test(ctx context.Context) error
}
```

### `pkg/plugin/types.go` — Shared types

```go
// Release is the transient result of an indexer search.
// It is NOT stored in the database. A summary is stored in GrabHistory on grab.
type Release struct {
    GUID        string
    Title       string
    Indexer     string
    Protocol    Protocol
    DownloadURL string
    InfoURL     string
    Size        int64
    Seeds       int
    Peers       int
    AgeDays     float64
    Quality     Quality
}

// Quality describes the technical characteristics of a release.
type Quality struct {
    Resolution Resolution
    Source     Source
    Codec      Codec
    HDR        HDRFormat
    Name       string // derived human-readable label
}

// Resolution enum
type Resolution string
const (
    ResolutionUnknown Resolution = "unknown"
    ResolutionSD       Resolution = "sd"
    Resolution720p     Resolution = "720p"
    Resolution1080p    Resolution = "1080p"
    Resolution2160p    Resolution = "2160p"
)

// Source enum
type Source string
const (
    SourceUnknown Source = "unknown"
    SourceCAM      Source = "cam"
    SourceHDTV     Source = "hdtv"
    SourceWEBRip   Source = "webrip"
    SourceWEBDL    Source = "webdl"
    SourceBluRay   Source = "bluray"
    SourceRemux    Source = "remux"
)
```

---

## Plugin Registry

The plugin registry is an internal component that:

1. Holds registered plugin factories (indexed by plugin ID string)
2. Instantiates plugin instances from stored config + settings JSON
3. Provides typed access by plugin type

```go
// internal/registry/registry.go

type Registry struct {
    indexers    map[string]IndexerFactory
    downloaders map[string]DownloaderFactory
    notifiers   map[string]NotifierFactory
}

type IndexerFactory func(settings json.RawMessage) (plugin.Indexer, error)

func (r *Registry) RegisterIndexer(id string, factory IndexerFactory)
func (r *Registry) Indexer(id string, settings json.RawMessage) (plugin.Indexer, error)
```

Built-in plugins self-register in their `init()` function:

```go
// plugins/indexers/torznab/torznab.go
func init() {
    registry.Default.RegisterIndexer("torznab", func(s json.RawMessage) (plugin.Indexer, error) {
        var cfg Config
        if err := json.Unmarshal(s, &cfg); err != nil {
            return nil, err
        }
        return New(cfg), nil
    })
}
```

The `init()` pattern means plugins register themselves when their package is imported.
`main.go` does a blank import of each plugin package to activate them.

---

## Plugin Settings Validation

Each plugin exposes a settings schema (JSON Schema) used for:
- API-level validation when creating/updating plugin configs
- Frontend form generation (when UI is built)

```go
type PluginMeta interface {
    SettingsSchema() json.RawMessage // JSON Schema document
}
```

---

## Future: gRPC Plugin Transport

When external plugins are needed, the architecture looks like:

```
pkg/plugin/grpc/
├── indexer_proxy.go      // wraps gRPC client, implements plugin.Indexer
├── downloader_proxy.go
└── notification_proxy.go

proto/
└── plugin/
    ├── indexer.proto
    ├── downloader.proto
    └── notification.proto
```

The `IndexerProxy` struct implements `plugin.Indexer` exactly. The registry gets a
new factory type for gRPC-backed plugins. Core code is untouched.
