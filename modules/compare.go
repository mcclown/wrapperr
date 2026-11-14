package modules

import (
	"log"
	"sort"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
)

// The comparison with last year: how this year's viewing split between movies and TV against last year's, for
// the user and for the whole server. Last year's plays have their own cache, downloaded once from the admin
// caching page.

// Moves the wrapped period of a dynamic wrapped period to end now, as the statistics do
func currentWrappedPeriod(config models.WrapperrConfig) models.WrapperrConfig {
	if config.WrappedDynamic {
		config.WrappedEnd = int(time.Now().Unix())
		config.WrappedStart = int(time.Now().AddDate(0, 0, -config.WrappedDynamicDays).Unix())
	}
	return config
}

// The config with its wrapped period moved back a year
func lastYearConfig(config models.WrapperrConfig) models.WrapperrConfig {
	config.WrappedStart = int(time.Unix(int64(config.WrappedStart), 0).AddDate(-1, 0, 0).Unix())
	config.WrappedEnd = int(time.Unix(int64(config.WrappedEnd), 0).AddDate(-1, 0, 0).Unix())
	return config
}

// Downloads up to cacheLimit days of last year's plays into their cache, and says whether every day is in
func CacheLastYear(config models.WrapperrConfig, cacheLimit int) (bool, error) {
	lastYear, err := files.GetLastYearCache()
	if err != nil {
		return false, err
	}

	lastYear, complete, err := WrapperrDownloadDays(0, lastYear, cacheLimit, lastYearConfig(currentWrappedPeriod(config)))
	if err != nil {
		return false, err
	}

	return complete, files.SaveLastYearCache(&lastYear)
}

// Last year's plays, for the comparison with last year: nil, with why, when the comparison is off or not every
// day of last year is cached. config has its wrapped period set for this year.
func LastYearPlays(config models.WrapperrConfig) ([]models.WrapperrDay, string) {
	if !config.WrapperrCustomize.GetYearCompare {
		return nil, "The comparison with last year is disabled."
	}

	lastYear, err := files.GetLastYearCache()
	if err != nil {
		log.Println("Failed to load last year's cache. Error: " + err.Error())
		return nil, "Failed to load last year's plays."
	}
	if !lastYearCached(lastYear, lastYearConfig(config)) {
		return nil, "Last year's plays have not all been cached."
	}
	return lastYear, ""
}

// Adds the year compared with last year to the reply. lastYear and lastYearMessage are from LastYearPlays.
func WrapperrCompareStatistics(user_id int, config models.WrapperrConfig, wrapperr_data []models.WrapperrDay, lastYear []models.WrapperrDay, lastYearMessage string, reply models.WrapperrStatisticsReply) models.WrapperrStatisticsReply {
	compare := &reply.YearCompare
	compare.Error = true
	if lastYear == nil {
		compare.Message = lastYearMessage
		return reply
	}
	lastConfig := lastYearConfig(config)

	compare.Data.User.ThisYear, compare.Data.Server.ThisYear = compareYear(wrapperr_data, config, user_id)
	compare.Data.User.LastYear, compare.Data.Server.LastYear = compareYear(lastYear, lastConfig, user_id)

	// Everyone's split only goes out with the server-wide movie and show statistics it comes from
	compare.Data.ServerCompared = config.WrapperrCustomize.GetYearStatsMovies && config.WrapperrCustomize.GetYearStatsShows
	if !compare.Data.ServerCompared {
		for _, year := range []*models.WrapperrCompareYear{&compare.Data.Server.ThisYear, &compare.Data.Server.LastYear} {
			year.MovieDuration, year.MoviePlays, year.ShowDuration, year.ShowPlays = 0, 0, 0, 0
		}
	}
	compare.Error = false
	compare.Message = "Comparison with last year processed."
	return reply
}

// Whether every day of last year's period is in its cache, finished, from every Tautulli server. A download
// stopped part way, or a wrapped period that has moved since (a dynamic one moves every day), leaves it short.
func lastYearCached(lastYear []models.WrapperrDay, lastConfig models.WrapperrConfig) bool {
	days := map[string]models.WrapperrDay{}
	for _, day := range lastYear {
		days[day.Date] = day
	}

	end := time.Unix(int64(lastConfig.WrappedEnd), 0)
	for loop_time := time.Unix(int64(lastConfig.WrappedStart), 0); !loop_time.After(end); loop_time = loop_time.AddDate(0, 0, 1) {
		day, found := days[loop_time.Format("2006-01-02")]
		if !found || !day.DataComplete {
			return false
		}
		for _, server := range lastConfig.TautulliConfig {
			processed := false
			for _, name := range day.TautulliServers {
				processed = processed || name == server.TautulliName
			}
			if !processed {
				return false
			}
		}
	}
	return true
}

