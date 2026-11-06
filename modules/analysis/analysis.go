// Package analysis is the cleaned per-account layer over Wrapperr's play cache: titles grouped across re-added and
// re-matched movies, sessions with the minutes actually watched, whether each counts as watched, and the local day
// and hour it started in its account's time zone. It does no I/O, so the statistics, the voyage and the static
// export all read the same numbers.
package analysis

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/aunefyren/wrapperr/models"
)

// WatchedPct is how far into a title a session must get to count as watching it.
const WatchedPct = 50

// MaxSessionMinutes caps one session, so a player left running overnight doesn't count as a day's viewing.
const MaxSessionMinutes = 6 * 60

// Title is a movie, or a show with all its episodes.
type Title struct {
	Name string `json:"name"`
	Year int    `json:"year"`
	Type string `json:"type"` // "movie" or "show"
	// RatingKeys are the Plex rating keys seen for it (a movie's, or a show's grandparent key), newest first
	RatingKeys []int `json:"keys"`
	named      int
}

// Session is one play (as Wrapperr's cache groups them) by one account.
type Session struct {
	UserID    int     `json:"user_id"`
	Account   string  `json:"account"` // the Plex username, never a friendly name
	Title     int     `json:"title"`   // index into Analysis.Titles
	Start     int64   `json:"start"`
	Minutes   float64 `json:"minutes"`
	Watched   bool    `json:"watched"`
	Day       int     `json:"day"` // local days since the first day of the period
	Hour      int     `json:"hour"`
	RatingKey int     `json:"rating_key"` // the movie or episode played
}

// Options say which plays to read and how to place them in time.
type Options struct {
	Start, End int64 // the wrapped period, as Unix seconds
	// ServerZone is Wrapperr's time zone; it sets the first day of the period and is every account's default
	ServerZone *time.Location
	// Zones are per-account time zones by user ID, for accounts that don't watch in the server's
	Zones   map[int]*time.Location
	Ignored map[int]bool // user IDs left out entirely
}

// Analysis is the period's titles and sessions.
type Analysis struct {
	First    time.Time // midnight on the first day of the period, in the server zone
	Titles   []Title
	Sessions []Session
}

// titleKey is a node in the title grouping: a rating key on one Tautulli server, or a movie's Plex GUID.
type titleKey struct {
	kind   string
	server string
	key    string
}

type grouping map[titleKey]titleKey

func (g grouping) find(x titleKey) titleKey {
	if _, ok := g[x]; !ok {
		g[x] = x
	}
	for g[x] != x {
		g[x] = g[g[x]]
		x = g[x]
	}
	return x
}

func (g grouping) union(a, b titleKey) {
	g[g.find(a)] = g.find(b)
}

// itemKey is what a play is grouped by: a movie's own rating key, an episode's show.
func itemKey(play models.TautulliEntry) (titleKey, bool) {
	switch play.MediaType {
	case "movie":
		if play.RatingKey == 0 {
			return titleKey{}, false
		}
		return titleKey{"movie", play.TautulliServerHash, strconv.Itoa(play.RatingKey)}, true
	case "episode":
		if play.GrandparentRatingKey == 0 {
			return titleKey{}, false
		}
		return titleKey{"show", play.TautulliServerHash, strconv.Itoa(play.GrandparentRatingKey)}, true
	}
	return titleKey{}, false
}

