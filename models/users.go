package models

import "time"

type WrapperrUser struct {
	FriendlyName    string                 `json:"user_friendly_name"`
	User            string                 `json:"user_name"`
	UserID          int                    `json:"user_id"`
	Email           string                 `json:"user_email"`
	Active          bool                   `json:"user_active"`
	TautulliServers []string               `json:"user_tautulli_servers"`
	Wrappings       []WrapperrHistoryEntry `json:"wrappings"`
	Ignore          bool                   `json:"user_ignore"`
	// The account's time zone, from GeoIP or set by an admin ("" is the server's), and where it came from. Only
	// the zone and a "Country / Region" label are kept, never addresses.
	Timezone       string `json:"user_timezone"`
	TimezoneLabel  string `json:"user_timezone_label"`
	TimezoneSource string `json:"user_timezone_source"`
}

type WrapperrHistoryEntry struct {
	Date time.Time `json:"entry_date"`
	IP   string    `json:"entry_ip"`
}
