package routes

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/middlewares"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules"
	"github.com/aunefyren/wrapperr/modules/voyage"
	"github.com/aunefyren/wrapperr/utilities"
	"github.com/gin-gonic/gin"
	"github.com/goombaio/namegenerator"
)

// loadVoyageConfig reads the settings a voyage request needs, answering the request itself when it can't go on.
func loadVoyageConfig(context *gin.Context) (models.WrapperrConfig, models.AdminConfig, bool) {
	configBool, err := files.GetConfigState()
	if err != nil {
		log.Println("Failed to retrieve configuration state. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve configuration state."})
		return models.WrapperrConfig{}, models.AdminConfig{}, false
	} else if !configBool {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Wrapperr is not configured."})
		return models.WrapperrConfig{}, models.AdminConfig{}, false
	}
	config, err := files.GetConfig()
	if err != nil {
		log.Println("Failed to load Wrapperr configuration. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load Wrapperr configuration."})
		return models.WrapperrConfig{}, models.AdminConfig{}, false
	}
	adminConfig, err := files.GetAdminConfig()
	if err != nil {
		log.Println("Failed to load Wrapperr admin configuration. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load Wrapperr admin configuration."})
		return models.WrapperrConfig{}, models.AdminConfig{}, false
	}
	return config, adminConfig, true
}

// cacheOn answers the request itself when the cache is off, which the voyage needs.
func cacheOn(context *gin.Context, config models.WrapperrConfig) bool {
	if !config.UseCache {
		context.JSON(http.StatusBadRequest, gin.H{"error": "The voyage needs the cache turned on."})
		return false
	}
	return true
}

// refreshAndSail brings the play cache up to date from Tautulli, as a statistics request does, then answers with
// the account's voyage.
func refreshAndSail(context *gin.Context, user models.WrapperrUser, config models.WrapperrConfig, adminConfig models.AdminConfig) {
	if _, _, err := modules.GetWrapperStatistics(user.User, user.FriendlyName, user.UserID, user.Email, config, adminConfig, true, 0); err != nil {
		log.Println("Failed to refresh the play cache for a voyage. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get statistics."})
		return
	}
	document, err := modules.VoyageForUser(user.UserID, config)
	if errors.Is(err, voyage.ErrNoSessions) {
		context.JSON(http.StatusNotFound, gin.H{"error": "No plays to sail through yet."})
		return
	} else if err != nil {
		log.Println("Failed to build a voyage. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build the voyage."})
		return
	}
	context.JSON(http.StatusOK, document)
}

// voyageOn is whether users are offered the voyage: it is switched on, and it has the Plex logins and the play
// cache it is built from.
func voyageOn(config models.WrapperrConfig) bool {
	return config.VoyageEnabled && config.PlexAuth && config.UseCache
}

// shareVoyage is the voyage a new share link carries, built from the play cache rather than taken from the
// request, so a link can't be made to show a voyage its owner didn't have. It is nil when the owner can't have a
// voyage (an account the admin has made inactive), has no plays yet, or it can't be built: the link then shares
// the classic page alone. Its images' sources go with it, for fetching again while the link lasts.
func shareVoyage(userID int, config models.WrapperrConfig) (json.RawMessage, []models.WrapperrShareLinkImage) {
	if !activeAccount(userID) {
		return nil, nil
	}
	document, refs, err := modules.VoyageToShare(userID, config)
	if errors.Is(err, voyage.ErrNoSessions) {
		return nil, nil
	} else if err != nil {
		log.Println("Failed to build a voyage for a share link. Error: " + err.Error())
		return nil, nil
	}
	// The twin is another account, and a link is for anyone: it is named as the shared log names other users
	if config.WrapperrCustomize.ObfuscateOtherUsers == "obfuscate" {
		document = hideTwin(document, namegenerator.NewNameGenerator(time.Now().UnixNano()).Generate())
	}
	raw, err := json.Marshal(document)
	if err != nil {
		log.Println("Failed to encode a voyage for a share link. Error: " + err.Error())
		return nil, nil
	}
	images := make([]models.WrapperrShareLinkImage, 0, len(refs))
	for _, ref := range refs {
		images = append(images, models.WrapperrShareLinkImage{ServerHash: ref.ServerHash, RatingKey: ref.RatingKey, Path: ref.ThumbPath, Kind: ref.Kind})
	}
	return raw, images
}

