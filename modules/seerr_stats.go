package modules

import (
	"log"
	"sort"
	"strings"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
)

// Adds the Seerr request sections to the reply. Seerr failures are reported in
// the request sections only, so the rest of the wrapped results still load.
func WrapperrSeerrStatistics(user_id int, config models.WrapperrConfig, namer *otherUserNamer, wrapperr_reply models.WrapperrStatisticsReply) models.WrapperrStatisticsReply {
	userRequests := models.WrapperrUserRequests{}
	yearRequests := models.WrapperrYearRequests{}

	wantUser := config.WrapperrCustomize.GetUserRequestStats
	wantYear := config.WrapperrCustomize.GetYearStatsRequests

	setError := func(message string) models.WrapperrStatisticsReply {
		userRequests.Error, userRequests.Message = true, message
		yearRequests.Error, yearRequests.Message = true, message
		wrapperr_reply.User.UserRequests = userRequests
		wrapperr_reply.YearStats.YearRequests = yearRequests
		return wrapperr_reply
	}

	if !config.SeerrConfig.SeerrEnabled {
		return setError("Seerr is not enabled.")
	} else if !wantUser && !wantYear {
		return setError("Request statistics are disabled in the settings.")
	}

	start := time.Unix(int64(config.WrappedStart), 0)
	end := time.Unix(int64(config.WrappedEnd), 0)

	requests, err := SeerrGetRequests(config.SeerrConfig, start)
	if err != nil {
		log.Println("Failed to retrieve Seerr requests. Error: " + err.Error())
		return setError("Failed to retrieve Seerr requests.")
	}

	users, err := files.GetUsers()
	if err != nil {
		log.Println("Failed to load users for Seerr statistics. Error: " + err.Error())
		return setError("Failed to load users.")
	}

	userRequests, yearRequests = SeerrRequestStatistics(requests, users, user_id, start, end, config.WrapperrCustomize.StatsTopListLength, config.WrapperrCustomize.GetYearStatsLeaderboardNumbers, namer)

	if !wantUser {
		userRequests = models.WrapperrUserRequests{Message: "User request statistics are disabled in the settings.", Error: true}
	}
	if !wantYear {
		yearRequests = models.WrapperrYearRequests{Message: "Server-wide request statistics are disabled in the settings.", Error: true}
	}

	wrapperr_reply.User.UserRequests = userRequests
	wrapperr_reply.YearStats.YearRequests = yearRequests
	return wrapperr_reply
}

