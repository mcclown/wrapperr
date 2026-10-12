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
	// Distinct other users who watched this user's requests (trendsetters)
	Viewers    int                  `json:"viewers"`
	TopRequest WrapperrRequestTitle `json:"top_request"`
	// Requested titles that were watched, out of the requested titles they
	// relate to. For trendsetters these are the user's requests watched by
	// others, for followers the current user's requests watched by this user,
	// and for following this user's requests watched by the current user.
	TitlesWatched        int `json:"titles_watched"`
	RequestedTitles      int `json:"requested_titles"`
	TitlesWatchedPercent int `json:"titles_watched_percent"`
	Duration             int `json:"duration"`
}

type WrapperrRequestTitle struct {
	Title   string `json:"title"`
	Year    int    `json:"year"`
	Viewers int    `json:"viewers"`
	// Poster details, taken from a play of the title
	RatingKey          int    `json:"rating_key"`
	Thumb              string `json:"thumb"`
	TautulliServerHash string `json:"tautulli_server_hash"`
}

type WrapperrUserRequests struct {
	Data struct {
		RequestCount      int                    `json:"request_count"`
		MovieRequestCount int                    `json:"movie_request_count"`
		ShowRequestCount  int                    `json:"show_request_count"`
		RequestRank       int                    `json:"request_rank"`
		RequesterCount    int                    `json:"requester_count"`
		Timeline          []WrapperrRequestMonth `json:"timeline"`
		Viewers           int                    `json:"viewers"`
		TopRequest        WrapperrRequestTitle   `json:"top_request"`
		Followers         []WrapperrRequestUser  `json:"followers"`
		FollowingTitles   []WrapperrRequestUser  `json:"following_titles"`
		FollowingPercent  []WrapperrRequestUser  `json:"following_percent"`
	} `json:"data"`
	Message string `json:"message"`
	Error   bool   `json:"error"`
}

type WrapperrYearRequests struct {
	Data struct {
		RequestCount        int                    `json:"request_count"`
		Requesters          []WrapperrRequestUser  `json:"requesters"`
		TrendsettersTitles  []WrapperrRequestUser  `json:"trendsetters_titles"`
		TrendsettersPercent []WrapperrRequestUser  `json:"trendsetters_percent"`
		Timeline            []WrapperrRequestMonth `json:"timeline"`
	} `json:"data"`
	Message string `json:"message"`
	Error   bool   `json:"error"`
}