// activeAccount is whether a Plex account is one of Wrapperr's users and active (not user 0, Tautulli's "Local").
func activeAccount(userID int) bool {
	user, err := modules.UsersGetUser(userID)
	return err == nil && userID != 0 && user.Active
}

// hideTwin is the document with its viewing twin under a made-up name (generated as "word-word"), as the classic
// page hides other users. The document's slices are shared with the voyage cache, so they are copied, not changed.
func hideTwin(document voyage.Document, generated string) voyage.Document {
	name := generated
	if first, second, ok := strings.Cut(generated, "-"); ok {
		name = strings.Title(first) + " " + strings.Title(second)
	}
	voyages := make([]voyage.Voyage, len(document.Voyages))
	for i, v := range document.Voyages {
		creatures := make([]voyage.Creature, len(v.Creatures))
		copy(creatures, v.Creatures)
		for j := range creatures {
			if creatures[j].Kind == "twin" {
				creatures[j].User = name
			}
		}
		v.Creatures = creatures
		voyages[i] = v
	}
	document.Voyages = voyages
	return document
}

// refetchVoyagePosters queues a shared voyage's posters and backdrops again when it is opened, in case they've
// left the poster cache since the link was made (the queue skips those still cached and downloads in the
// background). They are the link's own, so the voyage isn't rebuilt.
func refetchVoyagePosters(images []models.WrapperrShareLinkImage, config models.WrapperrConfig) {
	if !config.WrapperrCustomize.EnablePosters {
		return
	}
	refs := make([]files.PosterReference, 0, len(images))
	for _, image := range images {
		refs = append(refs, files.PosterReference{ServerHash: image.ServerHash, RatingKey: image.RatingKey, ThumbPath: image.Path, Kind: image.Kind})
	}
	files.EnqueuePosters(refs, config.TautulliConfig, config.WrapperrCustomize.PosterCacheMaxAgeDays)
}

// syncWithTautulli checks every Tautulli server and syncs its users, as a statistics request does.
func syncWithTautulli(context *gin.Context) bool {
	if err := modules.TautulliTestEveryServer(); err != nil {
		log.Println("Failed to test Tautulli server. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to test Tautulli server."})
		return false
	}
	if err := modules.TautulliSyncUsersToWrapperr(); err != nil {
		log.Println("Failed to sync users from Tautulli. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to sync users from Tautulli."})
		return false
	}
	return true
}

// ApiGetVoyage answers a signed-in Plex user with their own voyage (the voyage.v1 document). It needs Plex Auth:
// without it nobody's voyage is served here, so no one can open another's by typing their name.
func ApiGetVoyage(context *gin.Context) {
	config, adminConfig, ok := loadVoyageConfig(context)
	if !ok {
		return
	}
	if !voyageOn(config) {
		if !config.VoyageEnabled {
			context.JSON(http.StatusNotFound, gin.H{"error": "The voyage is not enabled."})
		} else if !config.PlexAuth {
			context.JSON(http.StatusForbidden, gin.H{"error": "The voyage needs Plex Auth."})
		} else {
			cacheOn(context, config)
		}
		return
	}

	// A missing or unknown Authorization header gives an empty session, not an error, so the Plex login is checked
	// here: a session without a Plex token, or a token Plex doesn't know (which reads as user 0, Tautulli's
	// "Local" user), is refused
	payload, _, err := middlewares.AuthGetPayloadFromAuthorization(context.GetHeader("Authorization"), config, adminConfig)
	if err != nil {
		log.Println("Failed to authorize authorization header. Error: " + err.Error())
		context.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authorize request."})
		return
	} else if payload.Admin {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Admin login cannot retrieve a voyage."})
		return
	} else if payload.AuthToken == "" {
		context.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authorize request."})
		return
	}
	plexUser, err := modules.PlexAuthValidateToken(payload.AuthToken, config.ClientKey, config.WrapperrVersion)
	if err != nil || plexUser.ID == 0 {
		log.Println("Could not validate Plex Auth login.")
		context.JSON(http.StatusUnauthorized, gin.H{"error": "Could not validate Plex Auth login."})
		return
	}

	if !syncWithTautulli(context) {
		return
	}
	user, err := modules.UsersGetUser(plexUser.ID)
	if err != nil {
		log.Println("Failed to find Wrapperr user. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find Wrapperr user."})
		return
	}
	if !user.Active {
		context.JSON(http.StatusUnauthorized, gin.H{"error": "User is not active."})
		return
	}
	refreshAndSail(context, user, config, adminConfig)
}

