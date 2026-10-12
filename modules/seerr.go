package modules

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/utilities"
)

// Number of requests asked for per page when paging through Seerr requests
const seerrPageSize = 100

// Upper bound on pages fetched, so a misbehaving server cannot keep us looping
const seerrMaxPages = 1000

// Client used for all Seerr API calls. Redirects are not followed, so a Seerr
// host cannot bounce the request (and the API key header that goes with it) on
// to a server the administrator did not configure.
var seerrClient = &http.Client{
	Timeout: 30 * time.Second,
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// Builds the URL for a Seerr API endpoint below /api/v1. Query parameters are
// escaped by net/url rather than concatenated.
func buildSeerrAPIURL(seerrConfig models.SeerrConfig, endpoint string, parameters url.Values) (string, error) {
	baseURLString, err := utilities.BuildURL(seerrConfig.SeerrPort, seerrConfig.SeerrIP, seerrConfig.SeerrHttps, seerrConfig.SeerrRoot)
	if err != nil {
		return "", err
	}

	baseURL, err := url.Parse(baseURLString)
	if err != nil {
		return "", errors.New("Failed to parse Seerr connection URL.")
	}

	apiURL := baseURL.JoinPath("api", "v1", endpoint)
	if parameters != nil {
		apiURL.RawQuery = parameters.Encode()
	}

	return apiURL.String(), nil
}

// Performs an authenticated GET against the Seerr API and returns the body.
func seerrGet(seerrConfig models.SeerrConfig, endpoint string, parameters url.Values) ([]byte, error) {
	urlString, err := buildSeerrAPIURL(seerrConfig, endpoint, parameters)
	if err != nil {
		log.Println("Failed to build Seerr connection URL. Error: " + err.Error())
		return nil, errors.New("Failed to build Seerr connection URL.")
	}

	req, err := http.NewRequest("GET", urlString, nil)
	if err != nil {
		log.Println("Failed to create Seerr request. Error: " + err.Error())
		return nil, errors.New("Failed to create Seerr request.")
	}

	req.Header.Add("Accept", "application/json")
	req.Header.Add("X-Api-Key", seerrConfig.SeerrApiKey)

	res, err := seerrClient.Do(req)
	if err != nil {
		errString := strings.Replace(err.Error(), seerrConfig.SeerrApiKey, "REDACTED", -1)
		log.Println("Failed to reach Seerr server. Error: " + errString)
		return nil, errors.New("Failed to reach Seerr server. Error: " + errString)
	}

	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		log.Println("Failed to read Seerr server response. Error: " + err.Error())
		return nil, errors.New("Failed to read Seerr response.")
	} else if res.StatusCode != 200 {
		// Do not reflect the upstream response body back to the caller
		log.Println("Seerr server responded with status code: " + strconv.Itoa(res.StatusCode))
		return nil, errors.New("Seerr server responded with status code " + strconv.Itoa(res.StatusCode) + ".")
	}

	return body, nil
}

// Verifies that Seerr can be reached and that the API key is accepted.
func SeerrTestConnection(seerrConfig models.SeerrConfig) (bool, error) {
	body, err := seerrGet(seerrConfig, "auth/me", nil)
	if err != nil {
		return false, err
	}

	var user models.SeerrUser
	if err := json.Unmarshal(body, &user); err != nil {
		log.Println("Failed to parse Seerr response. Error: " + err.Error())
		return false, errors.New("Failed to parse Seerr response.")
	}

	return user.ID != 0, nil
}

// Retrieves every request created at or after the given start time, newest first.
func SeerrGetRequests(seerrConfig models.SeerrConfig, start time.Time) ([]models.SeerrRequest, error) {
	requests := []models.SeerrRequest{}

	for page := 0; page < seerrMaxPages; page++ {
		parameters := url.Values{
			"take":          {strconv.Itoa(seerrPageSize)},
			"skip":          {strconv.Itoa(page * seerrPageSize)},
			"filter":        {"all"},
			"sort":          {"added"},
			"sortDirection": {"desc"},
		}

		body, err := seerrGet(seerrConfig, "request", parameters)
		if err != nil {
			return nil, err
		}

		var reply models.SeerrRequestReply
		if err := json.Unmarshal(body, &reply); err != nil {
			log.Println("Failed to parse Seerr requests. Error: " + err.Error())
			return nil, errors.New("Failed to parse Seerr requests.")
		}

		reachedStart := false
		for _, request := range reply.Results {
			if request.CreatedAt.Before(start) {
				reachedStart = true
				break
			}
			requests = append(requests, request)
		}

		if reachedStart || len(reply.Results) < seerrPageSize || (page+1)*seerrPageSize >= reply.PageInfo.Results {
			return requests, nil
		}
	}

	log.Println("Stopped paging Seerr requests after " + strconv.Itoa(seerrMaxPages) + " pages.")
	return requests, nil
}
