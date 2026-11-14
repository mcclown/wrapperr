package modules

import (
	"log"
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

// Adds the year compared with last year to the reply. config has its wrapped period set for this year. requests
// and users are those the request statistics loaded, nil if none.
func WrapperrCompareStatistics(user_id int, config models.WrapperrConfig, wrapperr_data []models.WrapperrDay, requests []models.SeerrRequest, users []models.WrapperrUser, reply models.WrapperrStatisticsReply) models.WrapperrStatisticsReply {
	compare := &reply.YearCompare
	compare.Error = true
	if !config.WrapperrCustomize.GetYearCompare {
		compare.Message = "The comparison with last year is disabled."
		return reply
	}

	lastYear, err := files.GetLastYearCache()
	if err != nil {
		log.Println("Failed to load last year's cache. Error: " + err.Error())
		compare.Message = "Failed to load last year's plays."
		return reply
	}
	lastConfig := lastYearConfig(config)
	if !lastYearCached(lastYear, lastConfig) {
		compare.Message = "Last year's plays have not all been cached."
		return reply
	}

	compare.Data.User.ThisYear, compare.Data.Server.ThisYear = compareYear(wrapperr_data, config, user_id)
	compare.Data.User.LastYear, compare.Data.Server.LastYear = compareYear(lastYear, lastConfig, user_id)

	// Everyone's split only goes out with the server-wide movie and show statistics it comes from
	compare.Data.ServerCompared = config.WrapperrCustomize.GetYearStatsMovies && config.WrapperrCustomize.GetYearStatsShows
	if !compare.Data.ServerCompared {
		for _, year := range []*models.WrapperrCompareYear{&compare.Data.Server.ThisYear, &compare.Data.Server.LastYear} {
			year.MovieDuration, year.MoviePlays, year.ShowDuration, year.ShowPlays = 0, 0, 0, 0
		}
	}
	compareRequests(user_id, config, lastConfig, wrapperr_data, lastYear, requests, users, &reply)
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
