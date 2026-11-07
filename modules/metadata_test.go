package modules

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/analysis"
)

// fakeMetadata answers get_metadata like Tautulli does, from replies by rating key; unknown keys get Tautulli's
// empty success. It counts the calls.
func fakeMetadata(t *testing.T, replies map[string]string, calls *int32) models.TautulliConfig {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(calls, 1)
		w.Header().Set("Content-Type", "application/json")
		data, ok := replies[r.URL.Query().Get("rating_key")]
		if !ok {
			data = `{}`
		}
		w.Write([]byte(`{"response":{"result":"success","message":null,"data":` + data + `}}`))
	}))
	t.Cleanup(server.Close)
	u, _ := url.Parse(server.URL)
	host, port, _ := net.SplitHostPort(u.Host)
	portNumber, _ := strconv.Atoi(port)
	return models.TautulliConfig{TautulliName: "fake", TautulliIP: host, TautulliPort: portNumber, TautulliApiKey: "test"}
}

// As Tautulli sends them: numbers as strings, and a show's children_count is its episodes
const (
	movieMetadata = `{"rating_key":"10","media_type":"movie","year":"2025","added_at":"1753481502","children_count":0,
		"rating":"6.1","audience_rating":"6.4","content_rating":"PG-13","genres":["Comedy","Sport"],
		"thumb":"/library/metadata/10/thumb/1790957743","art":"/library/metadata/10/art/1790957743","summary":"x"}`
	showMetadata = `{"rating_key":"30","media_type":"show","year":"2025","added_at":"1746568629","children_count":18,
		"rating":"","audience_rating":"7.4","content_rating":"TV-MA","genres":null,
		"thumb":"/library/metadata/30/thumb/1","art":"/library/metadata/30/art/1"}`
)

func TestTautulliMetadata(t *testing.T) {
	var calls int32
	server := fakeMetadata(t, map[string]string{"10": movieMetadata, "30": showMetadata}, &calls)
	now := time.Unix(1_800_000_000, 0)

	movie, found, err := tautulliMetadata(server, 10, now)
	if err != nil || !found {
		t.Fatalf("movie: found %v, err %v", found, err)
	}
	if movie.MediaType != "movie" || movie.Year != 2025 || movie.AddedAt != 1753481502 || movie.Episodes != 0 ||
		movie.Rating != 6.1 || movie.AudienceRating != 6.4 || movie.ContentRating != "PG-13" || len(movie.Genres) != 2 ||
		movie.Art != "/library/metadata/10/art/1790957743" || movie.Checked != now.Unix() {
		t.Fatalf("movie read as %+v", movie)
	}

	show, _, _ := tautulliMetadata(server, 30, now)
	if show.Episodes != 18 || show.Rating != 0 || show.AudienceRating != 7.4 || show.Genres == nil {
		t.Fatalf("show read as %+v", show)
	}

	gone, found, err := tautulliMetadata(server, 99, now)
	if err != nil || found || !gone.Missing || gone.Checked != now.Unix() {
		t.Fatalf("unknown key: %+v, found %v, err %v", gone, found, err)
	}
}

func TestMetadataWants(t *testing.T) {
	wants := metadataWants(days(
		models.TautulliEntry{MediaType: "movie", RatingKey: 10, TautulliServerHash: "s1", Date: 100},
		models.TautulliEntry{MediaType: "movie", RatingKey: 10, TautulliServerHash: "s1", Date: 300},
		models.TautulliEntry{MediaType: "episode", RatingKey: 31, GrandparentRatingKey: 30, TautulliServerHash: "s1", Date: 200},
		models.TautulliEntry{MediaType: "movie", RatingKey: 10, TautulliServerHash: "s2", Date: 50},
		models.TautulliEntry{MediaType: "track", RatingKey: 40, TautulliServerHash: "s1", Date: 50},
		models.TautulliEntry{MediaType: "episode", RatingKey: 41, TautulliServerHash: "s1", Date: 50}, // no show key
	))
	want := map[metadataWant]int64{{"s1", 10}: 300, {"s1", 30}: 200, {"s2", 10}: 50}
	if len(wants) != len(want) {
		t.Fatalf("wants %v, want %v", wants, want)
	}
	for k, v := range want {
		if wants[k] != v {
			t.Errorf("latest play of %v = %d, want %d", k, wants[k], v)
		}
	}
}

