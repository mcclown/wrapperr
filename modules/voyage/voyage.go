// Package voyage builds the YarrFlix Voyage document (the voyage.v1 contract, see web/voyage/CONTRACT.md): one
// account's wrapped period as a sea voyage, with the week-by-week sea state, the titles along the route, the sea
// creatures standing for things in its year, and the world events and easter eggs on the way. It reads the
// per-account analysis and the cached Plex metadata and does no I/O, so the live endpoint and the static export
// build the same document.
package voyage

import (
	"errors"
	"math"
	"sort"
	"strconv"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/analysis"
)

// Version is the contract the document follows.
const Version = "voyage.v1"

// The voyage's rules, as tuned in the prototype
const (
	Posters    = 60 // titles along the route, by hours
	Films      = 15 // of those, kept for films, which shows outweigh in hours
	Backdrops  = 12 // of those, by hours, standing as islands with their backdrop
	NightFrom  = 22 // local hours counted as late night: 22:00 to 04:59
	NightTo    = 5
	MinMinutes = 20 // a title watched for less than this is a sample or a trailer
	// LeftDays and LeftShare: a show not played in the last LeftDays days of the voyage was left behind (a wreck) if
	// its plays (rewatches included) fall short of LeftShare of its episodes in Plex
	LeftDays  = 60
	LeftShare = 0.8
	// LeviathanEpisodes: a whale is every episode of a show this long (95% of Plex's count, for specials) seen
	LeviathanEpisodes = 30
	TradeWinds        = 30 // dolphins: something watched every day for this many days running
	ChartFollowers    = 2  // first to chart it: first on the server to watch a title added this year, and this many others followed
	TwinMin           = 5  // a viewing twin has at least this many watched titles in common
)

// Milestones are the hours a voyage can cross the line at: the biggest passed counts.
var Milestones = []float64{100, 250, 500, 1000, 2000}

// cine are the sightings with a crew's-eye shot; the first wreck and the first ghost ship met get one too
var cine = map[string]bool{"kraken": true, "serpent": true, "whale": true, "chart": true, "line": true, "winds": true, "twin": true}

// priority is the order sightings are placed in when they would clash
var priority = []string{"kraken", "serpent", "whale", "chart", "line", "winds", "twin", "wreck", "ghost"}

// clearDays keeps sightings apart at sea, by how many of the two have a crew's-eye shot; eggClear keeps them off an
// easter egg, by whether the sighting has one
var (
	clearDays = map[int]int{2: 7, 1: 3, 0: 2}
	eggClear  = map[bool]int{true: 4, false: 2}
)

// ErrNoSessions is returned for an account with nothing played in the period.
var ErrNoSessions = errors.New("No plays in the wrapped period.")

// Document is the voyage.v1 document.
type Document struct {
	Version   string `json:"version"`
	User      string `json:"user"`  // the Plex username, never a friendly name
	First     string `json:"first"` // the first day of the period, YYYY-MM-DD in the server's zone
	LastDay   int    `json:"lastDay"`
	Pct       int    `json:"pct"` // how far into a title counts as watching it
	Generated string `json:"generated"`
	// ImageBase is prefixed to every poster and art path: Wrapperr's poster route, or img/ in an export
	ImageBase string   `json:"imageBase"`
	Titles    []Title  `json:"titles"`
	Voyages   []Voyage `json:"voyages"`
	Events    []Dated  `json:"events"`
	Eggs      []Dated  `json:"eggs"`
}

// Title is a title on the route or behind a creature.
type Title struct {
	Name   string  `json:"name"`
	Year   int     `json:"year"`
	Type   string  `json:"type"`
	Poster *string `json:"poster"`
	Art    *string `json:"art"`
}

// Voyage is one account's voyage.
type Voyage struct {
	Label     string       `json:"label"`
	Weeks     [][2]float64 `json:"weeks"` // hours, and the share of them late at night
	Marks     []Mark       `json:"marks"`
	Sessions  int          `json:"sessions"`
	Hours     float64      `json:"hours"`
	Days      int          `json:"days"`
	Creatures []Creature   `json:"creatures"`
}

