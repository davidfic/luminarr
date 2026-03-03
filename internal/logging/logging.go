package logging

import (
	"log/slog"
	"os"
	"strings"
)

// New creates and returns a configured slog.Logger.
//
// Format "json" produces structured JSON output (default, for production).
// Format "text" produces human-readable key=value output (for development).
//
// Level is one of: debug, info, warn, error. Default: info.
func New(level, format string) *slog.Logger {
	opts := &slog.HandlerOptions{
		Level: parseLevel(level),
	}

	var handler slog.Handler
	if strings.ToLower(format) == "text" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}

	return slog.New(handler)
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
