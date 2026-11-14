package modules

import (
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
		{UserID: 1, MediaType: "movie", Duration: 6000, Date: at("2026-02-01T20:00:00Z")},
		{UserID: 2, MediaType: "movie", Duration: 7000, Date: at("2026-02-01T20:00:00Z")},
		{UserID: 1, MediaType: "movie", Duration: 200, Date: at("2026-02-02T20:00:00Z")}, // under five minutes
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