// Mark is a title along the route.
type Mark struct {
	T         int     `json:"t"` // index into Document.Titles
	Hours     float64 `json:"hours"`
	Plays     int     `json:"plays"` // watched sessions
	First     int     `json:"first"`
	Last      int     `json:"last"`
	Distinct  int     `json:"distinct"` // episodes (or the film) watched
	LastNew   int     `json:"lastNew"`  // the day the last of them was first watched
	Peak      int     `json:"peak"`     // the day with the most hours of it
	PeakHours float64 `json:"peakHours"`
	BestDay   int     `json:"bestDay"` // the most watched sessions of it in a day
	BestAt    int     `json:"bestAt"`
	Streak    int     `json:"streak"` // the most days running with a watched session of it
	StreakAt  *int    `json:"streakAt"`
}

// Creature is a sighting.
type Creature struct {
	Kind string  `json:"kind"`
	T    *int    `json:"t"` // index into Document.Titles; null for the line and the winds
	Day  int     `json:"day"`
	N    float64 `json:"n"`
	Of   *int    `json:"of,omitempty"`
	From *int    `json:"from,omitempty"`
	User string  `json:"user,omitempty"` // the twin's Plex username
	Pct  *int    `json:"pct,omitempty"`
	Tier string  `json:"tier"`         // "cine" (a crew's-eye shot) or "loud" (a highlighted card)
	At   *int    `json:"at,omitempty"` // where it sits, when moved off its day to keep clear of another
}

// Dated is an event or an easter egg, as in the events file, with its day in the voyage.
type Dated map[string]interface{}

// Events are the world events (one shown a month: the one marked "pick", or else its first) and the dated easter
// eggs, from config/voyage_events.json.
type Events struct {
	Events []Dated `json:"events"`
	Eggs   []Dated `json:"eggs"`
}

// Image is a poster or backdrop the document points at, for the poster cache to download.
type Image struct {
	Server    string
	RatingKey int
	Path      string // its Plex path
	Kind      string // "" or files.BackdropKind
}

// Input is what a voyage is built from.
type Input struct {
	Analysis analysis.Analysis
	UserID   int
	// Metadata is a title's cached Plex metadata (see modules.TitleMetadata)
	Metadata  func(title analysis.Title) (models.PlexMetadata, analysis.Key, bool)
	Events    Events
	Generated time.Time
	ImageBase string
	Images    bool // posters are enabled
}

// row is one of the account's sessions
type row struct {
	title, day, hour, key int
	minutes               float64
	watched               bool
}

