package analysis

import (
	"testing"
	"time"

	"github.com/aunefyren/wrapperr/models"
)

func movie(user int, name string, date, key int, guid string, pct, duration int) models.TautulliEntry {
	return models.TautulliEntry{UserID: user, User: "user" + string(rune('a'+user)), FriendlyName: "Real Name", MediaType: "movie",
		Title: name, Year: 2020, RatingKey: key, GUID: guid, Date: date, PercentComplete: pct, Duration: duration, TautulliServerHash: "s1"}
}

func episode(user int, show string, date, showKey, key, pct, duration int) models.TautulliEntry {
	return models.TautulliEntry{UserID: user, User: "user" + string(rune('a'+user)), MediaType: "episode", GrandparentTitle: show,
		GrandparentRatingKey: showKey, RatingKey: key, Date: date, PercentComplete: pct, Duration: duration, TautulliServerHash: "s1"}
}

func days(plays ...models.TautulliEntry) []models.WrapperrDay {
	return []models.WrapperrDay{{Date: "2026-01-01", Data: plays}}
}

func mustZone(t *testing.T, name string) *time.Location {
	t.Helper()
	zone, err := time.LoadLocation(name)
	if err != nil {
		t.Fatal(err)
	}
	return zone
}

func TestTitlesGroupedByGUIDAndKey(t *testing.T) {
	sydney := mustZone(t, "Australia/Sydney")
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, sydney).Unix()
	d := int(start)
	a := Analyse(days(
		movie(0, "Old Name", d+100, 10, "plex://movie/a", 90, 3600),
		movie(1, "Film A", d+200, 11, "plex://movie/a", 90, 3600),  // re-added: new key, same GUID
		movie(0, "Film A", d+300, 11, "plex://movie/a2", 90, 3600), // re-matched: same key, new GUID
		movie(0, "Local", d+400, 20, "local://20", 90, 3600),
		movie(1, "Local", d+500, 21, "local://21", 90, 3600), // local GUIDs never join titles
		episode(0, "Show", d+600, 30, 31, 90, 1800),
		episode(1, "Show", d+700, 30, 32, 20, 1800),
	), Options{Start: start, End: start + 86400, ServerZone: sydney})

	if len(a.Titles) != 4 {
		t.Fatalf("%d titles, want 4: %+v", len(a.Titles), a.Titles)
	}
	film := a.Titles[a.Sessions[0].Title]
	if film.Name != "Film A" || len(film.Keys) != 2 || film.Keys[0] != (Key{"s1", 11}) {
		t.Fatalf("movie grouped as %+v, want Film A with keys [11 10]", film)
	}
	if a.Sessions[1].Title != a.Sessions[0].Title || a.Sessions[2].Title != a.Sessions[0].Title {
		t.Fatal("re-added and re-matched plays should be one title")
	}
	if a.Sessions[3].Title == a.Sessions[4].Title {
		t.Fatal("local:// GUIDs should not join titles")
	}
	show := a.Titles[a.Sessions[5].Title]
	if show.Type != "show" || show.Name != "Show" || a.Sessions[6].Title != a.Sessions[5].Title {
		t.Fatalf("show grouped as %+v", show)
	}
	watched := a.Watched()
	if !watched[0][a.Sessions[5].Title] || watched[1][a.Sessions[6].Title] {
		t.Fatal("watched should follow the 50% rule")
	}
	for _, s := range a.Sessions {
		if s.Account == "Real Name" {
			t.Fatal("sessions must carry the username, never the friendly name")
		}
	}
}

func TestPeriodIgnoredAndMinutes(t *testing.T) {
	start := int64(1_000_000)
	a := Analyse(days(
		movie(0, "Before", int(start-1), 1, "", 90, 600),
		movie(0, "Long", int(start), 2, "", 90, 10*3600),
		movie(1, "Ignored", int(start+10), 3, "", 90, 600),
		movie(0, "After", int(start+101), 4, "", 90, 600),
	), Options{Start: start, End: start + 100, Ignored: map[int]bool{1: true}})
	if len(a.Sessions) != 1 || a.Titles[0].Name != "Long" {
		t.Fatalf("sessions %+v, want only Long", a.Sessions)
	}
	if a.Sessions[0].Minutes != MaxSessionMinutes {
		t.Fatalf("minutes %v, want capped at %d", a.Sessions[0].Minutes, MaxSessionMinutes)
	}
}

