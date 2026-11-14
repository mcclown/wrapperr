package files

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/utilities"
)

var posters_base_path, _ = filepath.Abs("./config/posters")

var (
	serverHashCache   = make(map[string]string)
	serverHashCacheMu sync.RWMutex
)

// GetTautulliServerHash generates a unique hash from Tautulli server config.
// This prevents rating_key collisions between different servers. Results are
// memoized since this is called frequently across the statistics/poster pipeline.
func GetTautulliServerHash(config models.TautulliConfig) string {
	protocol := "http"
	if config.TautulliHttps {
		protocol = "https"
	}
	serverString := fmt.Sprintf("%s://%s:%d%s",
		protocol, config.TautulliIP, config.TautulliPort, config.TautulliRoot)

	serverHashCacheMu.RLock()
	cached, ok := serverHashCache[serverString]
	serverHashCacheMu.RUnlock()
	if ok {
		return cached
	}

	hash := sha256.Sum256([]byte(serverString))
	result := hex.EncodeToString(hash[:])[:16] // Use first 16 chars for brevity

	serverHashCacheMu.Lock()
	serverHashCache[serverString] = result
	serverHashCacheMu.Unlock()

	return result
}

// InitializePosterDirectories creates poster directory structure
// Called on application startup if EnablePosters is true
func InitializePosterDirectories(config models.WrapperrConfig) error {
	// Create base posters directory
	if err := os.MkdirAll(posters_base_path, 0755); err != nil {
		return fmt.Errorf("failed to create posters directory: %w", err)
	}

	// Create subdirectory for each Tautulli server
	for _, tautulliConfig := range config.TautulliConfig {
		serverHash := GetTautulliServerHash(tautulliConfig)
		serverPath := filepath.Join(posters_base_path, serverHash)

		if err := os.MkdirAll(serverPath, 0755); err != nil {
			return fmt.Errorf("failed to create poster directory for server %s: %w",
				tautulliConfig.TautulliName, err)
		}

		log.Printf("[Posters] Initialized directory for server '%s': %s",
			tautulliConfig.TautulliName, serverHash)
	}

	return nil
}

// DownloadPoster downloads a single poster, or a backdrop, from Tautulli's pms_image_proxy endpoint
func DownloadPoster(tautulliConfig models.TautulliConfig, ref PosterReference) (string, error) {
	thumbPath, ratingKey := ref.ThumbPath, ref.RatingKey
	if thumbPath == "" {
		return "", errors.New("empty thumb path")
	}
	width, height := "300", "450"
	if ref.Kind == BackdropKind {
		width, height = "960", "540"
	}

	// Build Tautulli base URL
	urlString, err := utilities.BuildURL(
		tautulliConfig.TautulliPort,
		tautulliConfig.TautulliIP,
		tautulliConfig.TautulliHttps,
		tautulliConfig.TautulliRoot,
	)
	if err != nil {
		return "", fmt.Errorf("failed to build URL: %w", err)
	}

	baseURL, err := url.Parse(urlString)
	if err != nil {
		return "", fmt.Errorf("failed to parse URL: %w", err)
	}

	// Tautulli pms_image_proxy endpoint
	// Reference: https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference#pms_image_proxy
	// Parameters are escaped by net/url so no value can inject additional
	// parameters or alter the request target.
	posterURL := baseURL.JoinPath("api", "v2")
	parameters := url.Values{
		"apikey": {tautulliConfig.TautulliApiKey},
		"cmd":    {"pms_image_proxy"},
		"img":    {thumbPath},
		"width":  {width},
		"height": {height},
	}
	if ref.Kind == BackdropKind {
		// Tautulli sends PNG unless asked, several times the size for a backdrop
		parameters.Set("img_format", "jpg")
	}
	posterURL.RawQuery = parameters.Encode()

	// Create HTTP request
	req, err := http.NewRequest("GET", posterURL.String(), nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	// Execute request with timeout. Redirects are not followed, so the Tautulli
	// host cannot bounce the request (and the API key with it) elsewhere.
	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to download poster: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("received non-200 status: %d", resp.StatusCode)
	}

	// Generate filename and path
	serverHash := GetTautulliServerHash(tautulliConfig)
	filename := PosterFilename(ratingKey, ref.Kind)
	serverDir := filepath.Join(posters_base_path, serverHash)
	posterPath := filepath.Join(serverDir, filename)

	// Ensure directory exists
	if err := os.MkdirAll(serverDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory: %w", err)
	}

	// Write to a temp file first, then atomically rename into place. This prevents
	// the serve endpoint from reading a partially written (torn / 0-byte) image
	// when a download races a request for the same poster.
	tmpFile, err := os.CreateTemp(serverDir, filename+".tmp-*")
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()

	if _, err = io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		return "", fmt.Errorf("failed to save poster: %w", err)
	}

	if err = tmpFile.Close(); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("failed to finalize poster: %w", err)
	}

	if err = os.Rename(tmpPath, posterPath); err != nil {
		os.Remove(tmpPath)
		return "", fmt.Errorf("failed to move poster into place: %w", err)
	}

	log.Printf("[Posters] Downloaded %s for rating_key %d (server: %s)", ref.kindName(), ratingKey, tautulliConfig.TautulliName)
	return posterPath, nil
}

