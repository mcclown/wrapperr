package modules

import (
	"time"

	"github.com/aunefyren/wrapperr/models"
)

// Where to fetch Seerr requests from: last year's start when the comparison with last year needs them too, so
// they are fetched once for both
func seerrRequestsSince(config models.WrapperrConfig, start time.Time) time.Time {
	if config.WrapperrCustomize.GetYearCompare {
		return time.Unix(int64(lastYearConfig(config).WrappedStart), 0)
	}
	return start
}

// Adds requests to the comparison with last year: the titles requested in each year, and how many of them were
// then watched that year. The user's go out with the user's request statistics, everyone's with the server-wide
// ones. Left out when the request statistics loaded no requests.
func compareRequests(user_id int, config models.WrapperrConfig, lastConfig models.WrapperrConfig, wrapperr_data []models.WrapperrDay, lastYear []models.WrapperrDay, requests []models.SeerrRequest, users []models.WrapperrUser, reply *models.WrapperrStatisticsReply) {
	if requests == nil {
		return
	}
	resolver := newRequesterResolver(users)

	data := &reply.YearCompare.Data
	compareRequestYear(requests, resolver, wrapperr_data, config, user_id, &data.User.ThisYear, &data.Server.ThisYear)
	compareRequestYear(requests, resolver, lastYear, lastConfig, user_id, &data.User.LastYear, &data.Server.LastYear)
	for _, side := range []struct {
		years *models.WrapperrCompareYears
		shown bool
	}{{&data.User, config.WrapperrCustomize.GetUserRequestStats}, {&data.Server, config.WrapperrCustomize.GetYearStatsRequests}} {
		if !side.shown {
			for _, year := range []*models.WrapperrCompareYear{&side.years.ThisYear, &side.years.LastYear} {
				year.Requests, year.RequestsWatched = 0, 0
			}
		}
	}
	data.RequestsCompared = true
}

// Counts the titles requested in a wrapped period, and those then watched in it. A play counts for a request as
// on the request cards: of the movie, or of an episode in a requested season (see creditedFor), after it was
// requested. A title requested in both 4K and HD counts once.
func compareRequestYear(requests []models.SeerrRequest, resolver requesterResolver, data []models.WrapperrDay, config models.WrapperrConfig, user_id int, user *models.WrapperrCompareYear, server *models.WrapperrCompareYear) {
	start, end := time.Unix(int64(config.WrappedStart), 0), time.Unix(int64(config.WrappedEnd), 0)

	titles := map[string]bool{}
	userTitles := map[string]bool{}
	requestedKeys := map[int]*seerrRequestedKey{}

	for _, request := range requests {
		if request.CreatedAt.Before(start) || request.CreatedAt.After(end) {
			continue
		}
		requester, ignored := resolver.resolve(request.RequestedBy)
		if ignored {
			continue
		}

		title := requestTitleKey(request)
		titles[title] = true
		if requester.UserID == user_id {
			userTitles[title] = true
		}
		addRequestedKeys(requestedKeys, request, title, requester.UserID)
	}

	watched := map[string]bool{}
	userWatched := map[string]bool{}
	for _, day := range data {
		for _, entry := range day.Data {
			key := entry.RatingKey
			if entry.MediaType == "episode" {
				key = entry.GrandparentRatingKey
			} else if entry.MediaType != "movie" {
				continue
			}
			requested, found := requestedKeys[key]
			if !found || int64(entry.Date) > end.Unix() {
				continue
			}
			for requesterID, requestedAt := range requested.creditedFor(entry) {
				if int64(entry.Date) < requestedAt.Unix() {
					continue
				}
				watched[requested.title] = true
				if requesterID == user_id {
					userWatched[requested.title] = true
				}
			}
		}
	}

	server.Requests, server.RequestsWatched = len(titles), len(watched)
	user.Requests, user.RequestsWatched = len(userTitles), len(userWatched)
}

// Places requesters by how many requests they made in last year's period, as the top requesters are ranked
func lastYearRequesterRanks(requests []models.SeerrRequest, users []models.WrapperrUser, lastConfig models.WrapperrConfig) map[int]int {
	resolver := newRequesterResolver(users)
	start, end := time.Unix(int64(lastConfig.WrappedStart), 0), time.Unix(int64(lastConfig.WrappedEnd), 0)

	counts := map[int]int{}
	for _, request := range requests {
		if request.CreatedAt.Before(start) || request.CreatedAt.After(end) {
			continue
		}
		requester, ignored := resolver.resolve(request.RequestedBy)
		if !ignored {
			counts[requester.UserID]++
		}
	}
	return rankUsers(counts)
}