// VoyagePagePolicy is the voyage page's Content Security Policy, in place of the site-wide one: everything from
// Wrapperr itself (three.js and the fonts are bundled), its one inline script (the import map) allowed by its hash,
// and blob: for the textures three.js unpacks from its models.
func VoyagePagePolicy(page string) string {
	script := "'unsafe-inline'"
	defer func() {
		if script == "'unsafe-inline'" {
			log.Println("Warning: the voyage page's import map wasn't found in " + page + ", so its Content Security Policy allows any inline script.")
		}
	}()
	if raw, err := os.ReadFile(page); err == nil {
		// The hash is of the script's text as served, which is one line
		if m := importMap.FindSubmatch(raw); m != nil {
			sum := sha256.Sum256(m[1])
			script = "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
		}
	}
	return "default-src 'self'; script-src 'self' " + script + "; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
		"img-src 'self' data: blob:; connect-src 'self' blob:; media-src 'self'; worker-src 'self' blob:; " +
		"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
}

// importMap is the page's one inline script; its hash is taken at startup, so the page is not edited while running
var importMap = regexp.MustCompile(`<script type="importmap">([^<]+)</script>`)

// ApiVoyageMusic serves the voyage's background music: the file named by the voyage_music setting in
// config/voyage/ (whether or not the voyage is enabled yet, so an admin's preview plays it). None ships with
// Wrapperr, so without one this is a 404 and the voyage sails with its sound effects only.
func ApiVoyageMusic(context *gin.Context) {
	config, err := files.GetConfig()
	if err != nil || config.VoyageMusic == "" {
		context.Status(http.StatusNotFound)
		return
	}
	path, ok := files.VoyageMusicPath(config.VoyageMusic)
	if !ok {
		context.Status(http.StatusNotFound)
		return
	}
	if info, err := os.Stat(path); err != nil || !info.Mode().IsRegular() {
		context.Status(http.StatusNotFound)
		return
	}
	context.Header("Content-Type", files.VoyageMusicType(config.VoyageMusic))
	context.File(path)
}

// ApiGetUserVoyage answers an admin with any user's voyage, whether or not the voyage is enabled for users yet.
func ApiGetUserVoyage(context *gin.Context) {
	config, adminConfig, ok := loadVoyageConfig(context)
	if !ok {
		return
	}
	if !cacheOn(context, config) {
		return
	}
	userID, err := strconv.Atoi(context.Param("userId"))
	if err != nil {
		context.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse user ID."})
		return
	}
	if !syncWithTautulli(context) {
		return
	}
	user, err := modules.UsersGetUser(userID)
	if err != nil {
		log.Println("Failed to get user. Error: " + err.Error())
		context.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get user."})
		return
	}
	if !user.Active {
		context.JSON(http.StatusBadRequest, gin.H{"error": "User is not active."})
		return
	}
	log.Println("Admin retrieved the voyage of user: " + user.User + " (" + strconv.Itoa(user.UserID) + ")." + utilities.GetOriginIPString(context))
	refreshAndSail(context, user, config, adminConfig)
}
