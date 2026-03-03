# Domain Model

Core entities and their relationships. These map directly to database tables and
drive the API response shapes.

---

## Entity Relationship Summary

```
Library ──< Movie ──< MovieFile
               │
               └──< GrabHistory
               └──< QueueItem ──> DownloadClient (plugin)

QualityProfile ──< Movie
               └──< Library (default)

Indexer (plugin) ──> Release (transient, not stored)
                       └──> GrabHistory (stored on grab)

Task (scheduled jobs, system-level)
```

---

## Movie

The central entity. Represents a desired movie in the user's collection.

```
Movie
├── id              UUID          primary key
├── tmdb_id         int           TMDB identifier (unique)
├── imdb_id         string?       IMDB identifier (optional, from TMDB)
├── title           string        canonical title from TMDB
├── original_title  string        original language title
├── year            int           release year
├── overview        string        plot summary
├── runtime         int?          minutes
├── genres          []string      (stored as JSON array)
├── poster_url      string?       TMDB poster path
├── fanart_url      string?       TMDB backdrop path
├── status          MovieStatus   see below
├── monitored       bool          if false, Luminarr won't grab for this movie
├── library_id      UUID          FK → Library
├── quality_profile_id UUID       FK → QualityProfile (overrides library default)
├── path            string?       full path to movie folder (set after import)
├── added_at        timestamp
├── updated_at      timestamp
└── metadata_refreshed_at timestamp
```

### MovieStatus (enum)

```
announced     — added, not yet released
in_cinemas    — currently in theaters
released      — available (digital/physical)
wanted        — released + monitored + no file
downloading   — grab in progress
downloaded    — file exists, meets cutoff quality
missing       — was downloaded, file no longer found
unmonitored   — not monitored (user paused)
```

---

## MovieFile

Represents a physical file that has been imported for a movie.
A movie may have multiple files (e.g., 1080p + 4K editions).

```
MovieFile
├── id              UUID
├── movie_id        UUID          FK → Movie
├── path            string        absolute path to file
├── size            int64         bytes
├── quality         Quality       parsed from filename (see Quality below)
├── edition         string?       "Extended Cut", "Theatrical", etc.
├── imported_at     timestamp
└── indexed_at      timestamp     last time file was verified to exist
```

---

## Quality

Not a table — a value type embedded in MovieFile, Release, and QualityProfile.

```
Quality
├── resolution      Resolution    enum: Unknown, SD, HD_720, HD_1080, UHD_2160
├── source          Source        enum: Unknown, WebDL, WEBRip, BluRay, Remux, HDTV, CAM
├── codec           Codec?        enum: x264, x265, AV1, etc.
├── hdr             HDRFormat?    enum: None, HDR10, DolbyVision, HLG
└── name            string        human-readable derived label, e.g. "Bluray-1080p"
```

---

## QualityProfile

Defines what quality to accept and when to upgrade.

```
QualityProfile
├── id              UUID
├── name            string        e.g. "HD — Prefer 1080p", "4K HDR"
├── cutoff          Quality       minimum acceptable quality
├── qualities       []Quality     ordered list (highest preferred first)
├── upgrade_allowed bool          if true, grab better quality if found
└── upgrade_until   Quality?      stop upgrading at this quality
```

---

## Library

See [04-libraries.md](04-libraries.md) for full detail.

```
Library
├── id                  UUID
├── name                string        e.g. "4K Movies", "Family Films"
├── root_path           string        absolute path to directory
├── default_quality_profile_id UUID   FK → QualityProfile
├── naming_format       string?       override default naming format
├── min_free_space_gb   int           warn/pause below this threshold
├── tags                []string      for filtering/grouping
├── created_at          timestamp
└── updated_at          timestamp
```

---

## Release (transient)

Not stored in the database. Created when searching indexers, passed through the
scoring/filtering pipeline, and either discarded or converted to a GrabHistory
record when grabbed.

