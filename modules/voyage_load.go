package modules

import (
	"errors"
	"log"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/analysis"
	"github.com/aunefyren/wrapperr/modules/voyage"
)

// voyages keeps what voyages are built from (the analysis of everyone's plays, the metadata and the events) and
// each account's built voyage, until anything they come from changes. The analysis is read once per change and
// shared (other requests wait while it is read); building one account's voyage from it takes milliseconds.
var voyages = struct {
	sync.Mutex
	fingerprint string
	sea         *voyageSources
	built       map[int]builtVoyage
}{built: map[int]builtVoyage{}}

type voyageSources struct {
	analysis analysis.Analysis
	metadata map[string]models.PlexMetadata
	events   voyage.Events
	inactive map[int]bool
}

type builtVoyage struct {
	document voyage.Document
	images   []voyage.Image
}

// VoyageForUser is an account's voyage document, built from the play cache as it stands (callers refresh it first).
// It returns voyage.ErrNoSessions for an account with nothing played in the period.
func VoyageForUser(userID int, config models.WrapperrConfig) (voyage.Document, error) {
	// The events file is created first, so its stamp is in the fingerprint from the start
	files.GetVoyageEvents(voyage.DefaultEvents)
	voyages.Lock()
	defer voyages.Unlock()
	// Under the lock, so requests can't overwrite each other's newer state with an older fingerprint
	fingerprint, users, err := voyageFingerprint(config)
	if err != nil {
		return voyage.Document{}, err
	}
	if voyages.sea == nil || voyages.fingerprint != fingerprint {
		// Read after the fingerprint: a file changed in between is read as it is now, and seen as changed next time
		events := voyageEvents()
		a, err := LoadAnalysis()
		if err != nil {
			return voyage.Document{}, err
		}
		metadata, err := files.GetMetadata()
		if err != nil {
			log.Println("Failed to read Plex metadata, building voyages without it. Error: " + err.Error())
			metadata = map[string]models.PlexMetadata{}
		}
		inactive := map[int]bool{}
		for _, user := range users {
			if !user.Active {
				inactive[user.UserID] = true
			}
		}
		voyages.sea = &voyageSources{analysis: a, metadata: metadata, events: events, inactive: inactive}
		voyages.fingerprint, voyages.built = fingerprint, map[int]builtVoyage{}
	}
	built, ok := voyages.built[userID]
	if !ok {
		sea := voyages.sea
		document, images, err := voyage.Build(voyage.Input{
			Analysis: sea.analysis,
			UserID:   userID,
			Metadata: func(title analysis.Title) (models.PlexMetadata, analysis.Key, bool) {
				return TitleMetadata(sea.metadata, title)
			},
			Events:    sea.events,
			Inactive:  sea.inactive,
			Generated: time.Now(),
			ImageBase: voyageImageBase(config),
			Images:    config.WrapperrCustomize.EnablePosters,
		})
		if err != nil {
			return voyage.Document{}, err
		}
		built = builtVoyage{document: document, images: images}
		voyages.built[userID] = built
	}
	// Posters and backdrops download in the background; the queue skips those already cached
	if config.WrapperrCustomize.EnablePosters {
		refs := make([]files.PosterReference, 0, len(built.images))
		for _, image := range built.images {
			refs = append(refs, files.PosterReference{ServerHash: image.Server, RatingKey: image.RatingKey, ThumbPath: image.Path, Kind: image.Kind})
		}
		files.EnqueuePosters(refs, config.TautulliConfig, config.WrapperrCustomize.PosterCacheMaxAgeDays)
	}
	return built.document, nil
}

// voyageEvents reads config/voyage_events.json (creating it from the built-in events), or the built-in events
// when it can't be read.
func voyageEvents() voyage.Events {
	raw, err := files.GetVoyageEvents(voyage.DefaultEvents)
	if err != nil {
		log.Println("Failed to read the voyage events, using the built-in ones. Error: " + err.Error())
		raw = voyage.DefaultEvents
	}
	events, err := voyage.ParseEvents(raw)
	if err != nil {
		log.Println("The voyage events file is not valid JSON, using the built-in events. Error: " + err.Error())
		events, _ = voyage.ParseEvents(voyage.DefaultEvents)
	}
	return events
}

// voyageImageBase is the poster route, from the site root
func voyageImageBase(config models.WrapperrConfig) string {
	root := strings.Trim(config.WrapperrRoot, "/")
	if root != "" {
		root = "/" + root
	}
	return root + "/api/get/poster/"
}

// voyageFingerprint changes whenever anything voyages are built from does: the play cache's contents, the Plex
// metadata, the events, the settings, each account's time zone and whether it is ignored or active, and for a
// dynamic period, the day in Wrapperr's time zone. It also returns the users it read.
func voyageFingerprint(config models.WrapperrConfig) (string, []models.WrapperrUser, error) {
	digest, err := files.CacheDigest()
	if err != nil {
		return "", nil, errors.New("Failed to read the play cache.")
	}
	users, err := files.GetUsers()
	if err != nil {
		return "", nil, errors.New("Failed to get users.")
	}
	var people []string
	for _, user := range users {
		people = append(people, strconv.Itoa(user.UserID)+"="+user.Timezone+"/"+strconv.FormatBool(user.Ignore)+"/"+strconv.FormatBool(user.Active))
	}
	sort.Strings(people)
	day := ""
	if config.WrappedDynamic {
		zone, err := time.LoadLocation(config.Timezone)
		if err != nil {
			zone = time.UTC
		}
		day = time.Now().In(zone).Format("2006-01-02")
	}
	return strings.Join([]string{digest, files.VoyageFileStamps(), strings.Join(people, ","), day,
		voyageImageBase(config), strconv.FormatBool(config.WrapperrCustomize.EnablePosters)}, "|"), users, nil
}
