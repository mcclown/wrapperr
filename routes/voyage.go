package routes

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/middlewares"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules"
	"github.com/aunefyren/wrapperr/modules/voyage"
	"github.com/aunefyren/wrapperr/utilities"
	"github.com/gin-gonic/gin"
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
	if !config.UseCache {
		context.JSON(http.StatusBadRequest, gin.H{"error": "The voyage needs the cache turned on."})
		return models.WrapperrConfig{}, models.AdminConfig{}, false
	}
	return config, adminConfig, true
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
	if !config.VoyageEnabled {
		context.JSON(http.StatusNotFound, gin.H{"error": "The voyage is not enabled."})
		return
	}
	if !config.PlexAuth {
		context.JSON(http.StatusForbidden, gin.H{"error": "The voyage needs Plex Auth."})
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

// ApiGetUserVoyage answers an admin with any user's voyage, whether or not the voyage is enabled for users yet.
func ApiGetUserVoyage(context *gin.Context) {
	config, adminConfig, ok := loadVoyageConfig(context)
	if !ok {
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
