package modules

import (
	"testing"
	"time"

	"github.com/aunefyren/wrapperr/models"
)

func TestCompareRequestYear(t *testing.T) {
	keyed := func(request models.SeerrRequest, key string) models.SeerrRequest {
		request.Media.RatingKey = &key
		return request
	}
	requests := []models.SeerrRequest{
		keyed(seerrTestRequest(1, 100, "alice", "movie", "2026-02-01T00:00:00Z"), "10"),
		keyed(seerrTestRequest(2, 200, "bob", "tv", "2026-03-01T00:00:00Z"), "20"),
		keyed(seerrTestRequest(1, 100, "alice", "movie", "2025-06-01T00:00:00Z"), "30"), // last year
	}
	day := models.WrapperrDay{Data: []models.TautulliEntry{
		seerrTestPlay(200, "bob", "movie", 10, "Movie A", "2026-02-05T20:00:00Z", 6000),
		seerrTestPlay(100, "alice", "episode", 20, "Show B", "2026-02-10T20:00:00Z", 1500), // before it was requested
	}}
	config := models.WrapperrConfig{
		WrappedStart: int(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).Unix()),
		WrappedEnd:   int(time.Date(2026, 12, 31, 23, 59, 59, 0, time.UTC).Unix()),
	}

	user, server := models.WrapperrCompareYear{}, models.WrapperrCompareYear{}
	compareRequestYear(requests, newRequesterResolver(nil), []models.WrapperrDay{day}, config, 100, &user, &server)
	if server.Requests != 2 || server.RequestsWatched != 1 {
		t.Errorf("server got %d requested, %d watched; want 2 and 1", server.Requests, server.RequestsWatched)
	}
	if user.Requests != 1 || user.RequestsWatched != 1 {
		t.Errorf("user got %d requested, %d watched; want 1 and 1", user.Requests, user.RequestsWatched)
	}
}