func TestRenamedAccountKeepsLatestUsername(t *testing.T) {
	early, late := movie(0, "A", 10, 1, "", 90, 600), movie(0, "B", 20, 2, "", 90, 600)
	early.User, late.User = "oldname", "newname"
	a := Analyse(days(late, early), Options{Start: 0, End: 100})
	for _, s := range a.Sessions {
		if s.Account != "newname" {
			t.Fatalf("account %q, want the latest username", s.Account)
		}
	}
}

func TestLocalDayAndHourPerAccount(t *testing.T) {
	sydney, dublin := mustZone(t, "Australia/Sydney"), mustZone(t, "Europe/Dublin")
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, sydney).Unix()
	// 10:00 on 2 January in Sydney is 23:00 on 1 January in Dublin
	at := int(time.Date(2026, 1, 2, 10, 0, 0, 0, sydney).Unix())
	a := Analyse(days(movie(0, "A", at, 1, "", 90, 600), movie(1, "A", at, 1, "", 90, 600)),
		Options{Start: start, End: start + 7*86400, ServerZone: sydney, Zones: map[int]*time.Location{1: dublin}})
	server, abroad := a.Sessions[0], a.Sessions[1]
	if server.Day != 1 || server.Hour != 10 {
		t.Fatalf("server zone: day %d hour %d, want 1 and 10", server.Day, server.Hour)
	}
	if abroad.Day != 0 || abroad.Hour != 23 {
		t.Fatalf("Dublin: day %d hour %d, want 0 and 23", abroad.Day, abroad.Hour)
	}
}

func TestDayStaysInPeriod(t *testing.T) {
	sydney, dublin, auckland := mustZone(t, "Australia/Sydney"), mustZone(t, "Europe/Dublin"), mustZone(t, "Pacific/Auckland")
	start := time.Date(2026, 1, 1, 0, 0, 0, 0, sydney).Unix()
	end := time.Date(2026, 1, 7, 23, 59, 59, 0, sydney).Unix()
	// Just after the start in Sydney is the day before in Dublin; just before the end, the day after in Auckland
	a := Analyse(days(movie(0, "A", int(start+60), 1, "", 90, 600), movie(1, "B", int(end-60), 2, "", 90, 600)),
		Options{Start: start, End: end, ServerZone: sydney, Zones: map[int]*time.Location{0: dublin, 1: auckland}})
	if a.LastDay != 6 {
		t.Fatalf("LastDay %d, want 6", a.LastDay)
	}
	if a.Sessions[0].Day != 0 || a.Sessions[1].Day != 6 {
		t.Fatalf("days %d and %d, want 0 and 6", a.Sessions[0].Day, a.Sessions[1].Day)
	}
}

func TestEmptyAndServers(t *testing.T) {
	empty := Analyse(nil, Options{Start: 0, End: 100})
	if empty.Titles == nil || empty.Sessions == nil {
		t.Fatal("no plays should give empty lists, not nil (they encode as null)")
	}
	a, b := movie(0, "A", 10, 1, "plex://movie/x", 90, 600), movie(1, "A", 20, 99, "plex://movie/x", 90, 600)
	b.TautulliServerHash = "s2"
	c, d := movie(0, "C", 30, 5, "", 90, 600), movie(1, "D", 40, 5, "", 90, 600)
	d.TautulliServerHash = "s2" // the same key on another server is another film
	got := Analyse(days(a, b, c, d), Options{Start: 0, End: 100})
	if got.Sessions[0].Title != got.Sessions[1].Title {
		t.Fatal("a GUID should match a movie across servers")
	}
	if got.Sessions[2].Title == got.Sessions[3].Title {
		t.Fatal("rating keys should not match across servers")
	}
}
