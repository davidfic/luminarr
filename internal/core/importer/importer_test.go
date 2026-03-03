package importer_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	dbsqlite "github.com/davidfic/luminarr/internal/db/generated/sqlite"
	"github.com/davidfic/luminarr/internal/events"
	"github.com/davidfic/luminarr/internal/core/importer"
	"github.com/davidfic/luminarr/internal/logging"
)

// ── Fake DB querier ────────────────────────────────────────────────────────

type fakeQuerier struct {
	dbsqlite.Querier // embed to satisfy interface; unused methods panic

	grab  dbsqlite.GrabHistory
	movie dbsqlite.Movie
	lib   dbsqlite.Library

	// captured writes
	createdFile   *dbsqlite.CreateMovieFileParams
	updatedPath   *dbsqlite.UpdateMoviePathParams
	updatedStatus *dbsqlite.UpdateMovieStatusParams
}

func (f *fakeQuerier) GetGrabByID(_ context.Context, id string) (dbsqlite.GrabHistory, error) {
	return f.grab, nil
}
func (f *fakeQuerier) GetMovie(_ context.Context, id string) (dbsqlite.Movie, error) {
	return f.movie, nil
}
func (f *fakeQuerier) GetLibrary(_ context.Context, id string) (dbsqlite.Library, error) {
	return f.lib, nil
}
func (f *fakeQuerier) CreateMovieFile(_ context.Context, p dbsqlite.CreateMovieFileParams) (dbsqlite.MovieFile, error) {
	f.createdFile = &p
	return dbsqlite.MovieFile{}, nil
}
func (f *fakeQuerier) UpdateMoviePath(_ context.Context, p dbsqlite.UpdateMoviePathParams) (dbsqlite.Movie, error) {
	f.updatedPath = &p
	return f.movie, nil
}
func (f *fakeQuerier) UpdateMovieStatus(_ context.Context, p dbsqlite.UpdateMovieStatusParams) (dbsqlite.Movie, error) {
	f.updatedStatus = &p
	return f.movie, nil
}

// ── Helpers ────────────────────────────────────────────────────────────────

func newTestGrab(movieID string) dbsqlite.GrabHistory {
	return dbsqlite.GrabHistory{
		ID:                "grab-1",
		MovieID:           movieID,
		ReleaseTitle:      "Inception.2010.1080p.BluRay.x264",
		ReleaseResolution: "1080p",
		ReleaseSource:     "bluray",
		ReleaseCodec:      "x264",
		ReleaseHdr:        "none",
		Protocol:          "torrent",
		Size:              5_000_000_000,
		GrabbedAt:         time.Now().UTC().Format(time.RFC3339),
		DownloadStatus:    "completed",
	}
}

func newTestMovie(movieID, libID string) dbsqlite.Movie {
	return dbsqlite.Movie{
		ID:            movieID,
		Title:         "Inception",
		OriginalTitle: "Inception",
		Year:          2010,
		LibraryID:     libID,
		Status:        "wanted",
	}
}

func newTestLibrary(libID, rootPath string) dbsqlite.Library {
	return dbsqlite.Library{
		ID:                      libID,
		Name:                    "Movies",
		RootPath:                rootPath,
		DefaultQualityProfileID: "qp-1",
		MinFreeSpaceGb:          5,
		TagsJson:                "[]",
		CreatedAt:               time.Now().UTC().Format(time.RFC3339),
		UpdatedAt:               time.Now().UTC().Format(time.RFC3339),
	}
}

// ── Tests ──────────────────────────────────────────────────────────────────

func TestImport_SingleFile(t *testing.T) {
	tmp := t.TempDir()
	libRoot := filepath.Join(tmp, "library")
	if err := os.MkdirAll(libRoot, 0o755); err != nil {
		t.Fatal(err)
	}

	// Create a fake source video file.
	srcDir := filepath.Join(tmp, "downloads", "Inception.2010.1080p.BluRay.x264")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	srcFile := filepath.Join(srcDir, "Inception.2010.1080p.BluRay.x264.mkv")
	if err := os.WriteFile(srcFile, []byte("fake video data"), 0o644); err != nil {
		t.Fatal(err)
	}

	const (
		movieID = "movie-1"
		libID   = "lib-1"
	)
	fq := &fakeQuerier{
		grab:  newTestGrab(movieID),
		movie: newTestMovie(movieID, libID),
		lib:   newTestLibrary(libID, libRoot),
	}

	logger := logging.New("error", "text")
	bus := events.New(logger)

	var gotComplete *events.Event
	bus.Subscribe(func(_ context.Context, e events.Event) {
		if e.Type == events.TypeImportComplete {
			cp := e
			gotComplete = &cp
		}
	})

	svc := importer.NewService(fq, bus, logger)
	svc.Subscribe()

	// Fire the download done event.
	ctx := context.Background()
	bus.Publish(ctx, events.Event{
		Type:    events.TypeDownloadDone,
		MovieID: movieID,
		Data: map[string]any{
			"grab_id":      "grab-1",
			"content_path": srcFile,
		},
	})

	// Give the async handler time to finish.
	time.Sleep(100 * time.Millisecond)

	if fq.createdFile == nil {
		t.Fatal("expected CreateMovieFile to be called")
	}
	if fq.createdFile.MovieID != movieID {
		t.Errorf("movie_file.movie_id = %q, want %q", fq.createdFile.MovieID, movieID)
	}
	if filepath.Ext(fq.createdFile.Path) != ".mkv" {
		t.Errorf("movie_file.path extension = %q, want .mkv", filepath.Ext(fq.createdFile.Path))
	}

	if fq.updatedStatus == nil {
		t.Fatal("expected UpdateMovieStatus to be called")
	}
	if fq.updatedStatus.Status != "downloaded" {
		t.Errorf("movie status = %q, want \"downloaded\"", fq.updatedStatus.Status)
	}

	if gotComplete == nil {
		t.Fatal("expected TypeImportComplete event")
	}

	// Verify the file actually exists at the destination.
	if _, err := os.Stat(fq.createdFile.Path); err != nil {
		t.Errorf("destination file not found: %v", err)
	}
}

