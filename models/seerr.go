package models

import "time"

type SeerrConfig struct {
	SeerrEnabled bool   `json:"seerr_enabled"`
	SeerrApiKey  string `json:"seerr_apikey"`
	SeerrIP      string `json:"seerr_ip"`
	SeerrPort    int    `json:"seerr_port"`
	SeerrRoot    string `json:"seerr_root"`
	SeerrHttps   bool   `json:"seerr_https"`
}

type SeerrRequestReply struct {
	PageInfo struct {
		Page    int `json:"page"`
		Pages   int `json:"pages"`
		Results int `json:"results"`
	} `json:"pageInfo"`
	Results []SeerrRequest `json:"results"`
}

type SeerrRequest struct {
	ID          int        `json:"id"`
	Status      int        `json:"status"`
	CreatedAt   time.Time  `json:"createdAt"`
	Is4k        bool       `json:"is4k"`
	Media       SeerrMedia `json:"media"`
	RequestedBy SeerrUser  `json:"requestedBy"`
}

type SeerrMedia struct {
	ID          int     `json:"id"`
	MediaType   string  `json:"mediaType"`
	TmdbID      int     `json:"tmdbId"`
	TvdbID      *int    `json:"tvdbId"`
	RatingKey   *string `json:"ratingKey"`
	RatingKey4k *string `json:"ratingKey4k"`
}

type SeerrUser struct {
	ID           int     `json:"id"`
	Email        string  `json:"email"`
	DisplayName  string  `json:"displayName"`
	PlexID       *int    `json:"plexId"`
	PlexUsername *string `json:"plexUsername"`
}

type WrapperrRequestMonth struct {
	Month    string `json:"month"`
	Requests int    `json:"requests"`
}

type WrapperrRequestUser struct {
	User          string `json:"user"`
	FriendlyName  string `json:"friendly_name"`
	UserID        int    `json:"user_id"`
	Requests      int    `json:"requests"`
	MovieRequests int    `json:"movie_requests"`
	ShowRequests  int    `json:"show_requests"`
}

type WrapperrUserRequests struct {
	Data struct {
		RequestCount      int                    `json:"request_count"`
		MovieRequestCount int                    `json:"movie_request_count"`
		ShowRequestCount  int                    `json:"show_request_count"`
		RequestRank       int                    `json:"request_rank"`
		RequesterCount    int                    `json:"requester_count"`
		Timeline          []WrapperrRequestMonth `json:"timeline"`
	} `json:"data"`
	Message string `json:"message"`
	Error   bool   `json:"error"`
}

type WrapperrYearRequests struct {
	Data struct {
		RequestCount int                    `json:"request_count"`
		Requesters   []WrapperrRequestUser  `json:"requesters"`
		Timeline     []WrapperrRequestMonth `json:"timeline"`
	} `json:"data"`
	Message string `json:"message"`
	Error   bool   `json:"error"`
}
