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

// voyages keeps each account's built voyage until anything it was built from changes, so repeated requests don't
// rebuild it. Builds take the lock in turn, so a burst of requests builds once.
var voyages = struct {
	sync.Mutex
	built map[int]builtVoyage
}{built: map[int]builtVoyage{}}

type builtVoyage struct {
	fingerprint string
	document    voyage.Document
	images      []voyage.Image
}

// VoyageForUser is an account's voyage document, built from the play cache as it stands (callers refresh it first).
// It returns voyage.ErrNoSessions for an account with nothing played in the period.
func VoyageForUser(userID int, config models.WrapperrConfig) (voyage.Document, error) {
	fingerprint, err := voyageFingerprint(config)
	if err != nil {
		return voyage.Document{}, err
	}
	voyages.Lock()
	defer voyages.Unlock()
	built, ok := voyages.built[userID]
	if !ok || built.fingerprint != fingerprint {
		built, err = buildVoyage(userID, config)
		if err != nil {
			return voyage.Document{}, err
		}
		built.fingerprint = fingerprint
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

func buildVoyage(userID int, config models.WrapperrConfig) (builtVoyage, error) {
	a, err := LoadAnalysis()
	if err != nil {
		return builtVoyage{}, err
	}
	metadata, err := files.GetMetadata()
	if err != nil {
		log.Println("Failed to read Plex metadata, building the voyage without it. Error: " + err.Error())
		metadata = map[string]models.PlexMetadata{}
	}
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
	document, images, err := voyage.Build(voyage.Input{
		Analysis: a,
		UserID:   userID,
		Metadata: func(title analysis.Title) (models.PlexMetadata, analysis.Key, bool) {
			return TitleMetadata(metadata, title)
		},
		Events:    events,
		Generated: time.Now(),
		ImageBase: voyageImageBase(config),
		Images:    config.WrapperrCustomize.EnablePosters,
	})
	if err != nil {
		return builtVoyage{}, err
	}
	return builtVoyage{document: document, images: images}, nil
}

// voyageImageBase is the poster route, from the site root
func voyageImageBase(config models.WrapperrConfig) string {
	root := strings.Trim(config.WrapperrRoot, "/")
	if root != "" {
		root = "/" + root
	}
	return root + "/api/get/poster/"
}

// voyageFingerprint changes whenever anything a voyage is built from does: the play cache's contents, the Plex
// metadata, the events, the settings, each account's time zone and whether it is ignored, and for a dynamic
// period, the day.
func voyageFingerprint(config models.WrapperrConfig) (string, error) {
	digest, err := files.CacheDigest()
	if err != nil {
		return "", errors.New("Failed to read the play cache.")
	}
	users, err := files.GetUsers()
	if err != nil {
		return "", errors.New("Failed to get users.")
	}
	var people []string
	for _, user := range users {
		people = append(people, strconv.Itoa(user.UserID)+"="+user.Timezone+"/"+strconv.FormatBool(user.Ignore))
	}
	sort.Strings(people)
	day := ""
	if config.WrappedDynamic {
		day = time.Now().Format("2006-01-02")
	}
	return strings.Join([]string{digest, files.VoyageFileStamps(), strings.Join(people, ","), day,
		voyageImageBase(config), strconv.FormatBool(config.WrapperrCustomize.EnablePosters)}, "|"), nil
}
