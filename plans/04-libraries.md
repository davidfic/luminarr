# Library System

The Library concept replaces Radarr's "root folders" with something that carries meaning.

---

## The Problem with Root Folders (Radarr)

Radarr's root folders are just filesystem paths. They carry no context:
- No per-folder quality defaults
- No disk monitoring settings
- No organizational identity
- Adding a movie to a folder is arbitrary — you just pick a path

This leads to users managing quality profiles movie-by-movie and having no good way
to answer "what's on this drive?" without inspecting paths manually.

---

## The Library Model

A Library is a named, configured collection of movies with a shared root path.

```
Library
├── id                         UUID
├── name                       string     "4K HDR Collection", "Family Movies"
├── root_path                  string     "/mnt/media/movies"
├── default_quality_profile_id UUID       FK → QualityProfile
├── naming_format              string?    override global naming format
├── min_free_space_gb          int        warn + pause grabs below this (default: 5)
├── tags                       []string   organizational tags
├── created_at                 timestamp
└── updated_at                 timestamp
```

---

## What Libraries Unlock

### 1. Meaningful Defaults

When a user adds a movie and selects a Library, the movie inherits:
- The library's default quality profile
- The library's naming format
- Tags from the library

The user can override any of these per-movie, but the library provides sensible defaults
without requiring per-movie configuration.

### 2. Per-Library Disk Monitoring

Each library tracks its own disk space. When free space drops below `min_free_space_gb`:
- A health warning is raised (visible in system status)
- Automatic grabs targeting that library are paused
- A WebSocket event is emitted

This is especially important for users with separate drives per library (e.g., 4K on
one NVMe, 1080p on a large HDD).

### 3. Organizational Identity

Libraries are filterable. The API supports:

```
GET /api/v1/movies?library_id=<id>    — movies in a specific library
GET /api/v1/libraries/<id>/stats      — movie count, total size, free space
```

### 4. Tag Propagation

Tags on a Library propagate to movies added to it. This integrates with the indexer
and download client tag filtering — e.g., an indexer tagged "4K-only" will only match
movies that are also tagged "4K-only" (inherited from their 4K library).

---

## Library vs Root Folder Comparison

| Feature                         | Radarr Root Folder | Luminarr Library   |
|---------------------------------|--------------------|--------------------|
| Filesystem path                 | ✓                  | ✓                  |
| Default quality profile         | —                  | ✓                  |
| Per-path naming format          | —                  | ✓                  |
| Disk space threshold            | —                  | ✓                  |
| Organizational tags             | —                  | ✓                  |
| Filterable in movie list        | —                  | ✓                  |
| Per-library stats               | —                  | ✓                  |

---

## Multiple Libraries, One Path

It is valid to have multiple libraries pointing to the same root path.

Use case: A user has one large drive. They want:
- "Family Movies" library → `/mnt/media/movies` → quality profile: 1080p
- "4K Collection" library → `/mnt/media/movies/4k` → quality profile: 4K HDR

The 4K library is a subdirectory. Disk monitoring on the parent will see the child's
usage. Both are valid library root paths.

---

## Library Scanner (Scheduled Job)

The `library_scan` job walks each library's `root_path` and:

1. Finds movie files not in the database → offers to import them
2. Finds database records where the file no longer exists → marks movie as `missing`
3. Updates `MovieFile.indexed_at` for files that exist and are accounted for

Scan frequency is configurable per library (or globally). Default: every 24 hours.

---

## API Surface

```
GET    /api/v1/libraries                   — list all libraries
POST   /api/v1/libraries                   — create library
GET    /api/v1/libraries/{id}              — get library detail
PUT    /api/v1/libraries/{id}              — update library settings
DELETE /api/v1/libraries/{id}              — delete library (does NOT delete files)
GET    /api/v1/libraries/{id}/stats        — movie count, total size, free space, health
POST   /api/v1/libraries/{id}/scan        — trigger a manual library scan
GET    /api/v1/libraries/{id}/movies       — movies in this library
```

---

## Migration from Radarr

When importing an existing Radarr database or config, each root folder becomes one
Library. Quality profile defaults are inferred from the most common profile among
movies in that folder. This makes migration painless.
