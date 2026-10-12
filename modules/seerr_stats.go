package modules

import (
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
)

// Adds the Seerr request sections to the reply. Seerr failures are reported in
// the request sections only, so the rest of the wrapped results still load.
func WrapperrSeerrStatistics(user_id int, config models.WrapperrConfig, wrapperr_data []models.WrapperrDay, namer *otherUserNamer, wrapperr_reply models.WrapperrStatisticsReply) models.WrapperrStatisticsReply {
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

	topListLimit := config.WrapperrCustomize.StatsTopListLength
	showNumbers := config.WrapperrCustomize.GetYearStatsLeaderboardNumbers

	userRequests, yearRequests = SeerrRequestStatistics(requests, users, user_id, start, end, topListLimit, showNumbers, namer)

	wantFollowers := wantUser && config.WrapperrCustomize.GetUserRequestStatsFollowers
	wantTrendsetters := wantYear && config.WrapperrCustomize.GetYearStatsRequestsTrendsetters
	if wantFollowers || wantTrendsetters {
		reach := SeerrRequestReach(requests, users, wrapperr_data, user_id, start, end, topListLimit, showNumbers, namer)
		if wantFollowers {
			userRequests.Data.Viewers = reach.Viewers
			userRequests.Data.TopRequest = reach.TopRequest
			userRequests.Data.Followers = reach.Followers
		}
		if wantTrendsetters {
			yearRequests.Data.Trendsetters = reach.Trendsetters
		}
	}

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

	resolver := newRequesterResolver(users)
	months := requestMonths(start, end)
	serverTimeline := map[string]int{}
	userTimeline := map[string]int{}
	requesters := map[int]*models.WrapperrRequestUser{}

	for _, request := range requests {
		if request.CreatedAt.Before(start) || request.CreatedAt.After(end) {
			continue
		}

		requester, ignored := resolver.resolve(request.RequestedBy)
		if ignored {
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
		nameOtherUser(&entry, user_id, namer)
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

	userRequests.Data.Followers = []models.WrapperrRequestUser{}
	yearRequests.Data.Trendsetters = []models.WrapperrRequestUser{}

	userRequests.Message = "Requests processed."
	yearRequests.Message = "Requests processed."
	return userRequests, yearRequests
}

type SeerrReach struct {
	// Distinct other users who watched the current user's requests
	Viewers    int
	TopRequest models.WrapperrRequestTitle
	// Other users ranked by how many of the current user's requests they watched
	Followers []models.WrapperrRequestUser
	// Requesters ranked by how many distinct other users watched their requests
	Trendsetters []models.WrapperrRequestUser
}

// Joins the requests created within the wrapped period to the plays within it.
// A play counts towards a request when it is of the requested title (Plex
// rating key of the movie, or of the show for episodes), happened after the
// request, and was by someone other than the requester.
func SeerrRequestReach(requests []models.SeerrRequest, users []models.WrapperrUser, wrapperr_data []models.WrapperrDay, user_id int, start time.Time, end time.Time, topListLimit int, showNumbers bool, namer *otherUserNamer) SeerrReach {
	reach := SeerrReach{Followers: []models.WrapperrRequestUser{}, Trendsetters: []models.WrapperrRequestUser{}}

	resolver := newRequesterResolver(users)

	// Requested titles by rating key, each with its requesters and when they first asked
	requestedTitles := map[int]map[int]time.Time{}
	requesters := map[int]models.WrapperrRequestUser{}

	for _, request := range requests {
		if request.CreatedAt.Before(start) || request.CreatedAt.After(end) {
			continue
		}

		requester, ignored := resolver.resolve(request.RequestedBy)
		if ignored {
			continue
		}
		requesters[requester.UserID] = requester

		for _, ratingKey := range []*string{request.Media.RatingKey, request.Media.RatingKey4k} {
			if ratingKey == nil {
				continue
			}
			key, err := strconv.Atoi(*ratingKey)
			if err != nil || key == 0 {
				continue
			}
			if requestedTitles[key] == nil {
				requestedTitles[key] = map[int]time.Time{}
			}
			if requestedAt, found := requestedTitles[key][requester.UserID]; !found || request.CreatedAt.Before(requestedAt) {
				requestedTitles[key][requester.UserID] = request.CreatedAt
			}
		}
	}

	type titleInfo struct {
		title string
		year  int
	}
	titles := map[int]titleInfo{}

	// requester -> title -> viewer
	titleViewers := map[int]map[int]map[int]bool{}

	type follower struct {
		user     models.WrapperrRequestUser
		titles   map[int]bool
		duration int
	}
	followers := map[int]*follower{}

	for _, day := range wrapperr_data {
		for _, entry := range day.Data {
			key, title, year := entry.RatingKey, entry.Title, entry.Year
			if entry.MediaType == "episode" {
				key, title, year = entry.GrandparentRatingKey, entry.GrandparentTitle, 0
			} else if entry.MediaType != "movie" {
				continue
			}

			titleRequesters, requested := requestedTitles[key]
			if !requested || int64(entry.Date) < start.Unix() || int64(entry.Date) > end.Unix() {
				continue
			}
			if _, found := titles[key]; !found {
				titles[key] = titleInfo{title: title, year: year}
			}

			for requesterID, requestedAt := range titleRequesters {
				if entry.UserID == requesterID || int64(entry.Date) < requestedAt.Unix() {
					continue
				}

				if titleViewers[requesterID] == nil {
					titleViewers[requesterID] = map[int]map[int]bool{}
				}
				if titleViewers[requesterID][key] == nil {
					titleViewers[requesterID][key] = map[int]bool{}
				}
				titleViewers[requesterID][key][entry.UserID] = true

				if requesterID == user_id {
					fan, found := followers[entry.UserID]
					if !found {
						fan = &follower{user: requestUser(entry.UserID, entry.User, entry.FriendlyName), titles: map[int]bool{}}
						followers[entry.UserID] = fan
					}
					fan.titles[key] = true
					fan.duration += entry.Duration
				}
			}
		}
	}

	// Trendsetters, with each requester's most watched title
	trendsetters := []models.WrapperrRequestUser{}
	for requesterID, viewedTitles := range titleViewers {
		viewers := map[int]bool{}
		top := models.WrapperrRequestTitle{}
		for key, titleViewerSet := range viewedTitles {
			for viewer := range titleViewerSet {
				viewers[viewer] = true
			}
			info := titles[key]
			if len(titleViewerSet) > top.Viewers || (len(titleViewerSet) == top.Viewers && info.title < top.Title) {
				top = models.WrapperrRequestTitle{Title: info.title, Year: info.year, Viewers: len(titleViewerSet)}
			}
		}

		entry := requesters[requesterID]
		entry.Viewers = len(viewers)
		entry.TopRequest = top
		trendsetters = append(trendsetters, entry)

		if requesterID == user_id {
			reach.Viewers = entry.Viewers
			reach.TopRequest = top
		}
	}
	sort.Slice(trendsetters, func(i, j int) bool {
		if trendsetters[i].Viewers != trendsetters[j].Viewers {
			return trendsetters[i].Viewers > trendsetters[j].Viewers
		}
		return strings.ToLower(trendsetters[i].FriendlyName) < strings.ToLower(trendsetters[j].FriendlyName)
	})
	for index, entry := range trendsetters {
		if topListLimit != 0 && index >= topListLimit {
			break
		}
		nameOtherUser(&entry, user_id, namer)
		if !showNumbers {
			entry.Viewers, entry.TopRequest.Viewers = 0, 0
		}
		reach.Trendsetters = append(reach.Trendsetters, entry)
	}

	// Followers of the current user
	fans := []models.WrapperrRequestUser{}
	for _, fan := range followers {
		entry := fan.user
		entry.TitlesWatched = len(fan.titles)
		entry.Duration = fan.duration
		fans = append(fans, entry)
	}
	sort.Slice(fans, func(i, j int) bool {
		if fans[i].TitlesWatched != fans[j].TitlesWatched {
			return fans[i].TitlesWatched > fans[j].TitlesWatched
		}
		return fans[i].Duration > fans[j].Duration
	})
	for index, entry := range fans {
		if topListLimit != 0 && index >= topListLimit {
			break
		}
		nameOtherUser(&entry, user_id, namer)
		reach.Followers = append(reach.Followers, entry)
	}

	return reach
}

// Applies the configured naming to anyone who is not the current user
func nameOtherUser(entry *models.WrapperrRequestUser, user_id int, namer *otherUserNamer) {
	if entry.UserID == user_id {
		return
	}
	entry.User, entry.UserID = namer.name(entry.UserID, entry.User, entry.FriendlyName)
	entry.FriendlyName = entry.User
}

// Maps Seerr requesters to Wrapperr users
type requesterResolver struct {
	usersByID    map[int]models.WrapperrUser
	usersByEmail map[string]models.WrapperrUser
	usersByName  map[string]models.WrapperrUser
}

func newRequesterResolver(users []models.WrapperrUser) requesterResolver {
	resolver := requesterResolver{
		usersByID:    map[int]models.WrapperrUser{},
		usersByEmail: map[string]models.WrapperrUser{},
		usersByName:  map[string]models.WrapperrUser{},
	}
	for _, user := range users {
		resolver.usersByID[user.UserID] = user
		if user.Email != "" {
			resolver.usersByEmail[strings.ToLower(user.Email)] = user
		}
		if user.User != "" {
			resolver.usersByName[strings.ToLower(user.User)] = user
		}
	}
	return resolver
}

// Matches by Plex ID, then email, then Plex username. Unmatched requesters get
// a negative ID derived from their Seerr ID, so they never collide with a Plex
// ID. Also reports whether the user is ignored in Wrapperr.
func (resolver requesterResolver) resolve(seerrUser models.SeerrUser) (models.WrapperrRequestUser, bool) {
	plexUsername := ""
	if seerrUser.PlexUsername != nil {
		plexUsername = *seerrUser.PlexUsername
	}

	user, found := models.WrapperrUser{}, false
	if seerrUser.PlexID != nil && *seerrUser.PlexID != 0 {
		user, found = resolver.usersByID[*seerrUser.PlexID]
		if !found {
			// A Plex user Wrapperr has not synced yet, the Plex ID is still the right key
			return requestUser(*seerrUser.PlexID, plexUsername, seerrUser.DisplayName), false
		}
	}
	if !found && seerrUser.Email != "" {
		user, found = resolver.usersByEmail[strings.ToLower(seerrUser.Email)]
	}
	if !found && plexUsername != "" {
		user, found = resolver.usersByName[strings.ToLower(plexUsername)]
	}

	if found {
		return requestUser(user.UserID, user.User, user.FriendlyName), user.Ignore
	}
	return requestUser(-seerrUser.ID, plexUsername, seerrUser.DisplayName), false
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
