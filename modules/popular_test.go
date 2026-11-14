package modules

import (
	"testing"

	"github.com/aunefyren/wrapperr/models"
)

func TestMostPopular(t *testing.T) {
	viewers := map[int]map[int]bool{}
	// A: watched three times by one user; B: once each by two users; C: once by two users, then again
	for _, play := range [][2]int{{0, 1}, {0, 1}, {0, 1}, {1, 1}, {1, 2}, {2, 1}, {2, 2}, {2, 2}} {
		addYearViewer(viewers, play[0], play[1])
	}
	entries := []models.TautulliEntry{{Title: "A", Plays: 3}, {Title: "B", Plays: 2}, {Title: "C", Plays: 3}}
	for index, users := range viewers {
		entries[index].Viewers = len(users)
	}

	got := mostPopular(entries, 2)
	if len(got) != 2 || got[0].Title != "C" || got[0].Viewers != 2 || got[1].Title != "B" {
		t.Errorf("expected C then B (two viewers each, C played more), got %+v", got)
	}
	if entries[0].Title != "A" {
		t.Errorf("expected the original order to be kept, got %+v", entries)
	}
}

func TestTakeNewerPlay(t *testing.T) {
	movie := models.TautulliEntry{Date: 100, RatingKey: 1, Thumb: "/library/metadata/1/thumb/1"}
	takeNewerPlay(&movie, models.TautulliEntry{Date: 200, RatingKey: 2, Thumb: "/library/metadata/2/thumb/2"}, false)
	takeNewerPlay(&movie, models.TautulliEntry{Date: 150, RatingKey: 1, Thumb: "/library/metadata/1/thumb/1"}, false)
	if movie.RatingKey != 2 || movie.Thumb != "/library/metadata/2/thumb/2" || movie.Date != 200 {
		t.Errorf("movie took %d %s at %d, want the newest play's key 2", movie.RatingKey, movie.Thumb, movie.Date)
	}

	show := models.TautulliEntry{Date: 100, RatingKey: 10, GrandparentRatingKey: 10, Thumb: "/library/metadata/10/thumb"}
	takeNewerPlay(&show, models.TautulliEntry{Date: 200, RatingKey: 31, GrandparentRatingKey: 30}, true)
	if show.RatingKey != 30 || show.GrandparentRatingKey != 30 || show.Thumb != "/library/metadata/30/thumb" {
		t.Errorf("show took %d %d %s, want the newest play's show 30", show.RatingKey, show.GrandparentRatingKey, show.Thumb)
	}
}