// Build builds one account's voyage, and lists the images it points at.
func Build(in Input) (Document, []Image, error) {
	a := in.Analysis
	var rows []row
	account := ""
	for _, s := range a.ForAccount(in.UserID) {
		rows = append(rows, row{s.Title, s.Day, s.Hour, s.RatingKey, s.Minutes, s.Watched})
		account = s.Account
	}
	if len(rows) == 0 {
		return Document{}, nil, ErrNoSessions
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].day < rows[j].day })
	lastDay := 0
	for _, r := range rows {
		lastDay = max(lastDay, r.day)
	}
	weeks := lastDay/7 + 1

	meta := map[int]models.PlexMetadata{}
	metaKey := map[int]analysis.Key{}
	metadata := func(t int) (models.PlexMetadata, bool) {
		if entry, ok := meta[t]; ok {
			return entry, true
		}
		if in.Metadata == nil {
			return models.PlexMetadata{}, false
		}
		entry, key, ok := in.Metadata(a.Titles[t])
		if ok {
			meta[t], metaKey[t] = entry, key
		}
		return entry, ok
	}
	isMovie := func(t int) bool { return a.Titles[t].Type == "movie" }

	voyage, marks, milestones := personData(rows, weeks)
	voyage.Label = account
	others := othersData(a)

	// Easter eggs: fixed-date scenery. All are sent; the page shows those the voyage reaches.
	first := a.First
	eggs := dated(in.Events.Eggs, first)
	var eggDays []int
	keptEggs := []Dated{}
	for _, egg := range eggs {
		day := egg["day"].(int)
		if day < 0 {
			continue
		}
		keptEggs = append(keptEggs, egg)
		if day <= lastDay {
			eggDays = append(eggDays, day)
		}
	}

	if twin := others.twin(in.UserID); twin != nil {
		milestones = append(milestones, *twin)
	}
	creatures := sightings(marks, isMovie, others.solo(in.UserID, rows), lastDay, metadata, milestones,
		others.charted(in.UserID), first.Unix(), eggDays)
	marks = pick(marks, isMovie)

	// The titles table: those on the route and behind a creature, in title order
	wanted := map[int]bool{}
	for _, m := range marks {
		wanted[m.T] = true
	}
	for _, c := range creatures {
		if c.T != nil {
			wanted[*c.T] = true
		}
	}
	art := map[int]bool{}
	for i, m := range marks {
		if i < Backdrops {
			art[m.T] = true
		}
	}
	order := make([]int, 0, len(wanted))
	for t := range wanted {
		order = append(order, t)
	}
	sort.Ints(order)
	index := map[int]int{}
	titles := make([]Title, 0, len(order))
	var images []Image
	for _, t := range order {
		index[t] = len(titles)
		info := a.Titles[t]
		entry := Title{Name: info.Name, Year: info.Year, Type: info.Type}
		if entry.Name == "" {
			entry.Name = "(unknown)"
		}
		m, found := metadata(t)
		if entry.Year == 0 && found {
			entry.Year = m.Year
		}
		if in.Images && len(info.Keys) > 0 {
			// The poster of its most recently played key Plex still knows, or failing that its most recently played
			key, thumb := info.Keys[0], "/library/metadata/"+strconv.Itoa(info.Keys[0].RatingKey)+"/thumb"
			if found {
				key = metaKey[t]
				if m.Thumb != "" {
					thumb = m.Thumb
				}
			}
			poster := key.Server + "/" + files.PosterFilename(key.RatingKey, "")
			entry.Poster = &poster
			images = append(images, Image{key.Server, key.RatingKey, thumb, ""})
			if art[t] && found && m.Art != "" {
				backdrop := key.Server + "/" + files.PosterFilename(key.RatingKey, files.BackdropKind)
				entry.Art = &backdrop
				images = append(images, Image{key.Server, key.RatingKey, m.Art, files.BackdropKind})
			}
		}
		titles = append(titles, entry)
	}
	for i := range marks {
		marks[i].T = index[marks[i].T]
	}
	for i := range creatures {
		if creatures[i].T != nil {
			t := index[*creatures[i].T]
			creatures[i].T = &t
		}
	}
	voyage.Marks, voyage.Creatures = marks, creatures

	// One event a month: the month's picked event, or else its first
	events := []Dated{}
	byMonth := map[string]int{}
	all := dated(in.Events.Events, first)
	sort.SliceStable(all, func(i, j int) bool { return str(all[i]["date"]) < str(all[j]["date"]) })
	for _, e := range all {
		day := e["day"].(int)
		if day < 0 || day > lastDay {
			continue
		}
		month := str(e["date"])[:7]
		if i, ok := byMonth[month]; !ok {
			byMonth[month] = len(events)
			events = append(events, e)
		} else if picked(e) && !picked(events[i]) {
			events[i] = e
		}
	}
	sort.SliceStable(events, func(i, j int) bool { return events[i]["day"].(int) < events[j]["day"].(int) })

	return Document{
		Version:   Version,
		User:      account,
		First:     first.Format("2006-01-02"),
		LastDay:   lastDay,
		Pct:       analysis.WatchedPct,
		Generated: in.Generated.UTC().Format(time.RFC3339),
		ImageBase: in.ImageBase,
		Titles:    titles,
		Voyages:   []Voyage{voyage},
		Events:    events,
		Eggs:      keptEggs,
	}, images, nil
}

// dated copies events or eggs with their day in the voyage (from the period's first day); those without a valid
// date are left out.
func dated(items []Dated, first time.Time) []Dated {
	start := time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, time.UTC)
	out := []Dated{}
	for _, item := range items {
		date, err := time.Parse("2006-01-02", str(item["date"]))
		if err != nil {
			continue
		}
		copied := Dated{}
		for k, v := range item {
			copied[k] = v
		}
		copied["day"] = int(date.Sub(start).Hours() / 24)
		out = append(out, copied)
	}
	return out
}

func str(v interface{}) string {
	s, _ := v.(string)
	return s
}

func picked(e Dated) bool {
	p, _ := e["pick"].(bool)
	return p
}

// round is Python's round(x, places), which the prototype used: the decimal nearest the float
func round(x float64, places int) float64 {
	r, _ := strconv.ParseFloat(strconv.FormatFloat(x, 'f', places, 64), 64)
	return r
}

// title is a title's running totals in one account's sessions
type title struct {
	t         int
	minutes   float64
	plays     int
	first     int
	last      int
	days      map[int]float64
	dayOrder  []int
	episodes  map[int]int
	seen      map[int]int // each episode (or the film) and the day it was first watched
	seenOrder []int
}

