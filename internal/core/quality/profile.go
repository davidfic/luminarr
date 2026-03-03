package quality

import "github.com/davidfic/luminarr/pkg/plugin"

// Profile defines a quality policy for a monitored movie.
// It controls which releases are acceptable and when upgrades are triggered.
type Profile struct {
	// ID is a stable identifier (e.g. a UUID or slug).
	ID string
	// Name is the human-readable label shown in the UI.
	Name string
	// Cutoff is the minimum quality that satisfies this profile.
	// Once a file at or above the cutoff is on disk, the movie is considered
	// "met" and no further grabs are triggered — unless upgrading is enabled.
	Cutoff plugin.Quality
	// Qualities lists every quality this profile will accept, ordered from
	// highest-preferred to lowest-preferred. Releases not in this list are
	// rejected regardless of other settings.
	Qualities []plugin.Quality
	// UpgradeAllowed, when true, permits grabbing a release that is better
	// than the current file even after the cutoff is met.
	UpgradeAllowed bool
	// UpgradeUntil, when non-nil, caps upgrades: once the current file meets
	// or exceeds this quality, no further upgrades are triggered.
	// Nil means "upgrade without limit" (subject to UpgradeAllowed).
	UpgradeUntil *plugin.Quality
}

// WantRelease reports whether this profile should grab a release with
// releaseQuality, given the quality of the file already on disk
// (currentFileQuality). Pass nil for currentFileQuality when no file exists.
//
// Decision logic:
//  1. The release quality must be in the profile's allowed set.
//  2. If no file exists, grab it.
//  3. If the current file is below the cutoff, grab anything allowed that is
//     at least as good as what we have (or better).
//  4. If the current file meets/exceeds the cutoff and upgrading is disabled,
//     do not grab.
//  5. If upgrading is enabled, grab if the release is a strict upgrade.
func (p *Profile) WantRelease(releaseQuality plugin.Quality, currentFileQuality *plugin.Quality) bool {
	if !p.isAllowed(releaseQuality) {
		return false
	}

	// No file on disk — grab anything allowed.
	if currentFileQuality == nil {
		return true
	}

	current := *currentFileQuality

	// Below cutoff: keep trying to improve.
	if !current.AtLeast(p.Cutoff) {
		return releaseQuality.AtLeast(current)
	}

	// Cutoff is met — only grab if upgrading is permitted and worthwhile.
	if !p.UpgradeAllowed {
		return false
	}

	return p.IsUpgrade(releaseQuality, current)
}

// IsUpgrade reports whether releaseQuality is a strict improvement over
// currentQuality, subject to the UpgradeUntil ceiling defined in this profile.
func (p *Profile) IsUpgrade(releaseQuality plugin.Quality, currentQuality plugin.Quality) bool {
	if !releaseQuality.BetterThan(currentQuality) {
		return false
	}

	// If an upgrade ceiling is set and the current file already meets or
	// exceeds it, do not upgrade further.
	if p.UpgradeUntil != nil && currentQuality.AtLeast(*p.UpgradeUntil) {
		return false
	}

	// If the release itself exceeds the ceiling, cap the effective target —
	// but we still want it because it gets us to (or past) the ceiling and
	// we don't have a file there yet.
	// In practice: if the release is better than current and current is below
	// the ceiling, it's a valid upgrade regardless of how far past the ceiling
	// the release goes.
	return true
}

// AllowedQualities returns the list of quality values this profile accepts.
// The slice is a copy; mutations do not affect the profile.
func (p *Profile) AllowedQualities() []plugin.Quality {
	out := make([]plugin.Quality, len(p.Qualities))
	copy(out, p.Qualities)
	return out
}

// isAllowed checks whether q appears in p.Qualities using Score equality.
// We compare by Score rather than struct equality so that the Name field
// (a derived label) doesn't cause false negatives.
//
// An empty Qualities list means "accept any quality", allowing a simple
// catch-all "Any" profile without enumerating every quality combination.
func (p *Profile) isAllowed(q plugin.Quality) bool {
	if len(p.Qualities) == 0 {
		return true
	}
	score := q.Score()
	for _, allowed := range p.Qualities {
		if allowed.Score() == score {
			return true
		}
	}
	return false
}