// PosterExists checks if poster (or backdrop) exists and is not expired
func PosterExists(tautulliConfig models.TautulliConfig, ref PosterReference, maxAgeDays int) (bool, string) {
	ratingKey := ref.RatingKey
	serverHash := GetTautulliServerHash(tautulliConfig)
	filename := PosterFilename(ratingKey, ref.Kind)
	posterPath := filepath.Join(posters_base_path, serverHash, filename)

	info, err := os.Stat(posterPath)
	if err != nil {
		return false, ""
	}

	// Check if file is too old
	if maxAgeDays > 0 {
		ageThreshold := time.Now().AddDate(0, 0, -maxAgeDays)
		if info.ModTime().Before(ageThreshold) {
			log.Printf("[Posters] %s expired for rating_key %d (age: %v)", ref.kindName(), ratingKey, time.Since(info.ModTime()))
			return false, posterPath // Exists but expired
		}
	}

	return true, posterPath
}

// addPosterRef adds a single poster reference to the dedup map if all required
// fields are present.
func addPosterRef(posterMap map[string]PosterReference, hash string, ratingKey int, thumb string) {
	if thumb == "" || ratingKey == 0 || hash == "" {
		return
	}
	key := fmt.Sprintf("%s_%d", hash, ratingKey)
	posterMap[key] = PosterReference{
		ServerHash: hash,
		RatingKey:  ratingKey,
		ThumbPath:  thumb,
	}
}

// addEntriesToPosterMap adds all valid entries in a slice to the dedup map.
func addEntriesToPosterMap(posterMap map[string]PosterReference, entries []models.TautulliEntry) {
	for _, entry := range entries {
		addPosterRef(posterMap, entry.TautulliServerHash, entry.RatingKey, entry.Thumb)
	}
}

// CleanExpiredPosters removes posters older than maxAgeDays
// Can be called manually via admin endpoint
func CleanExpiredPosters(maxAgeDays int) error {
	if maxAgeDays <= 0 {
		return nil
	}

	ageThreshold := time.Now().AddDate(0, 0, -maxAgeDays)
	removedCount := 0

	err := filepath.Walk(posters_base_path, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() && strings.HasSuffix(info.Name(), ".jpg") {
			if info.ModTime().Before(ageThreshold) {
				log.Printf("[Posters] Removing expired poster: %s", path)
				if err := os.Remove(path); err != nil {
					return err
				}
				removedCount++
			}
		}

		return nil
	})

	if err != nil {
		return fmt.Errorf("failed to clean posters: %w", err)
	}

	log.Printf("[Posters] Cleanup complete: removed %d expired posters", removedCount)
	return nil
}

// GetPosterPath returns the absolute path to a poster file
// Used by the API endpoint to serve posters
func GetPosterPath(serverHash string, filename string) (string, error) {
	// Defense in depth: reduce each user-provided segment to its final path
	// element, discarding any directory or traversal components before joining.
	serverHash = filepath.Base(serverHash)
	filename = filepath.Base(filename)

	posterPath := filepath.Join(posters_base_path, serverHash, filename)

	// Security check - ensure path is within posters directory
	absPath, err := filepath.Abs(posterPath)
	if err != nil {
		return "", err
	}

	absBase, err := filepath.Abs(posters_base_path)
	if err != nil {
		return "", err
	}

	// Ensure the resolved path is strictly inside the posters directory.
	// Compare against the base with a trailing separator so a sibling like
	// "<base>-evil" cannot satisfy a naive prefix check.
	if absPath != absBase && !strings.HasPrefix(absPath, absBase+string(os.PathSeparator)) {
		return "", errors.New("invalid path: potential path traversal")
	}

	return absPath, nil
}

// PosterReference holds information needed to download a poster
type PosterReference struct {
	ServerHash string
	RatingKey  int
	ThumbPath  string // the image's Plex path: a thumb, or a backdrop's art
	Kind       string // "" for a poster, BackdropKind for a backdrop
}

// BackdropKind marks a PosterReference for a title's backdrop (its Plex art, 960x540), cached as <key>-art.jpg
// next to its poster. Backdrops are queued only by Wrapperr itself, from the art paths in cached Plex metadata (the
// voyage queues them for the titles it shows); the poster download route never takes a kind.
const BackdropKind = "art"

