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
