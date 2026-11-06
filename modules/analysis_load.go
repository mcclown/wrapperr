package modules

import (
	"errors"
	"log"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/modules/analysis"
)

// LoadAnalysis reads the play cache into the per-account analysis for the configured wrapped period, with each
// account in its own time zone and ignored users left out. It reads only what is cached; WrapperrDownloadDays
// fills the cache.
func LoadAnalysis() (analysis.Analysis, error) {
	config, err := files.GetConfig()
	if err != nil {
		return analysis.Analysis{}, errors.New("Failed to load Wrapperr settings.")
	}
	if config.WrappedDynamic {
		config.WrappedEnd = int(time.Now().Unix())
		config.WrappedStart = int(time.Now().AddDate(0, 0, -config.WrappedDynamicDays).Unix())
	}
	server, err := time.LoadLocation(config.Timezone)
	if err != nil {
		log.Println("Failed to load the Wrapperr time zone, using UTC. Error: " + err.Error())
		server = time.UTC
	}
	cache, err := files.GetCache()
	if err != nil {
		return analysis.Analysis{}, errors.New("Failed to load cache file.")
	}
	ignoredIDs, err := UsersGetIgnoredUserIDs()
	if err != nil {
		return analysis.Analysis{}, err
	}
	ignored := map[int]bool{}
	for _, id := range ignoredIDs {
		ignored[id] = true
	}
	zones, err := UsersTimezones()
	if err != nil {
		return analysis.Analysis{}, err
	}
	return analysis.Analyse(cache, analysis.Options{Start: int64(config.WrappedStart), End: int64(config.WrappedEnd),
		ServerZone: server, Zones: zones, Ignored: ignored}), nil
}
