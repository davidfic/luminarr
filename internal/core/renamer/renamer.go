// Package renamer applies naming format templates to produce filesystem-safe
// filenames for imported movie files.
package renamer

import (
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/davidfic/luminarr/pkg/plugin"
)

// DefaultFileFormat is used when a library has no naming_format set.
const DefaultFileFormat = "{Movie Title} ({Release Year}) {Quality Full}"

// DefaultFolderFormat is the fixed folder name template.
// Libraries may eventually allow overriding this; for now it is constant.
const DefaultFolderFormat = "{Movie Title} ({Release Year})"

// Movie holds the movie metadata the renamer needs.
type Movie struct {
	Title         string
	OriginalTitle string
	Year          int
}

// Apply returns the formatted filename (without extension) for the given movie,
// quality, and format string. Substitution variables:
//
//	{Movie Title}          → movie.Title
//	{Movie CleanTitle}     → filesystem-safe version of movie.Title
//	{Original Title}       → movie.OriginalTitle
//	{Release Year}         → movie.Year
//	{Quality Full}         → quality.Name  (e.g. "Bluray-1080p")
//	{MediaInfo VideoCodec} → quality.Codec (e.g. "x265")
func Apply(format string, m Movie, q plugin.Quality) string {
	r := strings.NewReplacer(
		"{Movie Title}", m.Title,
		"{Movie CleanTitle}", CleanTitle(m.Title),
		"{Original Title}", m.OriginalTitle,
		"{Release Year}", yearStr(m.Year),
		"{Quality Full}", q.Name,
		"{MediaInfo VideoCodec}", string(q.Codec),
	)
	result := r.Replace(format)
	return sanitize(result)
}

// FolderName returns the library sub-directory name for a movie, using the
// fixed DefaultFolderFormat.
func FolderName(m Movie) string {
	return Apply(DefaultFolderFormat, m, plugin.Quality{})
}

// CleanTitle strips characters that are problematic on common filesystems
// while preserving readability. Used for {Movie CleanTitle}.
func CleanTitle(title string) string {
	// Replace : with - (common in movie titles like "Batman: Begins")
	title = strings.ReplaceAll(title, ":", " -")
	// Remove characters invalid on most filesystems.
	title = invalidCharsRe.ReplaceAllString(title, "")
	// Collapse multiple spaces.
	title = multiSpaceRe.ReplaceAllString(title, " ")
	return strings.TrimSpace(title)
}

// sanitize makes a string safe to use as a filename: removes path separators
// and collapses whitespace. Does not strip colons or other title chars so that
// the full {Movie Title} variable retains its value; use CleanTitle for that.
func sanitize(s string) string {
	// Remove path separators and null bytes.
	s = strings.NewReplacer("/", "", "\x00", "").Replace(s)
	s = multiSpaceRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// DestPath returns the absolute destination path for an imported file.
//
//	libraryRoot / FolderName(m) / Apply(fileFormat, m, q) + ext
func DestPath(libraryRoot, fileFormat string, m Movie, q plugin.Quality, sourceExt string) string {
	folder := FolderName(m)
	file := Apply(fileFormat, m, q) + sourceExt
	return filepath.Join(libraryRoot, folder, file)
}

func yearStr(y int) string {
	if y == 0 {
		return ""
	}
	return fmt.Sprintf("%d", y)
}

var (
	invalidCharsRe = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)
	multiSpaceRe   = regexp.MustCompile(`\s{2,}`)
)
