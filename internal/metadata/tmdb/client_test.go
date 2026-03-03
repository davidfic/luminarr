package tmdb

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// newTestClient returns a Client pointed at the given test server URL.
func newTestClient(serverURL string) *Client {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	c := New("test-api-key", logger)
	c.baseURL = serverURL
	return c
}

// mustMarshal panics if json.Marshal fails — acceptable in test helpers.
func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return b
}

func TestSearchMovies_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/search/movie" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("query") != "Inception" {
			t.Errorf("missing or wrong query param: %s", r.URL.Query().Get("query"))
		}
		if r.Header.Get("User-Agent") != userAgent {
			t.Errorf("User-Agent = %q, want %q", r.Header.Get("User-Agent"), userAgent)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := map[string]any{
			"results": []map[string]any{
				{
					"id":             27205,
					"title":          "Inception",
					"original_title": "Inception",
					"overview":       "A thief who steals corporate secrets.",
					"release_date":   "2010-07-16",
					"poster_path":    "/path/to/poster.jpg",
					"backdrop_path":  "/path/to/backdrop.jpg",
					"popularity":     85.4,
				},
			},
		}
		_, _ = w.Write(mustMarshal(t, resp))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	results, err := c.SearchMovies(context.Background(), "Inception", 0)
	if err != nil {
		t.Fatalf("SearchMovies() error = %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("len(results) = %d, want 1", len(results))
	}

	got := results[0]
	if got.ID != 27205 {
		t.Errorf("ID = %d, want 27205", got.ID)
	}
	if got.Title != "Inception" {
		t.Errorf("Title = %q, want Inception", got.Title)
	}
	if got.Year != 2010 {
		t.Errorf("Year = %d, want 2010", got.Year)
	}
	if got.ReleaseDate != "2010-07-16" {
		t.Errorf("ReleaseDate = %q, want 2010-07-16", got.ReleaseDate)
	}
	if got.Popularity != 85.4 {
		t.Errorf("Popularity = %f, want 85.4", got.Popularity)
	}
}

func TestSearchMovies_WithYearFilter(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		yearParam := r.URL.Query().Get("primary_release_year")
		if yearParam != "2010" {
			t.Errorf("primary_release_year = %q, want 2010", yearParam)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(mustMarshal(t, map[string]any{
			"results": []map[string]any{
				{
					"id":           27205,
					"title":        "Inception",
					"release_date": "2010-07-16",
				},
			},
		}))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	results, err := c.SearchMovies(context.Background(), "Inception", 2010)
	if err != nil {
		t.Fatalf("SearchMovies() error = %v", err)
	}
	if len(results) != 1 {
		t.Errorf("len(results) = %d, want 1", len(results))
	}
}

func TestSearchMovies_EmptyResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(mustMarshal(t, map[string]any{
			"results": []any{},
		}))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	results, err := c.SearchMovies(context.Background(), "xyzzy-no-match", 0)
	if err != nil {
		t.Fatalf("SearchMovies() error = %v", err)
	}
	if len(results) != 0 {
		t.Errorf("len(results) = %d, want 0", len(results))
	}
}

func TestSearchMovies_APIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write(mustMarshal(t, map[string]any{
			"status_message": "Invalid API key: You must be granted a valid key.",
			"status_code":    7,
		}))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	_, err := c.SearchMovies(context.Background(), "Inception", 0)
	if err == nil {
		t.Fatal("SearchMovies() expected error, got nil")
	}
	// The error should propagate with HTTP status context.
}

func TestGetMovie_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/movie/27205" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(mustMarshal(t, map[string]any{
			"id":             27205,
			"imdb_id":        "tt1375666",
			"title":          "Inception",
			"original_title": "Inception",
			"overview":       "A thief who steals corporate secrets.",
			"release_date":   "2010-07-16",
			"runtime":        148,
			"genres": []map[string]any{
				{"id": 28, "name": "Action"},
				{"id": 878, "name": "Science Fiction"},
			},
			"poster_path":   "/path/to/poster.jpg",
			"backdrop_path": "/path/to/backdrop.jpg",
			"status":        "Released",
		}))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	movie, err := c.GetMovie(context.Background(), 27205)
	if err != nil {
		t.Fatalf("GetMovie() error = %v", err)
	}

	if movie.ID != 27205 {
		t.Errorf("ID = %d, want 27205", movie.ID)
	}
	if movie.IMDBId != "tt1375666" {
		t.Errorf("IMDBId = %q, want tt1375666", movie.IMDBId)
	}
	if movie.Title != "Inception" {
		t.Errorf("Title = %q, want Inception", movie.Title)
	}
	if movie.Year != 2010 {
		t.Errorf("Year = %d, want 2010", movie.Year)
	}
	if movie.RuntimeMinutes != 148 {
		t.Errorf("RuntimeMinutes = %d, want 148", movie.RuntimeMinutes)
	}
	if len(movie.Genres) != 2 {
		t.Fatalf("len(Genres) = %d, want 2", len(movie.Genres))
	}
	if movie.Genres[0] != "Action" {
		t.Errorf("Genres[0] = %q, want Action", movie.Genres[0])
	}
	if movie.Genres[1] != "Science Fiction" {
		t.Errorf("Genres[1] = %q, want Science Fiction", movie.Genres[1])
	}
	if movie.Status != "released" {
		t.Errorf("Status = %q, want released", movie.Status)
	}
}

func TestGetMovie_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write(mustMarshal(t, map[string]any{
			"status_message": "The resource you requested could not be found.",
			"status_code":    34,
		}))
	}))
	defer srv.Close()

	c := newTestClient(srv.URL)
	movie, err := c.GetMovie(context.Background(), 999999999)
	if err == nil {
		t.Fatal("GetMovie() expected error for 404, got nil")
	}
	if movie != nil {
		t.Errorf("GetMovie() returned non-nil movie on 404")
	}
}

func TestStatusMapping(t *testing.T) {
	cases := []struct {
		tmdb string
		want string
	}{
		{"Released", "released"},
		{"In Production", "announced"},
		{"Post Production", "announced"},
		{"Planned", "announced"},
		{"Canceled", "announced"},
		{"", "announced"},
	}

	for _, tc := range cases {
		got := mapStatus(tc.tmdb)
		if got != tc.want {
			t.Errorf("mapStatus(%q) = %q, want %q", tc.tmdb, got, tc.want)
		}
	}
}

func TestRedactAPIKey(t *testing.T) {
	raw := "https://api.themoviedb.org/3/search/movie?api_key=my-secret-key&query=Inception"
	got := redactAPIKey(raw, "my-secret-key")
	want := "https://api.themoviedb.org/3/search/movie?api_key=***&query=Inception"
	if got != want {
		t.Errorf("redactAPIKey() = %q, want %q", got, want)
	}
}
