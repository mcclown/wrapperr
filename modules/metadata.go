package modules

import (
	"bytes"
	"errors"
	"log"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/analysis"
)

// How often cached metadata is fetched again
const (
	// metadataShowRecheck: a show played since it was last fetched is fetched again after this, for new episodes
	metadataShowRecheck = 24 * time.Hour
	// metadataMissingRetry: a key Plex didn't know is tried again after this
	metadataMissingRetry = 30 * 24 * time.Hour
	// metadataSaveEvery: fetched entries are saved in batches, so a long first run isn't lost if it stops
	metadataSaveEvery = 50
)

// metadataPause is the wait between get_metadata calls, so a first run doesn't hammer Tautulli
var metadataPause = 50 * time.Millisecond

// metadataWant is a title to keep metadata for: a movie's rating key, or an episode's show, on one server.
type metadataWant struct {
	server    string
	ratingKey int
}

// metadataWants are the titles in the cached plays, each with its latest play (Unix seconds).
func metadataWants(days []models.WrapperrDay) map[metadataWant]int64 {
	wants := map[metadataWant]int64{}
	for _, day := range days {
		for _, play := range day.Data {
			key := play.RatingKey
			if play.MediaType == "episode" {
				key = play.GrandparentRatingKey
			} else if play.MediaType != "movie" {
				continue
			}
			if key == 0 || play.TautulliServerHash == "" {
				continue
			}
			want := metadataWant{play.TautulliServerHash, key}
			if int64(play.Date) > wants[want] {
				wants[want] = int64(play.Date)
			}
		}
	}
	return wants
}

// metadataStale reports whether a title's metadata should be fetched (again).
func metadataStale(entry models.PlexMetadata, cached bool, lastPlay int64, now time.Time) bool {
	checked := time.Unix(entry.Checked, 0)
	switch {
	case !cached:
		return true
	case entry.Missing:
		return now.Sub(checked) >= metadataMissingRetry
	case entry.MediaType == "show":
		return lastPlay > entry.Checked && now.Sub(checked) >= metadataShowRecheck
	}
	return false
}

// flexNumber reads a number Tautulli sends either as a number or as a string ("2025", "6.1", or "").
type flexNumber float64

func (n *flexNumber) UnmarshalJSON(data []byte) error {
	data = bytes.Trim(data, `"`)
	if len(data) == 0 || string(data) == "null" {
		*n = 0
		return nil
	}
	value, err := strconv.ParseFloat(string(data), 64)
	if err != nil {
		*n = 0
		return nil
	}
	*n = flexNumber(value)
	return nil
}

// tautulliMetadata fetches a title's metadata. It reports found false when Plex doesn't know the key.
func tautulliMetadata(server models.TautulliConfig, ratingKey int, now time.Time) (entry models.PlexMetadata, found bool, err error) {
	var reply struct {
		Response struct {
			Result string `json:"result"`
			Data   struct {
				RatingKey      string     `json:"rating_key"`
				MediaType      string     `json:"media_type"`
				Year           flexNumber `json:"year"`
				AddedAt        flexNumber `json:"added_at"`
				ChildrenCount  flexNumber `json:"children_count"`
				Rating         flexNumber `json:"rating"`
				AudienceRating flexNumber `json:"audience_rating"`
				ContentRating  string     `json:"content_rating"`
				Genres         []string   `json:"genres"`
				Thumb          string     `json:"thumb"`
				Art            string     `json:"art"`
			} `json:"data"`
		} `json:"response"`
	}
	if err := tautulliGet(server, "get_metadata", url.Values{"rating_key": {strconv.Itoa(ratingKey)}}, &reply); err != nil {
		return entry, false, err
	}
	// An error is the server's, not the title's: it is tried again on the next refresh
	if reply.Response.Result != "success" {
		return entry, false, errors.New("Tautulli replied " + strconv.Quote(reply.Response.Result) + " to get_metadata.")
	}
	data := reply.Response.Data
	entry.Checked = now.Unix()
	// An unknown key is a success with no data
	if data.MediaType == "" {
		entry.Missing = true
		return entry, false, nil
	}
	entry.MediaType = data.MediaType
	entry.Year = int(data.Year)
	entry.AddedAt = int64(data.AddedAt)
	if data.MediaType == "show" {
		// For a show, Tautulli's children_count is its episodes (Plex's leaf count), not its seasons
		entry.Episodes = int(data.ChildrenCount)
	}
	entry.Rating = float64(data.Rating)
	entry.AudienceRating = float64(data.AudienceRating)
	entry.ContentRating = data.ContentRating
	entry.Genres = data.Genres
	if entry.Genres == nil {
		entry.Genres = []string{}
	}
	entry.Thumb, entry.Art = data.Thumb, data.Art
	return entry, true, nil
}