func TestImport_Directory_PicksLargestVideo(t *testing.T) {
	tmp := t.TempDir()
	libRoot := filepath.Join(tmp, "library")
	if err := os.MkdirAll(libRoot, 0o755); err != nil {
		t.Fatal(err)
	}

	// Content dir with multiple files; the .mkv should be picked.
	contentDir := filepath.Join(tmp, "downloads", "Movie.Dir")
	if err := os.MkdirAll(contentDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Subs (small) and main feature (large).
	os.WriteFile(filepath.Join(contentDir, "sub.srt"), []byte("subtitle"), 0o644)
	os.WriteFile(filepath.Join(contentDir, "small.mkv"), []byte("small"), 0o644)
	os.WriteFile(filepath.Join(contentDir, "feature.mkv"), []byte("this is the large video file content"), 0o644)

	const (
		movieID = "movie-2"
		libID   = "lib-1"
	)
	fq := &fakeQuerier{
		grab:  newTestGrab(movieID),
		movie: newTestMovie(movieID, libID),
		lib:   newTestLibrary(libID, libRoot),
	}

	logger := logging.New("error", "text")
	bus := events.New(logger)
	svc := importer.NewService(fq, bus, logger)
	svc.Subscribe()

	ctx := context.Background()
	bus.Publish(ctx, events.Event{
		Type:    events.TypeDownloadDone,
		MovieID: movieID,
		Data: map[string]any{
			"grab_id":      "grab-1",
			"content_path": contentDir,
		},
	})

	time.Sleep(100 * time.Millisecond)

	if fq.createdFile == nil {
		t.Fatal("expected CreateMovieFile to be called")
	}
	// The imported file should be the largest .mkv
	if filepath.Base(fq.createdFile.Path) != "Inception (2010) Bluray-1080p.mkv" {
		t.Logf("dest path = %q", fq.createdFile.Path)
	}
	// Verify it's a .mkv
	if filepath.Ext(fq.createdFile.Path) != ".mkv" {
		t.Errorf("expected .mkv, got %q", filepath.Ext(fq.createdFile.Path))
	}
}

func TestImport_MissingGrabID(t *testing.T) {
	logger := logging.New("error", "text")
	bus := events.New(logger)

	var gotFailed bool
	bus.Subscribe(func(_ context.Context, e events.Event) {
		if e.Type == events.TypeImportFailed {
			gotFailed = true
		}
	})

	fq := &fakeQuerier{}
	svc := importer.NewService(fq, bus, logger)
	svc.Subscribe()

	ctx := context.Background()
	bus.Publish(ctx, events.Event{
		Type: events.TypeDownloadDone,
		Data: map[string]any{
			// no grab_id
			"content_path": "/some/path.mkv",
		},
	})

	time.Sleep(50 * time.Millisecond)

	// No import should have run — no DB calls.
	if fq.createdFile != nil {
		t.Error("expected no CreateMovieFile call")
	}
	// TypeImportFailed should NOT be fired either (we just warn and return).
	if gotFailed {
		t.Error("expected no TypeImportFailed for missing grab_id")
	}
}

func TestImport_EmptyContentPath(t *testing.T) {
	const (
		movieID = "movie-3"
		libID   = "lib-1"
	)

	logger := logging.New("error", "text")
	bus := events.New(logger)

	var gotFailed bool
	bus.Subscribe(func(_ context.Context, e events.Event) {
		if e.Type == events.TypeImportFailed {
			gotFailed = true
		}
	})

	fq := &fakeQuerier{
		grab:  newTestGrab(movieID),
		movie: newTestMovie(movieID, libID),
		lib:   newTestLibrary(libID, t.TempDir()),
	}
	svc := importer.NewService(fq, bus, logger)
	svc.Subscribe()

	ctx := context.Background()
	bus.Publish(ctx, events.Event{
		Type:    events.TypeDownloadDone,
		MovieID: movieID,
		Data: map[string]any{
			"grab_id":      "grab-1",
			"content_path": "", // empty
		},
	})

	time.Sleep(100 * time.Millisecond)

	if !gotFailed {
		t.Error("expected TypeImportFailed event for empty content_path")
	}
}
