package voyage

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/analysis"
)

// sea builds an analysis by hand: titles, then sessions added with play
type sea struct {
	a     analysis.Analysis
	start int64
}

func newSea(titles ...analysis.Title) *sea {
	first := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	return &sea{a: analysis.Analysis{First: first, LastDay: 364, Titles: titles}, start: first.Unix()}
}

func show(name string, key int) analysis.Title {
	return analysis.Title{Name: name, Type: "show", Keys: []analysis.Key{{Server: "s1", RatingKey: key}}}
}

func movie(name string, year, key int) analysis.Title {
	return analysis.Title{Name: name, Year: year, Type: "movie", Keys: []analysis.Key{{Server: "s1", RatingKey: key}}}
}

// play adds a watched session (an episode or film key) on a day, at 20:00
func (s *sea) play(user int, account string, title, day, key int, minutes float64) {
	s.a.Sessions = append(s.a.Sessions, analysis.Session{UserID: user, Account: account, Title: title, Day: day, Hour: 20,
		Start: s.start + int64(day)*86400 + 20*3600 + int64(len(s.a.Sessions)), Minutes: minutes, Watched: true, RatingKey: key})
}

func (s *sea) build(t *testing.T, user int, metadata map[int]models.PlexMetadata, events Events) Document {
	t.Helper()
	doc, _, err := Build(Input{Analysis: s.a, UserID: user, Events: events, Generated: time.Unix(0, 0), ImageBase: "/api/get/poster/", Images: true,
		Metadata: func(title analysis.Title) (models.PlexMetadata, analysis.Key, bool) {
			m, ok := metadata[title.Keys[0].RatingKey]
			return m, title.Keys[0], ok
		}})
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func creatures(doc Document) map[string][]Creature {
	out := map[string][]Creature{}
	for _, c := range doc.Voyages[0].Creatures {
		out[c.Kind] = append(out[c.Kind], c)
	}
	return out
}

func name(doc Document, c Creature) string {
	if c.T == nil {
		return ""
	}
	return doc.Titles[*c.T].Name
}

func TestMarksAndSeaState(t *testing.T) {
	s := newSea(show("Binge", 100), movie("Sample", 2020, 200))
	for ep := 0; ep < 5; ep++ {
		s.play(1, "sailor", 0, 3, 101+ep, 30) // five episodes on day 3
	}
	for day := 4; day <= 6; day++ {
		s.play(1, "sailor", 0, day, 110+day, 30) // and one a day for three more days
	}
	s.play(1, "sailor", 0, 3, 101, 30) // a rewatch is a play, not a new episode
	s.play(1, "sailor", 1, 10, 200, 5) // under 20 minutes: a sample
	doc := s.build(t, 1, nil, Events{})

	v := doc.Voyages[0]
	if doc.User != "sailor" || v.Label != "sailor" || doc.Version != Version || doc.LastDay != 10 || doc.First != "2026-01-01" {
		t.Fatalf("document %+v", doc)
	}
	if len(v.Marks) != 1 {
		t.Fatalf("marks %+v, want only Binge (the sample is under 20 minutes)", v.Marks)
	}
	m := v.Marks[0]
	if m.Hours != 4.5 || m.Plays != 9 || m.Distinct != 8 || m.First != 3 || m.Last != 6 || m.BestDay != 6 || m.BestAt != 3 ||
		m.Streak != 4 || *m.StreakAt != 3 || m.Peak != 3 || m.PeakHours != 3 || m.LastNew != 6 {
		t.Fatalf("mark %+v", m)
	}
	if len(v.Weeks) != 2 || v.Weeks[0] != [2]float64{4.5, 0} || v.Weeks[1] != [2]float64{0.1, 0} || v.Sessions != 10 || v.Days != 5 {
		t.Fatalf("weeks %v, sessions %d, days %d", v.Weeks, v.Sessions, v.Days)
	}
	if c := creatures(doc)["kraken"]; len(c) != 1 || c[0].N != 6 || c[0].Day != 3 || name(doc, c[0]) != "Binge" || c[0].Tier != "cine" {
		t.Fatalf("kraken %+v", c)
	}
	// The kraken took Binge, so there is no serpent: one creature per title
	if c := creatures(doc)["serpent"]; len(c) != 0 {
		t.Fatalf("serpent %+v", c)
	}
}

func TestSightings(t *testing.T) {
	s := newSea(show("Serpent", 100), show("Whale", 200), show("Wreck", 300), movie("Ghost", 2001, 400), movie("Charted", 2026, 500), movie("Late", 2026, 600))
	for day := 0; day < 5; day++ {
		s.play(1, "sailor", 0, day, 101+day, 40) // five days running
	}
	for ep := 0; ep < 40; ep++ {
		s.play(1, "sailor", 1, 10+2*(ep/3), 201+ep, 25) // all 40 episodes, three every other day
	}
	for ep := 0; ep < 5; ep++ {
		s.play(1, "sailor", 2, 30+ep*5, 301+ep, 45) // 5 of 20 episodes, then left
	}
	s.play(1, "sailor", 3, 60, 400, 120) // nobody else watched it
	s.play(1, "sailor", 4, 70, 500, 100) // first to watch it...
	s.play(2, "crew", 4, 71, 500, 100)   // ...and two others followed
	s.play(3, "deckhand", 4, 72, 500, 100)
	s.play(1, "sailor", 5, 200, 600, 100) // sails the voyage on to day 200
	for _, title := range []int{0, 1, 2, 5} {
		s.play(2, "crew", title, 250, 0, 60) // so only Ghost is the sailor's alone
	}
	metadata := map[int]models.PlexMetadata{
		200: {MediaType: "show", Episodes: 40},
		300: {MediaType: "show", Episodes: 20},
		500: {MediaType: "movie", AddedAt: s.start + 60*86400}, // added this year
	}
	doc := s.build(t, 1, metadata, Events{})
	got := creatures(doc)
	check := func(kind, title string, n float64) Creature {
		t.Helper()
		if len(got[kind]) != 1 || name(doc, got[kind][0]) != title || got[kind][0].N != n {
			t.Fatalf("%s: %+v, want %s with n %v", kind, got[kind], title, n)
		}
		return got[kind][0]
	}
	check("serpent", "Serpent", 5)
	if w := check("whale", "Whale", 40); *w.Of != 40 || w.Day != 36 {
		t.Fatalf("whale %+v", w)
	}
	if w := check("wreck", "Wreck", 5); *w.Of != 20 || w.Tier != "cine" {
		t.Fatalf("wreck %+v: the first wreck met gets a crew's-eye shot", w)
	}
	if g := check("ghost", "Ghost", 2); g.Tier != "cine" {
		t.Fatalf("ghost %+v", g)
	}
	check("chart", "Charted", 2)
	if len(got["kraken"]) != 0 {
		t.Fatalf("kraken %+v: three a day is under four", got["kraken"])
	}
	// In day order (where each sits)
	prev := -1
	for _, c := range doc.Voyages[0].Creatures {
		at := c.Day
		if c.At != nil {
			at = *c.At
		}
		if at < prev {
			t.Fatalf("creatures out of order: %+v", doc.Voyages[0].Creatures)
		}
		prev = at
	}
}

func TestSpaceOut(t *testing.T) {
	ref := func(t int) *int { return &t }
	found := []Creature{
		{Kind: "ghost", T: ref(3), Day: 50, Tier: "loud"},
		{Kind: "kraken", T: ref(1), Day: 50, Tier: "cine"},
		{Kind: "serpent", T: ref(2), Day: 52, Tier: "cine"},
	}
	out := spaceOut(found, 100, []int{60})
	at := map[string]int{}
	for _, c := range out {
		at[c.Kind] = c.Day
		if c.At != nil {
			at[c.Kind] = *c.At
		}
	}
	// The kraken keeps its day; the serpent moves on to a week after it and 4 days clear of the egg on day 60; the
	// ghost to the first day 3 off the kraken's crew's-eye shot
	if at["kraken"] != 50 || at["serpent"] != 64 || at["ghost"] != 53 {
		t.Fatalf("placed at %v", at)
	}
	if out[0].At != nil || out[0].Kind != "kraken" {
		t.Fatalf("a sighting left on its day has no at: %+v", out[0])
	}
}

func TestTwin(t *testing.T) {
	var titles []analysis.Title
	for i := 0; i < 20; i++ {
		titles = append(titles, movie("Film "+string(rune('A'+i)), 2000, 100+i))
	}
	s := newSea(titles...)
	for i := 0; i < 6; i++ {
		s.play(1, "sailor", i, 7+i, 100+i, 100)
	}
	for i := 0; i < 5; i++ {
		s.play(2, "twin", i, 8, 100+i, 90+float64(i)) // five in common, little else
	}
	for i := 0; i < 20; i++ {
		s.play(3, "hoarder", i, 9, 100+i, 100) // all six in common, but fourteen more
	}
	s.play(4, "nearly", 0, 1, 100, 100) // too few in common, however close
	doc := s.build(t, 1, nil, Events{})
	tw := creatures(doc)["twin"]
	if len(tw) != 1 || tw[0].User != "twin" || tw[0].N != 5 || *tw[0].Pct != 83 || name(doc, tw[0]) != "Film E" || tw[0].Day != 7 {
		t.Fatalf("twin %+v (%s)", tw, name(doc, tw[0]))
	}
}

func TestEventsAndEggs(t *testing.T) {
	s := newSea(movie("Film", 2000, 100))
	s.play(1, "sailor", 0, 0, 100, 100)
	s.play(1, "sailor", 0, 40, 100, 100)
	events, err := ParseEvents([]byte(`{"events": [
		{"date": "2026-01-05", "headline": "first of January"},
		{"date": "2026-01-02", "headline": "earlier, not picked"},
		{"date": "2026-01-20", "headline": "picked", "pick": true},
		{"date": "2026-02-03", "headline": "February"},
		{"date": "2026-03-01", "headline": "after the voyage"},
		{"date": "not a date", "headline": "broken"}],
		"eggs": [{"date": "2026-01-01", "kind": "fireworks"}, {"date": "2026-12-25", "kind": "christmas"}, {"date": "2025-12-25", "kind": "old"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	doc := s.build(t, 1, nil, events)
	var heads []string
	for _, e := range doc.Events {
		heads = append(heads, e["headline"].(string))
	}
	if strings.Join(heads, ",") != "picked,February" || doc.Events[0]["day"] != 19 {
		t.Fatalf("events %v", doc.Events)
	}
	if len(doc.Eggs) != 2 || doc.Eggs[1]["day"] != 358 {
		t.Fatalf("eggs %v: all from the first day on are sent, the page shows those reached", doc.Eggs)
	}
	if _, err := ParseEvents(DefaultEvents); err != nil {
		t.Fatalf("the built-in events: %v", err)
	}
}

func TestImagesAndContract(t *testing.T) {
	s := newSea(movie("Film", 2020, 100), show("Show", 200), movie("Unknown", 0, 300))
	s.a.Titles[2].Name = ""
	s.play(1, "sailor", 0, 0, 100, 100)
	s.play(1, "sailor", 1, 1, 201, 100)
	s.play(1, "sailor", 2, 2, 300, 30)
	metadata := map[int]models.PlexMetadata{
		100: {MediaType: "movie", Thumb: "/library/metadata/100/thumb/9", Art: "/library/metadata/100/art/9"},
		200: {MediaType: "show", Year: 2019},
	}
	doc, images, err := Build(Input{Analysis: s.a, UserID: 1, Generated: time.Unix(0, 0), ImageBase: "/api/get/poster/", Images: true,
		Metadata: func(title analysis.Title) (models.PlexMetadata, analysis.Key, bool) {
			m, ok := metadata[title.Keys[0].RatingKey]
			return m, title.Keys[0], ok
		}})
	if err != nil {
		t.Fatal(err)
	}
	film, tv, unknown := doc.Titles[0], doc.Titles[1], doc.Titles[2]
	if *film.Poster != "s1/100.jpg" || *film.Art != "s1/100-art.jpg" || tv.Year != 2019 || tv.Art != nil || unknown.Name != "(unknown)" {
		t.Fatalf("titles %+v %+v %+v", film, tv, unknown)
	}
	if len(images) != 4 || images[0].Path != "/library/metadata/100/thumb/9" || images[1].Kind != "art" || images[2].Path != "/library/metadata/200/thumb" {
		t.Fatalf("images %+v", images)
	}

	// The contract's field names, as the page reads them
	raw, _ := json.Marshal(doc)
	for _, field := range []string{`"version":"voyage.v1"`, `"imageBase":"/api/get/poster/"`, `"lastDay":2`, `"streakAt":`, `"peakHours":`, `"weeks":[[`, `"events":[]`, `"eggs":[]`} {
		if !strings.Contains(string(raw), field) {
			t.Errorf("the document has no %s: %s", field, raw)
		}
	}

	if _, _, err := Build(Input{Analysis: s.a, UserID: 2}); err != ErrNoSessions {
		t.Fatalf("an account with no plays: %v", err)
	}
	none, _, _ := Build(Input{Analysis: s.a, UserID: 1, Images: false})
	if none.Titles[0].Poster != nil {
		t.Fatal("with posters off there are no images")
	}
}
