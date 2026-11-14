package modules

import (
	"log"
	"strconv"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
)

// Adds requests to the comparison with last year: the titles requested in each year, and how many of them were
// then watched that year, by the user and by everyone. Left out when request statistics are off or Seerr fails.
func compareRequests(user_id int, config models.WrapperrConfig, lastConfig models.WrapperrConfig, wrapperr_data []models.WrapperrDay, lastYear []models.WrapperrDay, reply *models.WrapperrStatisticsReply) {
	if !config.SeerrConfig.SeerrEnabled || (!config.WrapperrCustomize.GetUserRequestStats && !config.WrapperrCustomize.GetYearStatsRequests) {
		return
	}

	requests, err := SeerrGetRequests(config.SeerrConfig, time.Unix(int64(lastConfig.WrappedStart), 0))
	if err != nil {
		log.Println("Failed to retrieve Seerr requests for the comparison with last year. Error: " + err.Error())
		return
	}
	users, err := files.GetUsers()
	if err != nil {
		log.Println("Failed to load users for the comparison with last year. Error: " + err.Error())
		return
	}
	resolver := newRequesterResolver(users)

	data := &reply.YearCompare.Data
	compareRequestYear(requests, resolver, wrapperr_data, config, user_id, &data.User.ThisYear, &data.Server.ThisYear)
	compareRequestYear(requests, resolver, lastYear, lastConfig, user_id, &data.User.LastYear, &data.Server.LastYear)
	data.RequestsCompared = true
}

// Counts the titles requested in a wrapped period, and those then watched in it: a play of the title (the
// movie, or any episode of the show) after it was first requested. A title requested in both 4K and HD counts
// once.
func compareRequestYear(requests []models.SeerrRequest, resolver requesterResolver, data []models.WrapperrDay, config models.WrapperrConfig, user_id int, user *models.WrapperrCompareYear, server *models.WrapperrCompareYear) {
	start, end := time.Unix(int64(config.WrappedStart), 0), time.Unix(int64(config.WrappedEnd), 0)

	// Requested title -> when it was first requested, by anyone and by the user
	firstRequest := map[string]time.Time{}
	userRequest := map[string]time.Time{}
	// Rating key -> requested title
	keyTitles := map[int]string{}

	for _, request := range requests {
		if request.CreatedAt.Before(start) || request.CreatedAt.After(end) {
			continue
		}
		requester, ignored := resolver.resolve(request.RequestedBy)
		if ignored {
			continue
		}

		title := requestTitleKey(request)
		if at, found := firstRequest[title]; !found || request.CreatedAt.Before(at) {
			firstRequest[title] = request.CreatedAt
		}
		if requester.UserID == user_id {
			if at, found := userRequest[title]; !found || request.CreatedAt.Before(at) {
				userRequest[title] = request.CreatedAt
			}
		}
		for _, ratingKey := range []*string{request.Media.RatingKey, request.Media.RatingKey4k} {
			if ratingKey == nil {
				continue
			}
			if key, err := strconv.Atoi(*ratingKey); err == nil && key != 0 {
				keyTitles[key] = title
			}
		}
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
			title, found := keyTitles[key]
			if !found || int64(entry.Date) > end.Unix() {
				continue
			}
			if int64(entry.Date) >= firstRequest[title].Unix() {
				watched[title] = true
			}
			if at, found := userRequest[title]; found && int64(entry.Date) >= at.Unix() {
				userWatched[title] = true
			}
		}
	}

	server.Requests, server.RequestsWatched = len(firstRequest), len(watched)
	user.Requests, user.RequestsWatched = len(userRequest), len(userWatched)
}
