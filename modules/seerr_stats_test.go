package modules

import (
	"reflect"
	"testing"
	"time"

	"github.com/aunefyren/wrapperr/models"
)

func seerrTestRequest(seerrID int, plexID int, plexUsername string, mediaType string, createdAt string) models.SeerrRequest {
	created, err := time.Parse(time.RFC3339, createdAt)
	if err != nil {
		panic(err)
	}
	request := models.SeerrRequest{CreatedAt: created}
	request.Media.MediaType = mediaType
	request.RequestedBy.ID = seerrID
	request.RequestedBy.DisplayName = plexUsername
	if plexID != 0 {
		request.RequestedBy.PlexID = &plexID
	}
	if plexUsername != "" {
		request.RequestedBy.PlexUsername = &plexUsername
	}
	return request
}

func TestSeerrRequestStatistics(t *testing.T) {
	originalLocal := time.Local
	time.Local = time.UTC
	defer func() { time.Local = originalLocal }()

	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 3, 31, 23, 59, 59, 0, time.UTC)

	users := []models.WrapperrUser{
		{UserID: 100, User: "alice", FriendlyName: "Alice"},
		{UserID: 200, User: "bob", FriendlyName: "Bob", Email: "bob@example.com"},
		{UserID: 300, User: "carol", FriendlyName: "Carol"},
		{UserID: 400, User: "ignored", FriendlyName: "Ignored", Ignore: true},
	}

	bobByEmail := seerrTestRequest(2, 0, "", "tv", "2026-02-10T12:00:00Z")
	bobByEmail.RequestedBy.Email = "BOB@example.com"

	requests := []models.SeerrRequest{
		seerrTestRequest(1, 100, "alice", "movie", "2026-01-05T12:00:00Z"),
		seerrTestRequest(1, 100, "alice", "tv", "2026-01-20T12:00:00Z"),
		seerrTestRequest(1, 100, "alice", "movie", "2026-03-01T12:00:00Z"),
		seerrTestRequest(2, 200, "bob", "movie", "2026-02-01T12:00:00Z"),
		bobByEmail,
		seerrTestRequest(3, 0, "carol", "movie", "2026-03-15T12:00:00Z"),
		seerrTestRequest(4, 400, "ignored", "movie", "2026-01-10T12:00:00Z"),
		seerrTestRequest(5, 0, "", "movie", "2026-02-02T12:00:00Z"),
		seerrTestRequest(1, 100, "alice", "movie", "2025-12-31T12:00:00Z"),
		seerrTestRequest(1, 100, "alice", "movie", "2026-04-01T12:00:00Z"),
	}
	requests[7].RequestedBy.DisplayName = "Local Dave"

	t.Run("current user", func(t *testing.T) {
		user, year := SeerrRequestStatistics(requests, users, 200, start, end, 10, true, newOtherUserNamer("friendly_name"))

		if user.Data.RequestCount != 2 || user.Data.MovieRequestCount != 1 || user.Data.ShowRequestCount != 1 {
			t.Errorf("unexpected user counts: %+v", user.Data)
		}
		if user.Data.RequestRank != 2 || user.Data.RequesterCount != 4 {
			t.Errorf("expected rank 2 of 4, got %d of %d", user.Data.RequestRank, user.Data.RequesterCount)
		}

		wantUserTimeline := []models.WrapperrRequestMonth{{Month: "2026-01", Requests: 0}, {Month: "2026-02", Requests: 2}, {Month: "2026-03", Requests: 0}}
		if !reflect.DeepEqual(user.Data.Timeline, wantUserTimeline) {
			t.Errorf("unexpected user timeline: %+v", user.Data.Timeline)
		}

		if year.Data.RequestCount != 7 {
			t.Errorf("expected 7 server requests, got %d", year.Data.RequestCount)
		}
		wantYearTimeline := []models.WrapperrRequestMonth{{Month: "2026-01", Requests: 2}, {Month: "2026-02", Requests: 3}, {Month: "2026-03", Requests: 2}}
		if !reflect.DeepEqual(year.Data.Timeline, wantYearTimeline) {
			t.Errorf("unexpected server timeline: %+v", year.Data.Timeline)
		}

		gotNames := []string{}
		for _, requester := range year.Data.Requesters {
			gotNames = append(gotNames, requester.User)
		}
		wantNames := []string{"Alice", "bob", "Carol", "Local Dave"}
		if !reflect.DeepEqual(gotNames, wantNames) {
			t.Errorf("unexpected requesters: %v", gotNames)
		}
		if year.Data.Requesters[3].UserID != -5 {
			t.Errorf("expected unmatched requester to get ID -5, got %d", year.Data.Requesters[3].UserID)
		}
	})

	t.Run("shared rank and top list limit", func(t *testing.T) {
		user, year := SeerrRequestStatistics(requests, users, 300, start, end, 2, true, newOtherUserNamer("friendly_name"))

		if user.Data.RequestRank != 3 || user.Data.RequestCount != 1 {
			t.Errorf("expected carol to share rank 3 with one request, got rank %d with %d", user.Data.RequestRank, user.Data.RequestCount)
		}
		if len(year.Data.Requesters) != 2 {
			t.Errorf("expected top list of 2, got %d", len(year.Data.Requesters))
		}
	})

	t.Run("no requests and hidden numbers", func(t *testing.T) {
		user, year := SeerrRequestStatistics(requests, users, 999, start, end, 0, false, newOtherUserNamer("obfuscate"))

		if user.Data.RequestCount != 0 || user.Data.RequestRank != 0 {
			t.Errorf("expected no requests for unknown user, got %+v", user.Data)
		}
		for _, requester := range year.Data.Requesters {
			if requester.Requests != 0 || requester.UserID != 0 {
				t.Errorf("expected scrubbed and obfuscated requester, got %+v", requester)
			}
			if requester.User == "Alice" || requester.User == "bob" {
				t.Errorf("expected obfuscated name, got %s", requester.User)
			}
		}
	})
}

