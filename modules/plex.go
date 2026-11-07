package modules

import (
	"encoding/json"
	"errors"
	"io/ioutil"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/aunefyren/wrapperr/models"
)

var content_type string = "application/json"
var x_plex_product string = "Wrapperr"
var strong bool = true
var x_plex_model string = "Plex OAuth"
var x_plex_language string = "en"

func GetPin(ClientKey string, WrapperrVersion string) (*models.PlexGetPinReply, error) {

	url_string := "https://plex.tv/api/v2/pins"

	params := url.Values{}
	params.Add("strong", strconv.FormatBool(strong))
	params.Add("X-Plex-Product", x_plex_product)
	params.Add("X-Plex-Client-Identifier", ClientKey)
	params.Add("X-Plex-Version", WrapperrVersion)
	params.Add("X-Plex-Model", x_plex_model)
	params.Add("X-Plex-Language", x_plex_language)

	payload := strings.NewReader(params.Encode())

	req, err := http.NewRequest("POST", url_string, payload)
	if err != nil {
		return nil, err
	}

	req.Header.Add("Accept", content_type)
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}

	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)
	var body_reply models.PlexGetPinReply
	json.Unmarshal(body, &body_reply)
	if err != nil {
		return nil, err
	}

	return &body_reply, nil
}

func GetLoginURLString(client_id string, code string, home_url string) string {

	base := "https://app.plex.tv/auth#?"
	forwardUrl := home_url + "?close_me=true"

	return base + "clientID=" + url.QueryEscape(client_id) + "&code=" + url.QueryEscape(code) + "&context%5Bdevice%5D%5Bproduct%5D=" + url.QueryEscape(x_plex_product) + "&forwardUrl=" + url.QueryEscape(forwardUrl)

}

func GetPlexAuthLogin(ID int, Code string, WrapperrVersion string, ClientKey string) (*models.PlexGetPinReply, error) {

	url_string := "https://plex.tv/api/v2/pins/" + strconv.Itoa(ID)

	params := url.Values{}
	params.Add("X-Plex-Client-Identifier", ClientKey)
	params.Add("X-Plex-Version", WrapperrVersion)
	params.Add("X-Plex-Model", x_plex_model)
	params.Add("X-Plex-Language", x_plex_language)
	params.Add("code", Code)

	payload := strings.NewReader(params.Encode())

	req, err := http.NewRequest("GET", url_string, payload)
	if err != nil {
		return nil, err
	}

	req.Header.Add("Accept", content_type)
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}

	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	var body_reply models.PlexGetPinReply
	json.Unmarshal(body, &body_reply)
	if err != nil {
		return nil, err
	}

	return &body_reply, nil
}

func PlexAuthValidateToken(PlexAuth string, ClientKey string, WrapperrVersion string) (*models.PlexGetUserReply, error) {

	url_string := "https://plex.tv/api/v2/user"

	params := url.Values{}
	params.Add("X-Plex-Client-Identifier", ClientKey)
	params.Add("X-Plex-Version", WrapperrVersion)
	params.Add("X-Plex-Product", x_plex_product)
	params.Add("X-Plex-Model", x_plex_model)
	params.Add("X-Plex-Language", x_plex_language)
	params.Add("X-Plex-Token", PlexAuth)

	payload := strings.NewReader(params.Encode())

	req, err := http.NewRequest("GET", url_string, payload)
	if err != nil {
		return nil, err
	}

	req.Header.Add("Accept", content_type)
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}

	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)

	if err != nil {
		return nil, err
	}
	// Plex answers a token it doesn't know with an error status; read as a user, that was user 0
	if res.StatusCode != http.StatusOK {
		return nil, errors.New("Plex refused the token (status " + strconv.Itoa(res.StatusCode) + ").")
	}

	// Who the token belongs to is read on its own: the full reply has fields Plex sends in other shapes (its
	// subscription date isn't RFC 3339), which are left empty as before rather than failing the login
	var identity struct {
		ID       int    `json:"id"`
		Username string `json:"username"`
		Email    string `json:"email"`
	}
	if err := json.Unmarshal(body, &identity); err != nil {
		return nil, err
	}
	if identity.ID == 0 {
		return nil, errors.New("Plex sent no user for the token.")
	}
	var body_reply models.PlexGetUserReply
	json.Unmarshal(body, &body_reply)
	body_reply.ID, body_reply.Username, body_reply.Email = identity.ID, identity.Username, identity.Email

	return &body_reply, nil
}
