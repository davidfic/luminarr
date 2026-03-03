package jobs

import "testing"

func TestNormalizeTitle(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"The.Dark.Knight", "the dark knight"},
		{"Interstellar_2014", "interstellar 2014"},
		{"Avatar: The Way of Water", "avatar the way of water"},
		{"WALL-E", "wall e"},
		{"A.I. Artificial.Intelligence", "a i artificial intelligence"},
		{"", ""},
		{"  multiple   spaces  ", "multiple spaces"},
	}
	for _, tc := range cases {
		got := normalizeTitle(tc.input)
		if got != tc.want {
			t.Errorf("normalizeTitle(%q) = %q; want %q", tc.input, got, tc.want)
		}
	}
}

func TestReleaseMatchesMovie(t *testing.T) {
	cases := []struct {
		release string
		title   string
		year    int
		want    bool
	}{
		{
			release: "The.Dark.Knight.2008.BluRay.1080p.x264",
			title:   "The Dark Knight",
			year:    2008,
			want:    true,
		},
		{
			release: "Interstellar.2014.2160p.UHD.BluRay.x265",
			title:   "Interstellar",
			year:    2014,
			want:    true,
		},
		{
			release: "Avatar.The.Way.of.Water.2022.1080p.WEBRip.x264",
			title:   "Avatar: The Way of Water",
			year:    2022,
			want:    true,
		},
		{
			// Wrong year — should not match.
			release: "The.Dark.Knight.2008.BluRay.1080p",
			title:   "The Dark Knight",
			year:    2009,
			want:    false,
		},
		{
			// Different movie — title doesn't appear.
			release: "Inception.2010.BluRay.1080p",
			title:   "Interstellar",
			year:    2010,
			want:    false,
		},
		{
			// Empty movie title — must not match anything.
			release: "Inception.2010.BluRay.1080p",
			title:   "",
			year:    2010,
			want:    false,
		},
		{
			// Year present but title absent.
			release: "2008.Some.Other.Movie.BluRay",
			title:   "The Dark Knight",
			year:    2008,
			want:    false,
		},
	}

	for _, tc := range cases {
		got := releaseMatchesMovie(tc.release, tc.title, tc.year)
		if got != tc.want {
			t.Errorf("releaseMatchesMovie(%q, %q, %d) = %v; want %v",
				tc.release, tc.title, tc.year, got, tc.want)
		}
	}
}