func TestOtherUserNamerIsConsistent(t *testing.T) {
	namer := newOtherUserNamer("obfuscate")

	first, firstID := namer.name(100, "alice", "Alice")
	second, _ := namer.name(100, "alice", "Alice")
	managed, _ := namer.name(0, "", "")

	if first != second || firstID != 0 {
		t.Errorf("expected the same obfuscated name and a hidden ID, got %q/%q and %d", first, second, firstID)
	}
	if managed != "Managed user" {
		t.Errorf("expected managed user name, got %q", managed)
	}
}

func seerrTestPlay(userID int, user string, mediaType string, ratingKey int, title string, date string, duration int) models.TautulliEntry {
	played, err := time.Parse(time.RFC3339, date)
	if err != nil {
		panic(err)
	}
	entry := models.TautulliEntry{Date: int(played.Unix()), Duration: duration, UserID: userID, User: user, FriendlyName: user, MediaType: mediaType}
	if mediaType == "episode" {
		entry.GrandparentRatingKey, entry.GrandparentTitle = ratingKey, title
		entry.RatingKey, entry.Title = ratingKey*100, "Pilot"
	} else {
		entry.RatingKey, entry.Title = ratingKey, title
	}
	return entry
}

func TestSeerrRequestReach(t *testing.T) {
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 12, 31, 23, 59, 59, 0, time.UTC)

	users := []models.WrapperrUser{
		{UserID: 100, User: "alice", FriendlyName: "Alice"},
		{UserID: 200, User: "bob", FriendlyName: "Bob"},
		{UserID: 300, User: "carol", FriendlyName: "Carol"},
		{UserID: 400, User: "dave", FriendlyName: "Dave"},
	}

	withKey := func(request models.SeerrRequest, key string) models.SeerrRequest {
		request.Media.RatingKey = &key
		return request
	}

	requests := []models.SeerrRequest{
		// Alice requests a movie and a show
		withKey(seerrTestRequest(1, 100, "alice", "movie", "2026-02-01T00:00:00Z"), "10"),
		withKey(seerrTestRequest(1, 100, "alice", "tv", "2026-02-01T00:00:00Z"), "20"),
		// Bob requests a movie
		withKey(seerrTestRequest(2, 200, "bob", "movie", "2026-03-01T00:00:00Z"), "30"),
		// Requested before the wrapped period, so it does not count
		withKey(seerrTestRequest(3, 300, "carol", "movie", "2025-06-01T00:00:00Z"), "40"),
		// Not available in Plex yet
		seerrTestRequest(4, 400, "dave", "movie", "2026-03-01T00:00:00Z"),
	}

	day := models.WrapperrDay{Data: []models.TautulliEntry{
		// Alice's movie: watched by Bob, Carol and Alice herself
		seerrTestPlay(200, "bob", "movie", 10, "Movie A", "2026-02-05T20:00:00Z", 6000),
		seerrTestPlay(300, "carol", "movie", 10, "Movie A", "2026-02-06T20:00:00Z", 5000),
		seerrTestPlay(100, "alice", "movie", 10, "Movie A", "2026-02-02T20:00:00Z", 6000),
		// Watched before Alice requested it, so it does not count
		seerrTestPlay(400, "dave", "movie", 10, "Movie A", "2026-01-15T20:00:00Z", 6000),
		// Alice's show: two episodes by Bob, one by Dave
		seerrTestPlay(200, "bob", "episode", 20, "Show B", "2026-02-10T20:00:00Z", 1800),
		seerrTestPlay(200, "bob", "episode", 20, "Show B", "2026-02-11T20:00:00Z", 1800),
		seerrTestPlay(400, "dave", "episode", 20, "Show B", "2026-02-12T20:00:00Z", 1800),
		// Bob's movie: watched by Alice
		seerrTestPlay(100, "alice", "movie", 30, "Movie C", "2026-03-05T20:00:00Z", 7000),
		// Carol's old request: watched by Bob
		seerrTestPlay(200, "bob", "movie", 40, "Movie D", "2026-03-05T20:00:00Z", 7000),
	}}

	reach := SeerrRequestReach(requests, users, []models.WrapperrDay{day}, 100, start, end, 10, true, newOtherUserNamer("friendly_name"))

	if reach.Viewers != 3 {
		t.Errorf("expected Alice's requests to reach 3 viewers, got %d", reach.Viewers)
	}
	if reach.TopRequest.Title != "Movie A" || reach.TopRequest.Viewers != 2 {
		t.Errorf("expected Movie A with 2 viewers as top request, got %+v", reach.TopRequest)
	}

	gotFollowers := []string{}
	for _, follower := range reach.Followers {
		gotFollowers = append(gotFollowers, follower.User)
	}
	if !reflect.DeepEqual(gotFollowers, []string{"bob", "carol", "dave"}) {
		t.Errorf("unexpected followers: %v", gotFollowers)
	}
	if reach.Followers[0].TitlesWatched != 2 || reach.Followers[0].Duration != 9600 {
		t.Errorf("unexpected top follower: %+v", reach.Followers[0])
	}

	gotTrendsetters := []string{}
	for _, trendsetter := range reach.Trendsetters {
		gotTrendsetters = append(gotTrendsetters, trendsetter.User)
	}
	if !reflect.DeepEqual(gotTrendsetters, []string{"alice", "Bob"}) {
		t.Errorf("unexpected trendsetters: %v", gotTrendsetters)
	}
	if reach.Trendsetters[1].Viewers != 1 || reach.Trendsetters[1].TopRequest.Title != "Movie C" {
		t.Errorf("unexpected second trendsetter: %+v", reach.Trendsetters[1])
	}
}
