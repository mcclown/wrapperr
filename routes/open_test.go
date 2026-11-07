package routes

import "testing"

func TestVoyageFrontPage(t *testing.T) {
	for setting, want := range map[string]string{"": "voyage", "voyage": "voyage", "log": "log", "other": "voyage"} {
		if got := voyageFrontPage(setting); got != want {
			t.Errorf("voyageFrontPage(%q) = %q, want %q", setting, got, want)
		}
	}
}
