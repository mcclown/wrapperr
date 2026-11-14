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

// Adds the year compared with last year to the reply. config has its wrapped period set for this year.
func WrapperrCompareStatistics(user_id int, config models.WrapperrConfig, wrapperr_data []models.WrapperrDay, reply models.WrapperrStatisticsReply) models.WrapperrStatisticsReply {
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
	if len(lastYear) == 0 {
		compare.Message = "Last year's plays have not been cached."
		return reply
	}

	lastConfig := lastYearConfig(config)
	compare.Data.User.ThisYear, compare.Data.Server.ThisYear = compareYear(wrapperr_data, config, user_id)
	compare.Data.User.LastYear, compare.Data.Server.LastYear = compareYear(lastYear, lastConfig, user_id)
	compare.Error = false
	compare.Message = "Comparison with last year processed."
	return reply
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
		// As the movie statistics, skip anything under five minutes
		if entry.Duration < 300 {
			return
		}
		year.MovieDuration += entry.Duration
		year.MoviePlays++
	case "episode":
		year.ShowDuration += entry.Duration
		year.ShowPlays++
	}
}