// Analyse reads the cached plays in the period into titles and sessions.
//
// Movies are matched on their Plex GUID (local:// GUIDs aside), with rating keys and GUIDs linked, so a re-added
// movie (new key, same GUID) and a re-matched one (same key, new GUID) each stay one title. Shows are matched on
// their key. Keys are per Tautulli server; GUIDs match across servers.
func Analyse(days []models.WrapperrDay, opt Options) Analysis {
	server := opt.ServerZone
	if server == nil {
		server = time.UTC
	}
	startLocal := time.Unix(opt.Start, 0).In(server)
	first := time.Date(startLocal.Year(), startLocal.Month(), startLocal.Day(), 0, 0, 0, 0, server)
	result := Analysis{First: first}

	var plays []models.TautulliEntry
	for _, day := range days {
		for _, play := range day.Data {
			if opt.Ignored[play.UserID] || int64(play.Date) < opt.Start || int64(play.Date) > opt.End {
				continue
			}
			if _, ok := itemKey(play); ok {
				plays = append(plays, play)
			}
		}
	}
	// Plays in time order, so titles are numbered in the order first played and the latest name wins
	sort.SliceStable(plays, func(i, j int) bool { return plays[i].Date < plays[j].Date })

	groups := grouping{}
	for _, play := range plays {
		key, _ := itemKey(play)
		if key.kind == "movie" && play.GUID != "" && !strings.HasPrefix(play.GUID, "local://") {
			groups.union(key, titleKey{kind: "guid", key: play.GUID})
		}
	}

	index := map[titleKey]int{}
	for _, play := range plays {
		key, _ := itemKey(play)
		root := groups.find(key)
		i, ok := index[root]
		if !ok {
			i = len(result.Titles)
			index[root] = i
			result.Titles = append(result.Titles, Title{})
		}
		title := &result.Titles[i]
		// Keep the latest name: an early mis-match can carry another film's title
		if play.MediaType == "movie" {
			if title.Name == "" || play.Date >= title.named {
				title.Name, title.Year, title.Type, title.named = play.Title, play.Year, "movie", play.Date
			}
			title.RatingKeys = addKey(title.RatingKeys, play.RatingKey)
		} else {
			if title.Name == "" || play.Date >= title.named {
				title.Name, title.Year, title.Type, title.named = play.GrandparentTitle, 0, "show", play.Date
			}
			title.RatingKeys = addKey(title.RatingKeys, play.GrandparentRatingKey)
		}

		zone := server
		if z, ok := opt.Zones[play.UserID]; ok && z != nil {
			zone = z
		}
		local := time.Unix(int64(play.Date), 0).In(zone)
		localDay := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
		firstDay := time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, time.UTC)
		result.Sessions = append(result.Sessions, Session{
			UserID:    play.UserID,
			Account:   play.User,
			Title:     i,
			Start:     int64(play.Date),
			Minutes:   SessionMinutes(play.Duration),
			Watched:   play.PercentComplete >= WatchedPct,
			Day:       int(localDay.Sub(firstDay).Hours() / 24),
			Hour:      local.Hour(),
			RatingKey: play.RatingKey,
		})
	}
	// An account is one user ID under its latest username, so a renamed account stays one account
	latest := map[int]string{}
	for _, play := range plays {
		latest[play.UserID] = play.User
	}
	for i := range result.Sessions {
		result.Sessions[i].Account = latest[result.Sessions[i].UserID]
	}
	return result
}

// SessionMinutes is a play's duration in minutes, capped at MaxSessionMinutes. Tautulli's duration is the time
// played, paused time already taken out.
func SessionMinutes(durationSeconds int) float64 {
	minutes := float64(durationSeconds) / 60
	if minutes < 0 {
		return 0
	}
	if minutes > MaxSessionMinutes {
		return MaxSessionMinutes
	}
	return minutes
}

// addKey adds a rating key, keeping the list newest (highest) first without repeats.
func addKey(keys []int, key int) []int {
	for _, k := range keys {
		if k == key {
			return keys
		}
	}
	keys = append(keys, key)
	sort.Sort(sort.Reverse(sort.IntSlice(keys)))
	return keys
}

// Watched is the set of titles each account watched (a session reaching WatchedPct), by user ID.
func (a Analysis) Watched() map[int]map[int]bool {
	watched := map[int]map[int]bool{}
	for _, s := range a.Sessions {
		if !s.Watched {
			continue
		}
		if watched[s.UserID] == nil {
			watched[s.UserID] = map[int]bool{}
		}
		watched[s.UserID][s.Title] = true
	}
	return watched
}

// ForAccount is the sessions of one account, in time order.
func (a Analysis) ForAccount(userID int) []Session {
	var sessions []Session
	for _, s := range a.Sessions {
		if s.UserID == userID {
			sessions = append(sessions, s)
		}
	}
	return sessions
}