// validImagePath is the form of a poster's (thumb) or backdrop's (art) Plex path. Checking it keeps the poster
// download from being used to make Tautulli fetch anything else with Wrapperr's API key.
var validImagePath = map[string]*regexp.Regexp{
	"":           regexp.MustCompile(`^/library/metadata/\d+/thumb(/\d+)?$`),
	BackdropKind: regexp.MustCompile(`^/library/metadata/\d+/art(/\d+)?$`),
}

// ValidImagePath reports whether path is a Plex image path of the given kind.
func ValidImagePath(path string, kind string) bool {
	pattern, ok := validImagePath[kind]
	return ok && pattern.MatchString(path)
}

// PosterFilename is the cached file name of a title's poster or backdrop.
func PosterFilename(ratingKey int, kind string) string {
	if kind == BackdropKind {
		return fmt.Sprintf("%d-art.jpg", ratingKey)
	}
	return fmt.Sprintf("%d.jpg", ratingKey)
}

func (ref PosterReference) kindName() string {
	if ref.Kind == BackdropKind {
		return "backdrop"
	}
	return "poster"
}

// queueKey identifies a download in the queue
func (ref PosterReference) queueKey() string {
	return fmt.Sprintf("%s_%d_%s", ref.ServerHash, ref.RatingKey, ref.Kind)
}

// ExtractUserPosterReferences extracts all unique poster references from the
// user-specific portion of the statistics (top lists + special cards).
func ExtractUserPosterReferences(reply models.WrapperrStatisticsReply) []PosterReference {
	posterMap := make(map[string]PosterReference) // Use map to deduplicate

	// User movie and show top lists
	addEntriesToPosterMap(posterMap, reply.User.UserMovies.Data.MoviesDuration)
	addEntriesToPosterMap(posterMap, reply.User.UserMovies.Data.MoviesPlays)
	addEntriesToPosterMap(posterMap, reply.User.UserShows.Data.ShowsDuration)
	addEntriesToPosterMap(posterMap, reply.User.UserShows.Data.ShowsPlays)

	// Special cards
	oldest := reply.User.UserMovies.Data.UserMovieOldest
	addPosterRef(posterMap, oldest.TautulliServerHash, oldest.RatingKey, oldest.Thumb)

	paused := reply.User.UserMovies.Data.UserMovieMostPaused
	addPosterRef(posterMap, paused.TautulliServerHash, paused.RatingKey, paused.Thumb)

	longest := reply.User.UserShows.Data.EpisodeDurationLongest
	addPosterRef(posterMap, longest.TautulliServerHash, longest.RatingKey, longest.Thumb)

	// Note: Show Buddy uses ShowsDuration[0] which is already extracted above

	// Requested titles
	topRequest := reply.User.UserRequests.Data.TopRequest
	addPosterRef(posterMap, topRequest.TautulliServerHash, topRequest.RatingKey, topRequest.Thumb)
	addRequestUsersToPosterMap(posterMap, reply.User.UserRequests.Data.FollowingTitles)
	addRequestUsersToPosterMap(posterMap, reply.User.UserRequests.Data.FollowingPercent)

	return posterMapToSlice(posterMap)
}

// addRequestUsersToPosterMap adds the top request of each user in a request list.
func addRequestUsersToPosterMap(posterMap map[string]PosterReference, users []models.WrapperrRequestUser) {
	for _, user := range users {
		addPosterRef(posterMap, user.TopRequest.TautulliServerHash, user.TopRequest.RatingKey, user.TopRequest.Thumb)
	}
}

// ExtractYearPosterReferences extracts unique poster references from the
// server-wide ("year") top lists shared across all users.
func ExtractYearPosterReferences(reply models.WrapperrStatisticsReply) []PosterReference {
	posterMap := make(map[string]PosterReference)

	addEntriesToPosterMap(posterMap, reply.YearStats.YearMovies.Data.MoviesDuration)
	addEntriesToPosterMap(posterMap, reply.YearStats.YearMovies.Data.MoviesPlays)
	addEntriesToPosterMap(posterMap, reply.YearStats.YearShows.Data.ShowsDuration)
	addEntriesToPosterMap(posterMap, reply.YearStats.YearShows.Data.ShowsPlays)
	addRequestUsersToPosterMap(posterMap, reply.YearStats.YearRequests.Data.TrendsettersTitles)
	addRequestUsersToPosterMap(posterMap, reply.YearStats.YearRequests.Data.TrendsettersPercent)
	addEntriesToPosterMap(posterMap, reply.YearStats.YearMovies.Data.MoviesViewers)
	addEntriesToPosterMap(posterMap, reply.YearStats.YearShows.Data.ShowsViewers)
	addRequestUsersToPosterMap(posterMap, reply.YearStats.YearRequests.Data.TrendsettersViewers)

	return posterMapToSlice(posterMap)
}