// Builds per-user and server-wide request statistics from the Seerr requests
// created within the wrapped period. Requesters are matched to Wrapperr users
// by Plex ID, then email, then Plex username. Requesters who cannot be matched
// are still counted under their Seerr name.
func SeerrRequestStatistics(requests []models.SeerrRequest, users []models.WrapperrUser, user_id int, start time.Time, end time.Time, topListLimit int, showNumbers bool, namer *otherUserNamer) (models.WrapperrUserRequests, models.WrapperrYearRequests) {
	userRequests := models.WrapperrUserRequests{}
	yearRequests := models.WrapperrYearRequests{}

	usersByID := map[int]models.WrapperrUser{}
	usersByEmail := map[string]models.WrapperrUser{}
	usersByName := map[string]models.WrapperrUser{}
	for _, user := range users {
		usersByID[user.UserID] = user
		if user.Email != "" {
			usersByEmail[strings.ToLower(user.Email)] = user
		}
		if user.User != "" {
			usersByName[strings.ToLower(user.User)] = user
		}
	}

	months := requestMonths(start, end)
	serverTimeline := map[string]int{}
	userTimeline := map[string]int{}
	requesters := map[int]*models.WrapperrRequestUser{}

	for _, request := range requests {
		if request.CreatedAt.Before(start) || request.CreatedAt.After(end) {
			continue
		}

		requester := resolveRequester(request.RequestedBy, usersByID, usersByEmail, usersByName)
		if user, found := usersByID[requester.UserID]; found && user.Ignore {
			continue
		}

		entry, found := requesters[requester.UserID]
		if !found {
			entry = &requester
			requesters[requester.UserID] = entry
		}

		entry.Requests++
		if request.Media.MediaType == "movie" {
			entry.MovieRequests++
		} else if request.Media.MediaType == "tv" {
			entry.ShowRequests++
		}

		month := request.CreatedAt.In(time.Local).Format("2006-01")
		serverTimeline[month]++
		if requester.UserID == user_id {
			userTimeline[month]++
		}

		yearRequests.Data.RequestCount++
	}

	ranked := []models.WrapperrRequestUser{}
	for _, entry := range requesters {
		ranked = append(ranked, *entry)
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].Requests != ranked[j].Requests {
			return ranked[i].Requests > ranked[j].Requests
		}
		return strings.ToLower(ranked[i].FriendlyName) < strings.ToLower(ranked[j].FriendlyName)
	})

	// Users sharing a request count share a rank (1, 1, 3)
	userRequests.Data.RequesterCount = len(ranked)
	for index, entry := range ranked {
		if entry.UserID != user_id {
			continue
		}
		rank := index + 1
		for rank > 1 && ranked[rank-2].Requests == entry.Requests {
			rank--
		}
		userRequests.Data.RequestRank = rank
		userRequests.Data.RequestCount = entry.Requests
		userRequests.Data.MovieRequestCount = entry.MovieRequests
		userRequests.Data.ShowRequestCount = entry.ShowRequests
	}

	yearRequests.Data.Requesters = []models.WrapperrRequestUser{}
	for index, entry := range ranked {
		if topListLimit != 0 && index >= topListLimit {
			break
		}
		if entry.UserID != user_id {
			entry.User, entry.UserID = namer.name(entry.UserID, entry.User, entry.FriendlyName)
			entry.FriendlyName = entry.User
		}
		if !showNumbers {
			entry.Requests, entry.MovieRequests, entry.ShowRequests = 0, 0, 0
		}
		yearRequests.Data.Requesters = append(yearRequests.Data.Requesters, entry)
	}

	userRequests.Data.Timeline = []models.WrapperrRequestMonth{}
	yearRequests.Data.Timeline = []models.WrapperrRequestMonth{}
	for _, month := range months {
		userRequests.Data.Timeline = append(userRequests.Data.Timeline, models.WrapperrRequestMonth{Month: month, Requests: userTimeline[month]})
		yearRequests.Data.Timeline = append(yearRequests.Data.Timeline, models.WrapperrRequestMonth{Month: month, Requests: serverTimeline[month]})
	}

	userRequests.Message = "Requests processed."
	yearRequests.Message = "Requests processed."
	return userRequests, yearRequests
}

// Maps a Seerr requester to a Wrapperr user. Unmatched requesters get a
// negative ID derived from their Seerr ID, so they never collide with a Plex ID.
func resolveRequester(seerrUser models.SeerrUser, usersByID map[int]models.WrapperrUser, usersByEmail map[string]models.WrapperrUser, usersByName map[string]models.WrapperrUser) models.WrapperrRequestUser {
	plexUsername := ""
	if seerrUser.PlexUsername != nil {
		plexUsername = *seerrUser.PlexUsername
	}

	user, found := models.WrapperrUser{}, false
	if seerrUser.PlexID != nil && *seerrUser.PlexID != 0 {
		user, found = usersByID[*seerrUser.PlexID]
		if !found {
			// A Plex user Wrapperr has not synced yet, the Plex ID is still the right key
			return requestUser(*seerrUser.PlexID, plexUsername, seerrUser.DisplayName)
		}
	}
	if !found && seerrUser.Email != "" {
		user, found = usersByEmail[strings.ToLower(seerrUser.Email)]
	}
	if !found && plexUsername != "" {
		user, found = usersByName[strings.ToLower(plexUsername)]
	}

	if found {
		return requestUser(user.UserID, user.User, user.FriendlyName)
	}
	return requestUser(-seerrUser.ID, plexUsername, seerrUser.DisplayName)
}

func requestUser(userID int, userName string, friendlyName string) models.WrapperrRequestUser {
	if userName == "" {
		userName = friendlyName
	}
	if friendlyName == "" {
		friendlyName = userName
	}
	return models.WrapperrRequestUser{UserID: userID, User: userName, FriendlyName: friendlyName}
}

// Lists every month from start to end as "2006-01", in the configured time zone.
func requestMonths(start time.Time, end time.Time) []string {
	months := []string{}
	current := time.Date(start.In(time.Local).Year(), start.In(time.Local).Month(), 1, 0, 0, 0, 0, time.Local)
	for !current.After(end) {
		months = append(months, current.Format("2006-01"))
		current = current.AddDate(0, 1, 0)
	}
	return months
}