// personData is the weekly sea state, the per-title marks (most hours first), the crossing of the line and the
// trade winds for one account's sessions (in day order).
func personData(rows []row, weeks int) (Voyage, []Mark, []Creature) {
	weekMinutes, weekNight := make([]float64, weeks), make([]float64, weeks)
	dayMinutes := map[int]float64{}
	watchDays := map[int]bool{}
	byTitle := map[int]*title{}
	var titles []*title
	days := map[int]bool{}
	for _, r := range rows {
		days[r.day] = true
		dayMinutes[r.day] += r.minutes
		e, ok := byTitle[r.title]
		if !ok {
			e = &title{t: r.title, first: r.day, last: r.day, days: map[int]float64{}, episodes: map[int]int{}, seen: map[int]int{}}
			byTitle[r.title] = e
			titles = append(titles, e)
		}
		if r.watched {
			watchDays[r.day] = true
			if _, ok := e.seen[r.key]; !ok {
				e.seen[r.key] = r.day
				e.seenOrder = append(e.seenOrder, r.key)
			}
		}
		w := min(r.day/7, weeks-1)
		weekMinutes[w] += r.minutes
		if r.hour >= NightFrom || r.hour < NightTo {
			weekNight[w] += r.minutes
		}
		e.minutes += r.minutes
		if r.watched {
			e.plays++
		}
		e.first, e.last = min(e.first, r.day), max(e.last, r.day)
		if _, ok := e.days[r.day]; !ok {
			e.dayOrder = append(e.dayOrder, r.day)
		}
		e.days[r.day] += r.minutes
		if r.watched {
			e.episodes[r.day]++
		} else {
			e.episodes[r.day] += 0
		}
	}

	var marks []Mark
	for _, e := range titles {
		if e.minutes < MinMinutes {
			continue
		}
		peak, best := e.dayOrder[0], e.dayOrder[0]
		for _, d := range e.dayOrder[1:] {
			if e.days[d] > e.days[peak] {
				peak = d
			}
			if e.episodes[d] > e.episodes[best] || (e.episodes[d] == e.episodes[best] && e.days[d] > e.days[best]) {
				best = d
			}
		}
		var watched []int
		for _, d := range e.dayOrder {
			if e.episodes[d] > 0 {
				watched = append(watched, d)
			}
		}
		sort.Ints(watched)
		run, streak, prev := 0, 0, math.MinInt
		var streakAt *int
		for _, d := range watched {
			if prev == d-1 {
				run++
			} else {
				run = 1
			}
			if run > streak {
				streak = run
				at := d - run + 1
				streakAt = &at
			}
			prev = d
		}
		lastNew := e.last
		if len(e.seenOrder) > 0 {
			lastNew = e.seen[e.seenOrder[0]]
			for _, k := range e.seenOrder {
				lastNew = max(lastNew, e.seen[k])
			}
		}
		marks = append(marks, Mark{T: e.t, Hours: round(e.minutes/60, 1), Plays: e.plays, First: e.first, Last: e.last,
			Distinct: len(e.seen), LastNew: lastNew, Peak: peak, PeakHours: round(e.days[peak]/60, 1),
			BestDay: e.episodes[best], BestAt: best, Streak: streak, StreakAt: streakAt})
	}
	sort.SliceStable(marks, func(i, j int) bool { return marks[i].Hours > marks[j].Hours })

	var milestones []Creature
	// Crossing the line: the day the running total passed the biggest milestone reached
	var line *Creature
	total := 0.0
	for _, d := range sortedKeys(dayMinutes) {
		before := total
		total += dayMinutes[d] / 60
		for _, h := range Milestones {
			if before < h && h <= total {
				line = &Creature{Kind: "line", Day: d, N: h}
			}
		}
	}
	if line != nil {
		milestones = append(milestones, *line)
	}
	// Trade winds: the longest run of days with something watched every day
	var winds *Creature
	run, prev := 0, math.MinInt
	for _, d := range sortedKeys(watchDays) {
		if prev == d-1 {
			run++
		} else {
			run = 1
		}
		if run >= TradeWinds && (winds == nil || float64(run) > winds.N) {
			from := d - run + 1
			winds = &Creature{Kind: "winds", Day: d, N: float64(run), From: &from}
		}
		prev = d
	}
	if winds != nil {
		milestones = append(milestones, *winds)
	}

	weekly := make([][2]float64, weeks)
	sum := 0.0
	for i := range weekly {
		night := 0.0
		if weekMinutes[i] > 0 {
			night = round(weekNight[i]/weekMinutes[i], 2)
		}
		weekly[i] = [2]float64{round(weekMinutes[i]/60, 1), night}
		sum += weekMinutes[i]
	}
	return Voyage{Weeks: weekly, Sessions: len(rows), Hours: round(sum/60, 1), Days: len(days)}, marks, milestones
}

