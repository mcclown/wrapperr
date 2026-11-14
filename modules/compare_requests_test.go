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
	seasonPlay := func(userID int, user string, key int, season int, date string) models.TautulliEntry {
		play := seerrTestPlay(userID, user, "episode", key, "Show B", date, 1500)
		play.ParentMediaIndex = &season
		return play
	}
	showRequest := keyed(seerrTestRequest(2, 200, "bob", "tv", "2026-03-01T00:00:00Z"), "20")
	showRequest.Seasons = []models.SeerrRequestSeason{{SeasonNumber: 3}}
	requests := []models.SeerrRequest{
		keyed(seerrTestRequest(1, 100, "alice", "movie", "2026-02-01T00:00:00Z"), "10"),
		showRequest, // season 3 only
		keyed(seerrTestRequest(1, 100, "alice", "movie", "2025-06-01T00:00:00Z"), "30"), // last year
	}
	day := models.WrapperrDay{Data: []models.TautulliEntry{
		seerrTestPlay(200, "bob", "movie", 10, "Movie A", "2026-02-05T20:00:00Z", 6000),
		seerrTestPlay(100, "alice", "episode", 20, "Show B", "2026-02-10T20:00:00Z", 1500), // before it was requested
		seasonPlay(300, "carol", 20, 1, "2026-04-10T20:00:00Z"),                            // a season nobody asked for
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

func TestLastYearRequesterRanks(t *testing.T) {
	requests := []models.SeerrRequest{
		seerrTestRequest(1, 100, "alice", "movie", "2025-02-01T00:00:00Z"),
		seerrTestRequest(1, 100, "alice", "movie", "2025-03-01T00:00:00Z"),
		seerrTestRequest(2, 200, "bob", "movie", "2025-04-01T00:00:00Z"),
		seerrTestRequest(3, 300, "carol", "movie", "2025-05-01T00:00:00Z"),
		seerrTestRequest(2, 200, "bob", "movie", "2026-02-01T00:00:00Z"), // this year
	}
	lastConfig := models.WrapperrConfig{
		WrappedStart: int(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC).Unix()),
		WrappedEnd:   int(time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC).Unix()),
	}

	ranks := lastYearRequesterRanks(requests, nil, lastConfig)
	if ranks[100] != 1 || ranks[200] != 2 || ranks[300] != 2 || ranks[400] != 0 {
		t.Errorf("unexpected ranks %v, want alice 1, bob and carol 2, nobody else", ranks)
	}

	// The top requesters carry them, before other users are named
	_, year := SeerrRequestStatistics(requests[4:], nil, 100, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC), 10, true, newOtherUserNamer("obfuscate"), ranks)
	if len(year.Data.Requesters) != 1 || year.Data.Requesters[0].LastRank == nil || *year.Data.Requesters[0].LastRank != 2 {
		t.Errorf("expected bob's last place 2 on the top requesters, got %+v", year.Data.Requesters)
	}
}

func TestLastYearReachRanks(t *testing.T) {
	keyed := func(seerrID int, plexID int, user string, key string, date string) models.SeerrRequest {
		request := seerrTestRequest(seerrID, plexID, user, "movie", date)
		request.Media.RatingKey = &key
		return request
	}
	requests := []models.SeerrRequest{
		// Last year: alice's requests, and bob's and carol's that alice watched
		keyed(1, 100, "alice", "10", "2025-02-01T00:00:00Z"),
		keyed(1, 100, "alice", "11", "2025-02-01T00:00:00Z"),
		keyed(2, 200, "bob", "20", "2025-02-01T00:00:00Z"),
		keyed(2, 200, "bob", "21", "2025-02-01T00:00:00Z"),
		keyed(2, 200, "bob", "22", "2025-02-01T00:00:00Z"),
		keyed(3, 300, "carol", "30", "2025-02-01T00:00:00Z"),
		// This year
		keyed(1, 100, "alice", "12", "2026-02-01T00:00:00Z"),
	}
	lastYear := []models.WrapperrDay{{Data: []models.TautulliEntry{
		seerrTestPlay(200, "bob", "movie", 10, "A", "2025-03-01T20:00:00Z", 6000),
		seerrTestPlay(200, "bob", "movie", 11, "B", "2025-03-01T20:00:00Z", 6000),
		seerrTestPlay(300, "carol", "movie", 10, "A", "2025-03-01T20:00:00Z", 6000),
		seerrTestPlay(100, "alice", "movie", 20, "C", "2025-03-01T20:00:00Z", 6000),
		seerrTestPlay(100, "alice", "movie", 21, "D", "2025-03-01T20:00:00Z", 6000),
		seerrTestPlay(100, "alice", "movie", 30, "E", "2025-03-01T20:00:00Z", 6000),
	}}}
	lastConfig := models.WrapperrConfig{
		WrappedStart: int(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC).Unix()),
		WrappedEnd:   int(time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC).Unix()),
	}

	ranks := lastYearReachRanks(requests, nil, lastYear, 100, lastConfig)
	if ranks.followers[200] != 1 || ranks.followers[300] != 2 {
		t.Errorf("followers %v, want bob 1 and carol 2", ranks.followers)
	}
	if ranks.followingTitles[200] != 1 || ranks.followingTitles[300] != 2 {
		t.Errorf("following by titles %v, want bob 1 and carol 2", ranks.followingTitles)
	}
	if ranks.followingPercent[300] != 1 || ranks.followingPercent[200] != 2 {
		t.Errorf("following by share %v, want carol 1 and bob 2", ranks.followingPercent)
	}
	if lastYearReachRanks(requests, nil, nil, 100, lastConfig) != nil {
		t.Error("expected no places without last year's plays")
	}

	// This year's followers carry them, before other users are named
	day := models.WrapperrDay{Data: []models.TautulliEntry{
		seerrTestPlay(300, "carol", "movie", 12, "F", "2026-03-01T20:00:00Z", 7000),
		seerrTestPlay(400, "dave", "movie", 12, "F", "2026-03-01T20:00:00Z", 6000),
	}}
	reach := SeerrRequestReach(requests, nil, []models.WrapperrDay{day}, 100, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 12, 31, 0, 0, 0, 0, time.UTC), 10, true, newOtherUserNamer("obfuscate"), ranks)
	if len(reach.Followers) != 2 || reach.Followers[0].LastRank == nil || *reach.Followers[0].LastRank != 2 || reach.Followers[1].LastRank == nil || *reach.Followers[1].LastRank != 0 {
		t.Errorf("expected carol last 2nd and dave new on the followers, got %+v", reach.Followers)
	}
	if reach.TrendsettersTitles[0].LastRank != nil {
		t.Error("expected no last places on the trendsetters")
	}
}
