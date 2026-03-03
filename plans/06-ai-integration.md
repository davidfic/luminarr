# AI Integration

AI features are additive and optional. The system degrades gracefully to rule-based
logic when no API key is configured. The core pipeline never branches on "is AI enabled?"
— it only calls the AI service interface and gets back results.

---

## Three AI Features

### 1. Release Matching Confidence

**Problem**: A scene release titled `"The.Dark.Knight.2008.2160p.UHD.BluRay.x265"` is
straightforward. But `"TDK.REMASTERED.2160p"` or
`"Dark.Knight.Rises.Extended.2012.REMUX"` can be ambiguous, especially when multiple
movies have similar names or years.

**AI role**: Given a release title and a candidate movie (from TMDB), return a confidence
score (0.0–1.0) that the release is for that movie.

**Fallback (no AI)**: String similarity matching + year extraction + known title aliases.
Works well for clean titles, struggles with scene shorthand.

---

### 2. Release Scoring

**Problem**: Two releases might both satisfy the quality profile. One is from a reputable
encode group, the other is a bad remux with corrupted audio. Quality metadata alone can't
distinguish them.

**AI role**: Given a movie and a release, score it 0–100. The score incorporates:
- Release group reputation (learned from history)
- Title patterns that indicate problems ("PROPER", "REPACK" reasons, "YIFY", etc.)
- Size plausibility for the quality claimed
- User's historical grab preferences (which releases were kept vs replaced)

**Fallback (no AI)**: Score based on a static release group allowlist/blocklist +
size-to-quality heuristics. Covers 90% of cases without AI.

---

### 3. Release Filtering

**Problem**: During RSS sync, Luminarr may see 50 releases for a single movie. Evaluating
all of them with the full pipeline wastes time. Pre-filtering with AI reduces the set
before expensive operations.

**AI role**: Given all candidate releases for a movie, return the subset worth
considering, with rejection reasons for discarded releases.

**Fallback (no AI)**: Hard rule filtering — wrong quality, known bad groups, implausible
size, blocked words.

---

## Service Interface

```go
// internal/ai/service.go

type MatchResult struct {
    Confidence float64
    Reasoning  string // optional, for logging/debugging
}

type ScoreResult struct {
    Score    int    // 0–100
    Factors  []string // contributing factors, for UI display
}

type FilterResult struct {
    Keep   []plugin.Release
    Reject []RejectedRelease
}

type RejectedRelease struct {
    Release plugin.Release
    Reason  string
}

// Service is the AI feature interface.
// The Claude implementation and the no-op implementation both satisfy this.
type Service interface {
    // MatchConfidence returns how confident we are that the release is for the movie.
    MatchConfidence(ctx context.Context, releaseTitle string, movie Movie) (MatchResult, error)

    // ScoreRelease assigns a quality score to a release in context of the movie.
    ScoreRelease(ctx context.Context, movie Movie, release plugin.Release) (ScoreResult, error)

    // FilterReleases returns only the releases worth considering.
    FilterReleases(ctx context.Context, movie Movie, releases []plugin.Release) (FilterResult, error)
}
```

---

## Claude Implementation

### Model Selection

Default: `claude-haiku-4-5-20251001` for scoring and filtering (high volume, latency matters).
Optional: `claude-sonnet-4-6` for matching (lower volume, accuracy matters more).

Configurable in `config.yaml`:

```yaml
ai:
  api_key: "sk-ant-..."
  match_model: "claude-sonnet-4-6"
  score_model: "claude-haiku-4-5-20251001"
  filter_model: "claude-haiku-4-5-20251001"
```

### Prompt Design — Release Scoring

```
System:
You are a release quality evaluator for a movie management system.
Given a movie and a release, score the release from 0 to 100.

Score factors:
- Release group reputation (known quality groups score higher)
- Size plausibility for the claimed quality
- Presence of PROPER/REPACK flags (can indicate quality fixes or problems)
- Known problematic patterns (e.g., YIFY, CAM, scene shorthand for bad quality)
- HDR metadata accuracy

Respond with JSON only: {"score": <int>, "factors": ["reason1", "reason2"]}

User:
Movie: The Dark Knight (2008), runtime 152 min
Release: The.Dark.Knight.2008.2160p.UHD.BluRay.x265.HDR.10bit-GROUP
Size: 58.2 GB
Quality parsed: 2160p / BluRay / x265 / HDR10
```

### Prompt Design — Release Matching

```
System:
You are a movie release matcher. Given a scene release title and a candidate movie,
return your confidence (0.0 to 1.0) that this release is for that movie.

Consider: title variations, year, known alternate titles, sequel numbering.
Respond with JSON only: {"confidence": <float>, "reasoning": "<brief reason>"}

User:
Release title: TDK.REMASTERED.2160p.BluRay.x265-GROUP
Candidate movie: The Dark Knight (2008), TMDB ID: 155, IMDB: tt0468569
Alternate titles: none on record
```

### Prompt Design — Release Filtering

```
System:
You are a release filter for a movie management system. Given a list of releases
for a specific movie, identify which are worth considering and which should be rejected.

Reject releases that:
- Are clearly wrong resolution for the expected quality range
- Come from known low-quality sources
- Have implausible size for the claimed quality
- Have obvious quality problems in the title

Respond with JSON only:
{
  "keep": [<list of release GUIDs>],
  "reject": [{"guid": "<guid>", "reason": "<brief reason>"}]
}

User:
Movie: Inception (2010), quality profile cutoff: 1080p
Releases:
[{"guid": "abc", "title": "Inception.2010.1080p.BluRay.x265-GROUP", "size_gb": 8.2},
 {"guid": "def", "title": "Inception.2010.720p.YIFY", "size_gb": 0.9},
 {"guid": "ghi", "title": "Inception 2010 2160p Remux", "size_gb": 55.0}]
```

---

## No-Op Implementation

```go
// internal/ai/noop.go

type NoopService struct{}

func (n *NoopService) MatchConfidence(_ context.Context, title string, movie Movie) (MatchResult, error) {
    score := stringSimilarity(title, movie.Title)
    return MatchResult{Confidence: score, Reasoning: "string similarity (AI disabled)"}, nil
}

func (n *NoopService) ScoreRelease(_ context.Context, movie Movie, r plugin.Release) (ScoreResult, error) {
    score := scoreByRules(r) // static group list + size heuristics
    return ScoreResult{Score: score, Factors: []string{"rule-based scoring (AI disabled)"}}, nil
}

func (n *NoopService) FilterReleases(_ context.Context, movie Movie, releases []plugin.Release) (FilterResult, error) {
    return filterByRules(movie, releases), nil // hard quality/size filters
}
```

---

## History-Informed Scoring

The AI scorer can be informed by local history. Before calling Claude, the scorer
fetches recent GrabHistory for this movie (and similar movies) and includes a summary
in the prompt:

```
User grab history (last 90 days):
- Kept: BluRay Remux x265 (avg 45GB) — 12 times
- Replaced: YIFY (under 2GB) — 3 times
- Replaced: x264 groups — 5 times
```

This gives Claude personalized context without requiring Claude to "learn" — the
learning lives in our database and is fed as context per request.

---

## Rate Limiting and Cost Control

- AI calls are bounded per RSS sync cycle (configurable max calls per run)
- Results are cached for the duration of a search session (same movie + same releases
  within a 5-minute window won't be scored twice)
- Batch filtering (the FilterReleases call) processes all releases in one API call,
  not one call per release
- All AI calls are traced in the application log with token counts for visibility