// refreshMetadata fetches metadata for the wanted titles that have none in cached, or whose metadata is stale, and
// saves it in batches (to metadata.json, through files.UpdateMetadata). A server that fails is left until the next
// refresh.
func refreshMetadata(wants map[metadataWant]int64, servers []models.TautulliConfig, cached map[string]models.PlexMetadata,
	save func(map[string]models.PlexMetadata) error, now time.Time) (fetched int, err error) {
	byHash := map[string]models.TautulliConfig{}
	for _, server := range servers {
		byHash[files.GetTautulliServerHash(server)] = server
	}

	batch := map[string]models.PlexMetadata{}
	failed := map[string]bool{}
	for want, lastPlay := range wants {
		server, ok := byHash[want.server]
		if !ok || failed[want.server] {
			continue
		}
		key := files.MetadataKey(want.server, want.ratingKey)
		entry, ok := cached[key]
		if !metadataStale(entry, ok, lastPlay, now) {
			continue
		}
		fresh, _, err := tautulliMetadata(server, want.ratingKey, now)
		if err != nil {
			log.Println("Failed to get Plex metadata from Tautulli server " + server.TautulliName + ", skipping it until the next refresh. Error: " + err.Error())
			failed[want.server] = true
			continue
		}
		batch[key] = fresh
		fetched++
		if len(batch) >= metadataSaveEvery {
			if err := save(batch); err != nil {
				return fetched, err
			}
			batch = map[string]models.PlexMetadata{}
		}
		time.Sleep(metadataPause)
	}
	return fetched, save(batch)
}

// metadataRefresh runs one refresh at a time in the background. A refresh asked for while one runs is kept (the
// latest only) and run straight after.
var metadataRefresh struct {
	sync.Mutex
	running bool
	pending bool
	wants   map[metadataWant]int64
	servers []models.TautulliConfig
}

// RefreshMetadataInBackground fetches Plex metadata for the titles in the cached plays that don't have it yet
// (and re-checks shows played since, for new episodes), without holding up the caller.
func RefreshMetadataInBackground(days []models.WrapperrDay, servers []models.TautulliConfig) {
	// Collect the titles now: the caller carries on with days
	wants := metadataWants(days)
	metadataRefresh.Lock()
	defer metadataRefresh.Unlock()
	metadataRefresh.wants, metadataRefresh.servers, metadataRefresh.pending = wants, servers, true
	if metadataRefresh.running {
		return
	}
	metadataRefresh.running = true
	go func() {
		for {
			metadataRefresh.Lock()
			if !metadataRefresh.pending {
				metadataRefresh.running = false
				metadataRefresh.Unlock()
				return
			}
			wants, servers := metadataRefresh.wants, metadataRefresh.servers
			metadataRefresh.pending, metadataRefresh.wants = false, nil
			metadataRefresh.Unlock()

			start := time.Now()
			cached, err := files.GetMetadata()
			fetched := 0
			if err == nil {
				fetched, err = refreshMetadata(wants, servers, cached, files.UpdateMetadata, start)
			}
			if err != nil {
				log.Println("Failed to refresh Plex metadata. Error: " + err.Error())
			} else if fetched > 0 {
				log.Println("Fetched Plex metadata for " + strconv.Itoa(fetched) + " titles in " + time.Since(start).Round(time.Second).String() + ".")
			}
		}
	}()
}

// TitleMetadata is the cached metadata for one of the analysis' titles: that of its newest key Plex still knows.
func TitleMetadata(metadata map[string]models.PlexMetadata, title analysis.Title) (models.PlexMetadata, analysis.Key, bool) {
	for _, key := range title.Keys {
		if entry, ok := metadata[files.MetadataKey(key.Server, key.RatingKey)]; ok && !entry.Missing {
			return entry, key, true
		}
	}
	return models.PlexMetadata{}, analysis.Key{}, false
}