// posterMapToSlice flattens a dedup map into a slice.
func posterMapToSlice(posterMap map[string]PosterReference) []PosterReference {
	posters := make([]PosterReference, 0, len(posterMap))
	for _, ref := range posterMap {
		posters = append(posters, ref)
	}
	return posters
}

// ClearPosterCache removes all cached posters by deleting the entire posters directory
func ClearPosterCache() error {
	log.Println("[Posters] Starting poster cache clearing...")

	// Check if directory exists
	if _, err := os.Stat(posters_base_path); os.IsNotExist(err) {
		log.Println("[Posters] Poster cache directory does not exist, nothing to clear")
		return nil
	}

	// Remove all contents
	err := os.RemoveAll(posters_base_path)
	if err != nil {
		return fmt.Errorf("failed to clear poster cache: %w", err)
	}

	// Recreate the base directory
	err = os.MkdirAll(posters_base_path, 0755)
	if err != nil {
		return fmt.Errorf("failed to recreate poster cache directory: %w", err)
	}

	log.Println("[Posters] Poster cache cleared successfully")
	return nil
}

// Bounded, app-lifetime background download queue. Poster downloads are fire-and-forget:
// callers enqueue references and return immediately, while a fixed number of workers
// perform the actual downloads. In-flight keys are deduplicated so the same poster is
// never downloaded concurrently, and a full queue drops work rather than growing
// unbounded (it will simply be re-requested on a later page load).
const (
	posterQueueWorkers = 3
	posterQueueBuffer  = 2048
)

type posterJob struct {
	config     models.TautulliConfig
	ref        PosterReference
	maxAgeDays int
}

var (
	posterQueue      chan posterJob
	posterQueueOnce  sync.Once
	posterInflight   = make(map[string]struct{})
	posterInflightMu sync.Mutex
)

// startPosterQueue lazily initializes the worker pool on first use.
func startPosterQueue() {
	posterQueueOnce.Do(func() {
		posterQueue = make(chan posterJob, posterQueueBuffer)
		for w := 0; w < posterQueueWorkers; w++ {
			go posterQueueWorker()
		}
	})
}

func posterQueueWorker() {
	for job := range posterQueue {
		key := job.ref.queueKey()

		exists, _ := PosterExists(job.config, job.ref, job.maxAgeDays)
		if !exists {
			if _, err := DownloadPoster(job.config, job.ref); err != nil {
				log.Printf("[Posters] Failed to download %s for rating_key %d: %v", job.ref.kindName(), job.ref.RatingKey, err)
			} else {
				// Light rate limiting between actual downloads to avoid hammering Tautulli.
				time.Sleep(100 * time.Millisecond)
			}
		}

		posterInflightMu.Lock()
		delete(posterInflight, key)
		posterInflightMu.Unlock()
	}
}

// EnqueuePoster schedules a single poster download. Non-blocking: it returns
// immediately and silently skips posters already cached, already queued, or when
// the queue is full.
func EnqueuePoster(config models.TautulliConfig, ref PosterReference, maxAgeDays int) {
	if ref.ServerHash == "" || ref.RatingKey == 0 || ref.ThumbPath == "" {
		return
	}
	if !ValidImagePath(ref.ThumbPath, ref.Kind) {
		log.Printf("[Posters] Skipped %s with an unexpected path for rating_key %d", ref.kindName(), ref.RatingKey)
		return
	}

	startPosterQueue()

	key := ref.queueKey()

	posterInflightMu.Lock()
	if _, busy := posterInflight[key]; busy {
		posterInflightMu.Unlock()
		return
	}
	posterInflight[key] = struct{}{}
	posterInflightMu.Unlock()

	select {
	case posterQueue <- posterJob{config: config, ref: ref, maxAgeDays: maxAgeDays}:
	default:
		// Queue is full - drop the job and clear the in-flight marker so it can
		// be retried on a future request.
		posterInflightMu.Lock()
		delete(posterInflight, key)
		posterInflightMu.Unlock()
		log.Printf("[Posters] Queue full, dropped %s job for rating_key %d", ref.kindName(), ref.RatingKey)
	}
}

// EnqueuePosters schedules downloads for a batch of references, resolving each to
// its Tautulli server config. Non-blocking.
func EnqueuePosters(posterRefs []PosterReference, tautulliConfigs []models.TautulliConfig, maxAgeDays int) {
	if len(posterRefs) == 0 {
		return
	}

	serverConfigMap := make(map[string]models.TautulliConfig)
	for _, config := range tautulliConfigs {
		serverConfigMap[GetTautulliServerHash(config)] = config
	}

	for _, ref := range posterRefs {
		config, found := serverConfigMap[ref.ServerHash]
		if !found {
			log.Printf("[Posters] Warning: Could not find Tautulli config for hash %s", ref.ServerHash)
			continue
		}
		EnqueuePoster(config, ref, maxAgeDays)
	}
}
