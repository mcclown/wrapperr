package routes

import (
	"testing"

	"github.com/aunefyren/wrapperr/modules/voyage"
)

func TestHideTwin(t *testing.T) {
	cached := voyage.Document{Voyages: []voyage.Voyage{{Creatures: []voyage.Creature{
		{Kind: "whale"},
		{Kind: "twin", User: "plexuser"},
	}}}}
	shared := hideTwin(cached, "gentle-otter")
	if got := shared.Voyages[0].Creatures[1].User; got != "Gentle Otter" {
		t.Errorf("the shared twin is named %q, want %q", got, "Gentle Otter")
	}
	if got := shared.Voyages[0].Creatures[0].User; got != "" {
		t.Errorf("a creature that isn't the twin was named %q", got)
	}
	if got := cached.Voyages[0].Creatures[1].User; got != "plexuser" {
		t.Errorf("the cached document was changed: its twin is now %q", got)
	}
}
