package modules

import "testing"

func TestOtherUserNamer(t *testing.T) {
	for mode, want := range map[string]string{
		"plex_username": "plexuser",
		"friendly_name": "Friendly",
		// An unknown or empty setting shows as "Plex username" in the admin's dropdown, so it names users that way
		"":         "plexuser",
		"username": "plexuser",
	} {
		if name, id := newOtherUserNamer(mode).name(7, "plexuser", "Friendly"); name != want || id != 7 {
			t.Errorf("mode %q: got %q, %d; want %q, 7", mode, name, id, want)
		}
	}
	namer := newOtherUserNamer("obfuscate")
	first, id := namer.name(7, "plexuser", "Friendly")
	if first == "plexuser" || first == "Friendly" || id != 0 {
		t.Fatalf("obfuscated: got %q, %d", first, id)
	}
	if again, _ := namer.name(7, "plexuser", "Friendly"); again != first {
		t.Fatalf("the same user is named the same way within a reply: %q, %q", first, again)
	}
}
