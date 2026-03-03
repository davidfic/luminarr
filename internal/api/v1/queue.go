package v1

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/davidfic/luminarr/internal/core/queue"
)

// ── Request / response shapes ────────────────────────────────────────────────

type queueItemBody struct {
	GrabID           string    `json:"id"                doc:"Grab history UUID"`
	MovieID          string    `json:"movie_id"`
	ReleaseTitle     string    `json:"release_title"`
	Protocol         string    `json:"protocol"`
	Size             int64     `json:"size"`
	DownloadedBytes  int64     `json:"downloaded_bytes"`
	Status           string    `json:"status"            doc:"queued, downloading, completed, paused, failed"`
	DownloadClientID string    `json:"download_client_id,omitempty"`
	ClientItemID     string    `json:"client_item_id,omitempty"`
	GrabbedAt        time.Time `json:"grabbed_at"`
}

type queueListOutput struct {
	Body []*queueItemBody
}

type queueDeleteInput struct {
	ID          string `path:"id"                           doc:"Grab history UUID"`
	DeleteFiles bool   `query:"delete_files" default:"false" doc:"Also delete downloaded data from disk"`
}

type queueDeleteOutput struct{}

// ── Helpers ──────────────────────────────────────────────────────────────────

func queueItemToBody(item queue.Item) *queueItemBody {
	return &queueItemBody{
		GrabID:           item.GrabID,
		MovieID:          item.MovieID,
		ReleaseTitle:     item.ReleaseTitle,
		Protocol:         item.Protocol,
		Size:             item.Size,
		DownloadedBytes:  item.DownloadedBytes,
		Status:           item.Status,
		DownloadClientID: item.DownloadClientID,
		ClientItemID:     item.ClientItemID,
		GrabbedAt:        item.GrabbedAt,
	}
}

// ── Route registration ───────────────────────────────────────────────────────

// RegisterQueueRoutes registers the /api/v1/queue endpoints.
func RegisterQueueRoutes(api huma.API, svc *queue.Service) {
	// GET /api/v1/queue
	huma.Register(api, huma.Operation{
		OperationID: "get-queue",
		Method:      http.MethodGet,
		Path:        "/api/v1/queue",
		Summary:     "Get the active download queue",
		Tags:        []string{"Queue"},
	}, func(ctx context.Context, _ *struct{}) (*queueListOutput, error) {
		items, err := svc.GetQueue(ctx)
		if err != nil {
			return nil, huma.NewError(http.StatusInternalServerError, "failed to get queue", err)
		}
		bodies := make([]*queueItemBody, len(items))
		for i, item := range items {
			bodies[i] = queueItemToBody(item)
		}
		return &queueListOutput{Body: bodies}, nil
	})

	// DELETE /api/v1/queue/{id}
	huma.Register(api, huma.Operation{
		OperationID:   "remove-from-queue",
		Method:        http.MethodDelete,
		Path:          "/api/v1/queue/{id}",
		Summary:       "Remove a download from the queue",
		Tags:          []string{"Queue"},
		DefaultStatus: http.StatusNoContent,
	}, func(ctx context.Context, input *queueDeleteInput) (*queueDeleteOutput, error) {
		if err := svc.RemoveFromQueue(ctx, input.ID, input.DeleteFiles); err != nil {
			return nil, huma.NewError(http.StatusInternalServerError, "failed to remove from queue", err)
		}
		return &queueDeleteOutput{}, nil
	})
}
