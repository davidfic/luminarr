package plugin

import (
	"context"
	"time"
)

// EventType identifies what happened.
type EventType string

const (
	EventMovieAdded   EventType = "movie_added"
	EventMovieDeleted EventType = "movie_deleted"
	EventGrabStarted  EventType = "grab_started"
	EventDownloadDone EventType = "download_done"
	EventImportDone   EventType = "import_done"
	EventImportFailed EventType = "import_failed"
	EventHealthIssue  EventType = "health_issue"
	EventHealthOK     EventType = "health_ok"
)

// NotificationEvent carries the context of something that happened.
type NotificationEvent struct {
	Type      EventType
	Timestamp time.Time
	MovieID   string         // UUID, if movie-related; empty otherwise
	Message   string         // human-readable summary
	Data      map[string]any // event-specific extra fields
}

// Notifier is the plugin interface for notification channels.
type Notifier interface {
	Name() string
	Notify(ctx context.Context, event NotificationEvent) error
	Test(ctx context.Context) error
}