func TestMetadataStale(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	day := int64(24 * 60 * 60)
	checked := now.Unix() - 2*day
	cases := []struct {
		name     string
		entry    models.PlexMetadata
		cached   bool
		lastPlay int64
		want     bool
	}{
		{"not cached", models.PlexMetadata{}, false, 0, true},
		{"movie", models.PlexMetadata{MediaType: "movie", Checked: checked}, true, now.Unix(), false},
		{"show played since", models.PlexMetadata{MediaType: "show", Checked: checked}, true, checked + 1, true},
		{"show not played since", models.PlexMetadata{MediaType: "show", Checked: checked}, true, checked - 1, false},
		{"show checked today", models.PlexMetadata{MediaType: "show", Checked: now.Unix() - 60}, true, now.Unix(), false},
		{"missing, recent", models.PlexMetadata{Missing: true, Checked: now.Unix() - 29*day}, true, now.Unix(), false},
		{"missing, a month on", models.PlexMetadata{Missing: true, Checked: now.Unix() - 30*day}, true, now.Unix(), true},
	}
	for _, c := range cases {
		if got := metadataStale(c.entry, c.cached, c.lastPlay, now); got != c.want {
			t.Errorf("%s: stale %v, want %v", c.name, got, c.want)
		}
	}
}

func TestRefreshMetadata(t *testing.T) {
	saved := metadataPause
	metadataPause = 0
	defer func() { metadataPause = saved }()

	var calls int32
	server := fakeMetadata(t, map[string]string{"10": movieMetadata, "30": showMetadata}, &calls)
	hash := files.GetTautulliServerHash(server)
	now := time.Unix(1_800_000_000, 0)
	cached := map[string]models.PlexMetadata{}
	save := func(batch map[string]models.PlexMetadata) error {
		for k, v := range batch {
			cached[k] = v
		}
		return nil
	}
	wants := map[metadataWant]int64{{hash, 10}: 1, {hash, 30}: 1, {hash, 99}: 1, {"elsewhere", 5}: 1}

	fetched, err := refreshMetadata(wants, []models.TautulliConfig{server}, cached, save, now)
	if err != nil || fetched != 3 || calls != 3 {
		t.Fatalf("first refresh: fetched %d with %d calls, err %v; want 3 (a server not configured is skipped)", fetched, calls, err)
	}
	if !cached[files.MetadataKey(hash, 99)].Missing || cached[files.MetadataKey(hash, 30)].Episodes != 18 {
		t.Fatalf("cached %+v", cached)
	}

	// Nothing is stale an hour later
	fetched, _ = refreshMetadata(wants, []models.TautulliConfig{server}, cached, save, now.Add(time.Hour))
	if fetched != 0 || calls != 3 {
		t.Fatalf("second refresh fetched %d, want 0", fetched)
	}

	// A server that doesn't answer is skipped after its first failure
	down := server
	down.TautulliPort = 1
	downHash := files.GetTautulliServerHash(down)
	calls = 0
	fetched, err = refreshMetadata(map[metadataWant]int64{{downHash, 1}: 1, {downHash, 2}: 1}, []models.TautulliConfig{down}, cached, save, now)
	if err != nil || fetched != 0 {
		t.Fatalf("a failing server: fetched %d, err %v", fetched, err)
	}
}

func TestTitleMetadata(t *testing.T) {
	metadata := map[string]models.PlexMetadata{
		files.MetadataKey("s1", 20): {Missing: true},
		files.MetadataKey("s1", 10): {MediaType: "movie", Year: 2020},
	}
	title := analysis.Title{Keys: []analysis.Key{{Server: "s1", RatingKey: 20}, {Server: "s1", RatingKey: 10}}}
	entry, key, ok := TitleMetadata(metadata, title)
	if !ok || entry.Year != 2020 || key.RatingKey != 10 {
		t.Fatalf("TitleMetadata = %+v, %+v, %v; want the newest key Plex still knows", entry, key, ok)
	}
	if _, _, ok := TitleMetadata(metadata, analysis.Title{Keys: []analysis.Key{{Server: "s2", RatingKey: 10}}}); ok {
		t.Fatal("a key on another server should not match")
	}
}

func days(plays ...models.TautulliEntry) []models.WrapperrDay {
	return []models.WrapperrDay{{Date: "2026-01-01", Data: plays}}
}
