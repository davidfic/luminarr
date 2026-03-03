# Luminarr — Project Overview

A modern, Go-based movie collection manager. Spiritual successor to Radarr, rebuilt
from first principles with a clean API-first design, pluggable architecture, and
AI-assisted release management.

## What It Is

Luminarr monitors for movie releases, integrates with indexers and download clients,
manages metadata, and keeps your movie library organized — automatically.

## What Makes It Different From Radarr

| Concern              | Radarr                        | Luminarr                                  |
|----------------------|-------------------------------|-------------------------------------------|
| Runtime              | .NET (heavy)                  | Go single binary (~20MB)                 |
| API design           | Bolted on                     | API-first, OpenAPI 3.1 spec              |
| Plugin system        | None                          | Interface-based, gRPC-ready              |
| Storage abstraction  | Root folders (paths only)     | Libraries (path + profile + settings)    |
| AI                   | None                          | Release scoring, matching, filtering     |
| DB                   | SQLite only                   | SQLite default, Postgres optional        |
| Real-time            | SignalR (heavy)               | WebSocket event bus                      |

## Core Responsibilities

1. **Movie management** — Add, track, and organize movies via TMDB metadata
2. **Release management** — Search indexers, evaluate releases, grab the best one
3. **Download management** — Hand off to a download client, monitor completion
4. **Import** — Move/hardlink completed downloads into the library, rename to format
5. **Automation** — RSS sync, scheduled metadata refresh, library scanner
6. **AI assistance** — Score, match, and filter releases intelligently

## Non-Goals (v1)

- No TV show support (that's a separate project)
- No music, books, or other media types
- No built-in torrent/NZB client
- No multi-user auth (API key auth only)
- No built-in UI (API first; UI is a separate consumer)

## Module Path

    github.com/davidfic/luminarr

## Related Plan Documents

- [01-tech-stack.md](01-tech-stack.md) — Framework and library choices with rationale
- [02-project-structure.md](02-project-structure.md) — Directory layout
- [03-domain-model.md](03-domain-model.md) — Core data models
- [04-libraries.md](04-libraries.md) — Library system (improved root folders)
- [05-plugin-system.md](05-plugin-system.md) — Plugin interface design
- [06-ai-integration.md](06-ai-integration.md) — AI feature architecture
- [07-api-design.md](07-api-design.md) — REST API endpoints and contracts
- [08-database.md](08-database.md) — Database strategy and query generation
- [09-event-system.md](09-event-system.md) — Internal event bus and WebSocket
- [10-phases.md](10-phases.md) — Implementation phases and milestones