func sortedKeys[V any](m map[int]V) []int {
	keys := make([]int, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Ints(keys)
	return keys
}

// others is what the voyage needs from everyone's watched sessions on the server
type others struct {
	viewers map[int]map[int]bool // the accounts that watched each title
	firsts  map[int]analysis.Session
	order   []int // titles in the order first watched on the server
	people  map[int]*person
	ranks   []int // accounts in the order they first watched something
}

type person struct {
	account string               // the Plex username
	minutes map[int]float64      // watched minutes per title
	days    map[int]map[int]bool // the titles watched on each day
}

func othersData(a analysis.Analysis) others {
	o := others{viewers: map[int]map[int]bool{}, firsts: map[int]analysis.Session{}, people: map[int]*person{}}
	for _, s := range a.Sessions {
		if !s.Watched {
			continue
		}
		if o.viewers[s.Title] == nil {
			o.viewers[s.Title] = map[int]bool{}
		}
		o.viewers[s.Title][s.UserID] = true
		if first, ok := o.firsts[s.Title]; !ok || s.Start < first.Start {
			if !ok {
				o.order = append(o.order, s.Title)
			}
			o.firsts[s.Title] = s
		}
		p, ok := o.people[s.UserID]
		if !ok {
			p = &person{account: s.Account, minutes: map[int]float64{}, days: map[int]map[int]bool{}}
			o.people[s.UserID] = p
			o.ranks = append(o.ranks, s.UserID)
		}
		p.minutes[s.Title] += s.Minutes
		if p.days[s.Day] == nil {
			p.days[s.Day] = map[int]bool{}
		}
		p.days[s.Day][s.Title] = true
	}
	return o
}

// solo are the account's titles nobody else on the server watched
func (o others) solo(user int, rows []row) map[int]bool {
	solo := map[int]bool{}
	for _, r := range rows {
		if v := o.viewers[r.title]; len(v) == 1 && v[user] {
			solo[r.title] = true
		}
	}
	return solo
}

// charted are the titles the account watched before anyone else on the server: the day, and how many others followed
type chart struct{ t, day, followers int }

func (o others) charted(user int) []chart {
	var out []chart
	for _, t := range o.order {
		if s := o.firsts[t]; s.UserID == user {
			out = append(out, chart{t, s.Day, len(o.viewers[t]) - 1})
		}
	}
	return out
}

// twin is the account elsewhere on the server whose watched titles overlap most with this one's (Jaccard: titles
// in common over titles either watched, so it is not just whoever watches the most), sailing across the bow on
// the user's day with most of their shared titles in the week they overlapped most.
func (o others) twin(user int) *Creature {
	me, ok := o.people[user]
	if !ok {
		return nil
	}
	var best *person
	bestJ := 0.0
	var bestShared map[int]bool
	for _, id := range o.ranks {
		p := o.people[id]
		shared := map[int]bool{}
		for t := range me.minutes {
			if _, ok := p.minutes[t]; ok {
				shared[t] = true
			}
		}
		if id == user || len(shared) < TwinMin {
			continue
		}
		union := len(me.minutes) + len(p.minutes) - len(shared)
		j := float64(len(shared)) / float64(union)
		if best == nil || j > bestJ {
			best, bestJ, bestShared = p, j, shared
		}
	}
	if best == nil {
		return nil
	}
	// The title they both watched most of
	t, most := -1, -1.0
	for s := range bestShared {
		both := math.Min(me.minutes[s], best.minutes[s])
		if both > most || (both == most && s > t) {
			t, most = s, both
		}
	}
	// The week they overlapped most, and in it the user's day with most of those titles
	weekly := func(days map[int]map[int]bool) map[int]map[int]bool {
		out := map[int]map[int]bool{}
		for d, ts := range days {
			if out[d/7] == nil {
				out[d/7] = map[int]bool{}
			}
			for t := range ts {
				out[d/7][t] = true
			}
		}
		return out
	}
	a, b := weekly(me.days), weekly(best.days)
	week, overlap := 0, -1
	for k, ts := range a {
		n := 0
		for t := range ts {
			if b[k][t] && bestShared[t] {
				n++
			}
		}
		if n > overlap || (n == overlap && k < week) {
			week, overlap = k, n
		}
	}
	day, most2 := 0, -1
	for d, ts := range me.days {
		if d/7 != week {
			continue
		}
		n := 0
		for t := range ts {
			if a[week][t] && b[week][t] {
				n++
			}
		}
		if n > most2 || (n == most2 && d < day) {
			day, most2 = d, n
		}
	}
	pct := int(math.RoundToEven(bestJ * 100))
	return &Creature{Kind: "twin", T: &t, Day: day, N: float64(len(bestShared)), User: best.account, Pct: &pct}
}

// sightings are the sea creatures, each standing for something in the account's year: one creature per title at
// most, then the milestones (which stand for the year, or another viewer), spaced out at sea.
func sightings(marks []Mark, isMovie func(int) bool, solo map[int]bool, lastDay int,
	metadata func(int) (models.PlexMetadata, bool), milestones []Creature, charted []chart, startTs int64, eggs []int) []Creature {
	episodes := func(t int) int {
		if m, ok := metadata(t); ok {
			return m.Episodes
		}
		return 0
	}
	ref := func(t int) *int { return &t }
	var shows []Mark
	for _, m := range marks {
		if !isMovie(m.T) {
			shows = append(shows, m)
		}
	}
	var out []Creature
	// The kraken: the most episodes of one show in a day
	var binge *Mark
	for i := range shows {
		if binge == nil || shows[i].BestDay > binge.BestDay || (shows[i].BestDay == binge.BestDay && shows[i].Hours > binge.Hours) {
			binge = &shows[i]
		}
	}
	taken := -1
	if binge != nil && binge.BestDay >= 4 {
		out = append(out, Creature{Kind: "kraken", T: ref(binge.T), Day: binge.BestAt, N: float64(binge.BestDay)})
		taken = binge.T
	}
	// The sea serpent: the most days in a row with one show
	var run *Mark
	for i := range shows {
		m := &shows[i]
		if m.Streak == 0 || m.T == taken {
			continue
		}
		if run == nil || m.Streak > run.Streak || (m.Streak == run.Streak && m.Hours > run.Hours) {
			run = m
		}
	}
	if run != nil && run.Streak >= 4 {
		out = append(out, Creature{Kind: "serpent", T: ref(run.T), Day: *run.StreakAt, N: float64(run.Streak)})
	}
	// Whales: long series seen end to end
	var done []Mark
	for _, m := range shows {
		if n := episodes(m.T); n >= LeviathanEpisodes && float64(m.Distinct) >= 0.95*float64(n) {
			done = append(done, m)
		}
	}
	sort.SliceStable(done, func(i, j int) bool { return episodes(done[i].T) > episodes(done[j].T) })
	for i, m := range done {
		if i == 2 {
			break
		}
		of := episodes(m.T)
		out = append(out, Creature{Kind: "whale", T: ref(m.T), Day: m.LastNew, N: float64(m.Distinct), Of: &of})
	}
	// First to chart it: the new title the most others followed the account to
	var firstChart *chart
	for i := range charted {
		c := &charted[i]
		added := int64(0)
		if m, ok := metadata(c.t); ok {
			added = m.AddedAt
		}
		if c.followers < ChartFollowers || added < startTs {
			continue
		}
		if firstChart == nil || c.followers > firstChart.followers || (c.followers == firstChart.followers && c.day < firstChart.day) {
			firstChart = c
		}
	}
	if firstChart != nil {
		out = append(out, Creature{Kind: "chart", T: ref(firstChart.t), Day: firstChart.day, N: float64(firstChart.followers)})
	}
	// Wrecks: shows left part-way and not picked up again
	var left []Mark
	for _, m := range shows {
		n := episodes(m.T)
		if m.Plays >= 4 && m.Last <= lastDay-LeftDays && n > 0 && float64(m.Plays) < LeftShare*float64(n) {
			left = append(left, m)
		}
	}
	sort.SliceStable(left, func(i, j int) bool { return left[i].Hours > left[j].Hours })
	for i, m := range left {
		if i == 4 {
			break
		}
		of := episodes(m.T)
		out = append(out, Creature{Kind: "wreck", T: ref(m.T), Day: m.Last, N: float64(m.Plays), Of: &of})
	}
	// Ghost ships: nobody else on the server watched it
	var alone []Mark
	for _, m := range marks {
		if solo[m.T] && m.Hours >= 1 {
			alone = append(alone, m)
		}
	}
	sort.SliceStable(alone, func(i, j int) bool { return alone[i].Hours > alone[j].Hours })
	for i, m := range alone {
		if i == 3 {
			break
		}
		out = append(out, Creature{Kind: "ghost", T: ref(m.T), Day: m.Peak, N: m.Hours})
	}

	seen := map[int]bool{}
	var unique []Creature
	for _, c := range out {
		if !seen[*c.T] {
			seen[*c.T] = true
			unique = append(unique, c)
		}
	}
	unique = append(unique, milestones...)
	// Crew's-eye shots for the one-offs and achievements, and for the first wreck and the first ghost ship met; the
	// rest of those are sailed past with a highlighted card
	firsts := map[string]int{}
	for _, kind := range []string{"wreck", "ghost"} {
		firsts[kind] = -1
		for i, c := range unique {
			if c.Kind == kind && (firsts[kind] < 0 || c.Day < unique[firsts[kind]].Day) {
				firsts[kind] = i
			}
		}
	}
	for i := range unique {
		unique[i].Tier = "loud"
		if cine[unique[i].Kind] || firsts[unique[i].Kind] == i {
			unique[i].Tier = "cine"
		}
	}
	return spaceOut(unique, lastDay, eggs)
}

// spaceOut keeps sightings from clashing: placed in priority order, one too close to one already placed moves to
// the first clear day after it within two weeks (or, failing that, before it), since a card telling of something
// already done reads fine a few days on. Its card keeps the true day; At is where it sits. Easter eggs are fixed
// to their dates, so they're placed first and creatures keep their distance from them.
func spaceOut(found []Creature, lastDay int, eggs []int) []Creature {
	type spot struct {
		egg  bool
		at   int
		cine bool
		c    *Creature
	}
	rank := func(kind string) int {
		for i, k := range priority {
			if k == kind {
				return i
			}
		}
		return len(priority)
	}
	var placed []spot
	for _, d := range eggs {
		placed = append(placed, spot{egg: true, at: d})
	}
	ordered := make([]Creature, len(found))
	copy(ordered, found)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ri, rj := rank(ordered[i].Kind), rank(ordered[j].Kind); ri != rj {
			return ri < rj
		}
		return ordered[i].Day < ordered[j].Day
	})
	moves := make([]int, 0, 29)
	for m := 0; m < 15; m++ {
		moves = append(moves, m)
	}
	for m := -1; m > -15; m-- {
		moves = append(moves, m)
	}
	var result []spot
	for i := range ordered {
		c := &ordered[i]
		isCine := c.Tier == "cine"
		gap := func(o spot) int {
			if o.egg {
				return eggClear[isCine]
			}
			n := 0
			if isCine {
				n++
			}
			if o.cine {
				n++
			}
			return clearDays[n]
		}
		for _, move := range moves {
			candidate := c.Day + move
			if candidate < 0 || candidate > lastDay {
				continue
			}
			clear := true
			for _, o := range placed {
				if abs(candidate-o.at) < gap(o) {
					clear = false
					break
				}
			}
			if clear {
				if move != 0 {
					c.At = &candidate
				}
				break
			}
		}
		// Nowhere clear: it stays on its day
		s := spot{at: c.Day, cine: isCine, c: c}
		if c.At != nil {
			s.at = *c.At
		}
		placed = append(placed, s)
		result = append(result, s)
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].at < result[j].at })
	out := make([]Creature, 0, len(result))
	for _, s := range result {
		out = append(out, *s.c)
	}
	return out
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// pick is the voyage's titles: the top films and the top shows by hours, most hours first.
func pick(marks []Mark, isMovie func(int) bool) []Mark {
	var films, shows []Mark
	for _, m := range marks {
		if isMovie(m.T) && len(films) < Films {
			films = append(films, m)
		}
	}
	for _, m := range marks {
		if !isMovie(m.T) && len(shows) < Posters-len(films) {
			shows = append(shows, m)
		}
	}
	picked := append(films, shows...)
	sort.SliceStable(picked, func(i, j int) bool { return picked[i].Hours > picked[j].Hours })
	return picked
}
