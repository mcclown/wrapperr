package modules

import (
	"strings"
	"time"

	"github.com/goombaio/namegenerator"
)

// Decides how other users are named in a wrapped reply, based on the
// obfuscate_other_users setting. Obfuscated names are remembered per user ID so
// the same user gets the same random name everywhere in one reply.
type otherUserNamer struct {
	mode      string
	generator namegenerator.Generator
	catalog   map[int]string
}

func newOtherUserNamer(mode string) *otherUserNamer {
	return &otherUserNamer{
		mode:      mode,
		generator: namegenerator.NewNameGenerator(time.Now().UTC().UnixNano()),
		catalog:   map[int]string{},
	}
}

// Returns the name to display for another user and the user ID that is safe to
// expose alongside it (0 when the user is obfuscated).
func (namer *otherUserNamer) name(userID int, plexUsername string, friendlyName string) (string, int) {
	switch namer.mode {
	case "friendly_name":
		return friendlyName, userID
	case "obfuscate":
		if userID == 0 {
			return "Managed user", 0
		}
		if name, found := namer.catalog[userID]; found {
			return name, 0
		}

		// Try to improve random name
		nameParts := strings.Split(namer.generator.Generate(), "-")
		name := strings.Title(nameParts[0]) + " " + strings.Title(nameParts[1])
		namer.catalog[userID] = name
		return name, 0
	default:
		// "plex_username", and any value the setting doesn't know: the admin's dropdown shows an unknown value as
		// "Plex username" (its first option), and before this helper the top users list kept the Plex username too
		return plexUsername, userID
	}
}