// Totals the movies and TV played in a wrapped period, by the user and by everyone
func compareYear(data []models.WrapperrDay, config models.WrapperrConfig, user_id int) (user models.WrapperrCompareYear, server models.WrapperrCompareYear) {
	start, end := config.WrappedStart, config.WrappedEnd
	// The year most of the period falls in, so a period starting just before midnight on New Year's Eve in
	// another time zone still reads as the year it covers
	year := time.Unix(int64(start+(end-start)/2), 0).UTC().Year()
	user.Year, server.Year = year, year

	for _, day := range data {
		for _, entry := range day.Data {
			if entry.Date < start || entry.Date > end {
				continue
			}
			addComparePlay(&server, entry)
			if entry.UserID == user_id {
				addComparePlay(&user, entry)
			}
		}
	}
	return user, server
}

func addComparePlay(year *models.WrapperrCompareYear, entry models.TautulliEntry) {
	switch entry.MediaType {
	case "movie":
		// As the movie statistics, skip anything under five minutes or without a real year
		if entry.Year < 1750 || entry.Duration < 300 {
			return
		}
		year.MovieDuration += entry.Duration
		year.MoviePlays++
	case "episode":
		year.ShowDuration += entry.Duration
		year.ShowPlays++
	}
}

// Each user's place on last year's leaderboard, by time and by plays
type leaderboardRanks struct {
	duration map[int]int
	plays    map[int]int
}

// Ranks last year's leaderboard as the leaderboard is: from the plays the server-wide movie, show and music
// statistics count. nil without last year's plays or the leaderboard.
func lastYearLeaderboard(config models.WrapperrConfig, lastYear []models.WrapperrDay) *leaderboardRanks {
	customize := config.WrapperrCustomize
	if lastYear == nil || !customize.GetYearStatsLeaderboard {
		return nil
	}
	lastConfig := lastYearConfig(config)

	duration, plays := map[int]int{}, map[int]int{}
	for _, day := range lastYear {
		for _, entry := range day.Data {
			if entry.Date < lastConfig.WrappedStart || entry.Date > lastConfig.WrappedEnd {
				continue
			}
			counted := false
			switch entry.MediaType {
			case "movie":
				counted = customize.GetYearStatsMovies && entry.Year >= 1750 && entry.Duration >= 300
			case "episode":
				counted = customize.GetYearStatsShows
			case "track":
				counted = customize.GetYearStatsMusic
			}
			if counted {
				duration[entry.UserID] += entry.Duration
				plays[entry.UserID]++
			}
		}
	}
	return &leaderboardRanks{duration: rankUsers(duration), plays: rankUsers(plays)}
}

// Places users by a total, highest first; users with the same total share a place (1, 1, 3)
func rankUsers(totals map[int]int) map[int]int {
	users := []int{}
	for userID := range totals {
		users = append(users, userID)
	}
	sort.Slice(users, func(i, j int) bool { return totals[users[i]] > totals[users[j]] })

	ranks := map[int]int{}
	for index, userID := range users {
		ranks[userID] = index + 1
		if index > 0 && totals[users[index-1]] == totals[userID] {
			ranks[userID] = ranks[users[index-1]]
		}
	}
	return ranks
}

// Gives a ranked leaderboard list its places this year, ties shared as last year's are, so a tie is not a move;
// value is what the list is ranked by
func (ranks *leaderboardRanks) place(list []models.WrapperrYearUserEntry, value func(int) int) {
	if ranks == nil {
		return
	}
	for index := range list {
		place := sharedPlace(index, value)
		list[index].Rank = &place
	}
}

// The place of the entry at index in a list ranked by value, highest first, shared with those tied (1, 1, 3)
func sharedPlace(index int, value func(int) int) int {
	place := index + 1
	for place > 1 && value(place-2) == value(index) {
		place--
	}
	return place
}

// Gives a leaderboard entry its places last year, 0 for someone not on it
func (ranks *leaderboardRanks) set(entry *models.WrapperrYearUserEntry) {
	if ranks == nil {
		return
	}
	byDuration, byPlays := ranks.duration[entry.UserID], ranks.plays[entry.UserID]
	entry.LastRankDuration, entry.LastRankPlays = &byDuration, &byPlays
}
