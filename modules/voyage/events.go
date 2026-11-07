package voyage

import (
	_ "embed"
	"encoding/json"
)

// DefaultEvents seeds config/voyage_events.json: 2026's world events (drafted from Wikipedia's "2026" article) and
// its dated easter eggs. Edit that file freely: date (YYYY-MM-DD), kind, headline and blurb for an event, with
// "pick": true for the one a month to show; date, kind and note for an egg.
//
//go:embed events_2026.json
var DefaultEvents []byte

// ParseEvents reads an events file.
func ParseEvents(data []byte) (Events, error) {
	events := Events{}
	if err := json.Unmarshal(data, &events); err != nil {
		return Events{}, err
	}
	if events.Events == nil {
		events.Events = []Dated{}
	}
	if events.Eggs == nil {
		events.Eggs = []Dated{}
	}
	return events, nil
}
