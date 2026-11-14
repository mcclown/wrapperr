package modules

import (
	"reflect"
	"testing"
	"time"

	"github.com/aunefyren/wrapperr/models"
)

func TestCompareYear(t *testing.T) {
	at := func(date string) int {
		parsed, _ := time.Parse(time.RFC3339, date)
		return int(parsed.Unix())
	}
	config := models.WrapperrConfig{WrappedStart: at("2026-01-01T00:00:00Z"), WrappedEnd: at("2026-12-31T23:59:59Z")}
	day := models.WrapperrDay{Data: []models.TautulliEntry{
		{UserID: 1, MediaType: "movie", Year: 2020, Duration: 6000, Date: at("2026-02-01T20:00:00Z")},
		{UserID: 2, MediaType: "movie", Year: 2021, Duration: 7000, Date: at("2026-02-01T20:00:00Z")},
		{UserID: 1, MediaType: "movie", Year: 2020, Duration: 200, Date: at("2026-02-02T20:00:00Z")}, // under five minutes
		{UserID: 1, MediaType: "movie", Duration: 6000, Date: at("2026-02-03T20:00:00Z")},            // no year
		{UserID: 1, MediaType: "episode", Duration: 1500, Date: at("2026-03-01T20:00:00Z")},
		{UserID: 2, MediaType: "track", Duration: 180, Date: at("2026-03-01T20:00:00Z")},
		{UserID: 1, MediaType: "episode", Duration: 1500, Date: at("2025-12-31T20:00:00Z")}, // before the period
	}}

	user, server := compareYear([]models.WrapperrDay{day}, config, 1)
	if want := (models.WrapperrCompareYear{Year: 2026, MovieDuration: 6000, MoviePlays: 1, ShowDuration: 1500, ShowPlays: 1}); user != want {
		t.Errorf("user got %+v, want %+v", user, want)
	}
	if want := (models.WrapperrCompareYear{Year: 2026, MovieDuration: 13000, MoviePlays: 2, ShowDuration: 1500, ShowPlays: 1}); server != want {
		t.Errorf("server got %+v, want %+v", server, want)
	}

	// Last year's period is the same dates a year earlier, and counts the play before this year's period
	user, _ = compareYear([]models.WrapperrDay{day}, lastYearConfig(config), 1)
	if want := (models.WrapperrCompareYear{Year: 2025, ShowDuration: 1500, ShowPlays: 1}); user != want {
		t.Errorf("last year got %+v, want %+v", user, want)
	}
}

func TestLastYearCached(t *testing.T) {
	local := func(year int, month time.Month, day int) int {
		return int(time.Date(year, month, day, 0, 0, 0, 0, time.Local).Unix())
	}
	config := models.WrapperrConfig{
		WrappedStart:   local(2025, 1, 1),
		WrappedEnd:     local(2025, 1, 3) + 86399,
		TautulliConfig: []models.TautulliConfig{{TautulliName: "a"}},
	}
	day := func(date string, complete bool, servers ...string) models.WrapperrDay {
		return models.WrapperrDay{Date: date, DataComplete: complete, TautulliServers: servers}
	}

	full := []models.WrapperrDay{day("2025-01-01", true, "a"), day("2025-01-02", true, "a"), day("2025-01-03", true, "a")}
	if !lastYearCached(full, config) {
		t.Error("expected every day cached")
	}
	for name, cache := range map[string][]models.WrapperrDay{
		"a missing day":     full[:2],
		"an unfinished day": {full[0], full[1], day("2025-01-03", false, "a")},
		"a missing server":  {full[0], full[1], day("2025-01-03", true, "b")},
	} {
		if lastYearCached(cache, config) {
			t.Errorf("expected %s to leave last year short", name)
		}
	}
}

func TestLastYearLeaderboard(t *testing.T) {
	at := func(date string) int {
		parsed, _ := time.Parse(time.RFC3339, date)
		return int(parsed.Unix())
	}
	config := models.WrapperrConfig{WrappedStart: at("2026-01-01T00:00:00Z"), WrappedEnd: at("2026-12-31T23:59:59Z")}
	config.WrapperrCustomize.GetYearStatsLeaderboard = true
	config.WrapperrCustomize.GetYearStatsMovies = true
	config.WrapperrCustomize.GetYearStatsShows = true
	lastYear := []models.WrapperrDay{{Data: []models.TautulliEntry{
		{UserID: 1, MediaType: "episode", Duration: 3000, Date: at("2025-03-01T20:00:00Z")},
		{UserID: 2, MediaType: "movie", Year: 2020, Duration: 3000, Date: at("2025-03-01T20:00:00Z")},
		{UserID: 3, MediaType: "episode", Duration: 1000, Date: at("2025-03-01T20:00:00Z")},
		{UserID: 3, MediaType: "episode", Duration: 1000, Date: at("2025-03-02T20:00:00Z")},
		{UserID: 4, MediaType: "track", Duration: 9000, Date: at("2025-03-01T20:00:00Z")}, // music statistics off
	}}}

	ranks := lastYearLeaderboard(config, lastYear)
	if want := map[int]int{1: 1, 2: 1, 3: 3}; !reflect.DeepEqual(ranks.duration, want) {
		t.Errorf("by time got %v, want %v", ranks.duration, want)
	}
	if want := map[int]int{3: 1, 1: 2, 2: 2}; !reflect.DeepEqual(ranks.plays, want) {
		t.Errorf("by plays got %v, want %v", ranks.plays, want)
	}

	newcomer := models.WrapperrYearUserEntry{UserID: 5}
	ranks.set(&newcomer)
	if *newcomer.LastRankDuration != 0 || *newcomer.LastRankPlays != 0 {
		t.Errorf("a newcomer should have no place last year, got %+v", newcomer)
	}
	if lastYearLeaderboard(config, nil) != nil {
		t.Error("expected no ranks without last year's plays")
	}
}

func TestSharedPlace(t *testing.T) {
	values := []int{9, 7, 7, 7, 3}
	want := []int{1, 2, 2, 2, 5}
	for index := range values {
		if got := sharedPlace(index, func(i int) int { return values[i] }); got != want[index] {
			t.Errorf("place of entry %d: got %d, want %d", index, got, want[index])
		}
	}
}
