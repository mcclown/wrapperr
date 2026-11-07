package models

// PlexMetadata is what Wrapperr keeps about a movie or show from Tautulli's get_metadata, cached in
// metadata.json under its server hash and rating key. It holds library details only, nothing about who watched.
type PlexMetadata struct {
	MediaType string `json:"media_type"` // "movie" or "show"
	Year      int    `json:"year"`
	AddedAt   int64  `json:"added_at"` // when it was added to Plex, Unix seconds
	// Episodes is how many episodes of a show are in Plex (Tautulli's children_count for a show); 0 for a movie
	Episodes       int      `json:"episodes"`
	Rating         float64  `json:"rating"`          // the critic rating, 0 to 10, or 0 when there is none
	AudienceRating float64  `json:"audience_rating"` // 0 to 10, or 0 when there is none
	ContentRating  string   `json:"content_rating"`
	Genres         []string `json:"genres"`
	Thumb          string   `json:"thumb"` // the poster's Plex path
	Art            string   `json:"art"`   // the backdrop's Plex path
	// Checked is when it was last fetched, Unix seconds. Missing means Plex no longer knows the key.
	Checked int64 `json:"checked"`
	Missing bool  `json:"missing,omitempty"`
}