```
Release
├── guid            string        indexer-provided unique ID
├── title           string        scene release name (parsed for quality)
├── indexer         string        name of source indexer
├── protocol        Protocol      Torrent | NZB
├── download_url    string        direct URL or magnet link
├── info_url        string?       link to indexer page
├── size            int64         bytes
├── seeds           int?          torrent only
├── peers           int?          torrent only
├── age_days        float         how old the release is
├── quality         Quality       parsed from title
├── movie_id        UUID?         matched movie (nil if unmatched)
├── match_score     float?        confidence from AI matcher (0.0–1.0)
├── ai_score        int?          0–100 AI quality score
├── rejected        bool          true if filtered out
├── reject_reason   string?       why it was rejected
└── grabbed_at      timestamp?    set when grabbed
```

---

## GrabHistory

Persisted record of every grab attempt.

```
GrabHistory
├── id              UUID
├── movie_id        UUID          FK → Movie
├── release_title   string        scene name at time of grab
├── indexer         string
├── protocol        Protocol
├── quality         Quality       parsed from release title
├── size            int64
├── download_client_id UUID?      FK → DownloadClient config
├── client_item_id  string?       ID in the download client
├── status          GrabStatus   see below
├── failure_reason  string?
├── ai_score        int?
├── grabbed_at      timestamp
└── completed_at    timestamp?
```

### GrabStatus (enum)

```
grabbed       — sent to download client
downloading   — confirmed in client, not complete
completed     — download client reports done
imported      — file moved/linked into library
failed        — client reported failure
import_failed — download complete but import failed
```

---

## QueueItem

Live view of what's in the download client. Rebuilt from client poll, not persisted
between restarts (except via GrabHistory linking).

```
QueueItem
├── id                  UUID          internal
├── grab_history_id     UUID?         FK → GrabHistory
├── movie_id            UUID?         FK → Movie
├── download_client_id  UUID          which client
├── client_item_id      string        ID in the download client
├── title               string
├── status              QueueStatus   queued, downloading, completed, paused, failed
├── size                int64
├── downloaded          int64         bytes downloaded so far
├── progress            float         0.0–1.0
├── eta_seconds         int?
├── error               string?
└── updated_at          timestamp
```

---

## Indexer (config record)

Configuration for a registered indexer plugin instance.

```
IndexerConfig
├── id              UUID
├── name            string        user-assigned name
├── plugin          string        plugin identifier e.g. "torznab"
├── enabled         bool
├── priority        int           lower = higher priority when multiple indexers match
├── settings        JSON          plugin-specific config (URL, API key, etc.)
├── tags            []string      limit to movies with matching tags
└── created_at      timestamp
```

---

## DownloadClientConfig

```
DownloadClientConfig
├── id              UUID
├── name            string        user-assigned name
├── plugin          string        e.g. "qbittorrent", "transmission"
├── enabled         bool
├── protocol        Protocol      Torrent | NZB
├── priority        int
├── settings        JSON          plugin-specific (host, port, username, password, etc.)
├── tags            []string
└── created_at      timestamp
```

---

## NotificationConfig

```
NotificationConfig
├── id              UUID
├── name            string
├── plugin          string        e.g. "discord", "webhook", "email"
├── enabled         bool
├── on_grab         bool          fire on movie grabbed
├── on_import       bool          fire on movie imported
├── on_failure      bool          fire on download/import failure
├── on_health_issue bool
├── settings        JSON          plugin-specific
└── created_at      timestamp
```

---

## Task (scheduled job registry)

```
Task
├── name            string        unique job name, e.g. "rss_sync"
├── display_name    string        human-readable
├── interval        duration      cron schedule or fixed interval
├── last_started_at timestamp?
├── last_finished_at timestamp?
├── last_duration_ms int?
├── last_status     TaskStatus    idle, running, success, failed
└── last_error      string?
```

Tasks are defined in code and registered at startup. Only `last_*` fields are persisted.

---

## Key Design Decisions

**UUIDs as primary keys**
Not sequential integers. Easier to reason about in distributed contexts later,
no implicit ordering leaks into the API.

**Quality as a value type, not a foreign key**
Quality is embedded wherever it's needed. It's small (4–5 fields), immutable by definition,
and doing joins on quality would be noise.

**Settings as JSON blobs on plugin config records**
Plugin configs have a `settings JSON` column rather than plugin-specific tables.
Plugins define and validate their own settings shape. This avoids schema migration
churn every time a plugin changes its config.

**Release is never stored as a table**
Releases are ephemeral search results. Only a summary is preserved in GrabHistory
when a release is grabbed. This keeps the hot path lean.
