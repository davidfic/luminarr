// Package jobs provides the built-in scheduler job definitions.
package jobs

import (
	"context"
	"log/slog"
	"time"

	"github.com/davidfic/luminarr/internal/core/queue"
	"github.com/davidfic/luminarr/internal/scheduler"
)

// QueuePoll returns a Job that polls all active downloads and updates their
// status in the database. Runs every 60 seconds.
func QueuePoll(svc *queue.Service, logger *slog.Logger) scheduler.Job {
	return scheduler.Job{
		Name:     "queue_poll",
		Interval: 60 * time.Second,
		Fn: func(ctx context.Context) {
			logger.Info("task started", "task", "queue_poll")
			start := time.Now()
			if err := svc.PollAndUpdate(ctx); err != nil {
				logger.Warn("task failed",
					"task", "queue_poll",
					"error", err,
					"duration_ms", time.Since(start).Milliseconds(),
				)
				return
			}
			logger.Info("task finished",
				"task", "queue_poll",
				"duration_ms", time.Since(start).Milliseconds(),
			)
		},
	}
}
