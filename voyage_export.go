package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/modules"
)

// voyageExport is the voyage export command: an account's voyage as a static site, built from the play cache as the
// server last brought it up to date (open the voyage or the statistics in Wrapperr first for the latest plays). It
// returns the exit code.
func voyageExport(args []string) int {
	flags := flag.NewFlagSet("wrapperr voyage export", flag.ContinueOnError)
	user := flags.String("user", "", "the Plex username whose voyage to export")
	out := flags.String("out", "", "the folder to write the site to (new or empty)")
	music := flags.String("music", "", "an audio file of your own to play as the voyage's music (optional; none is included without it)")
	flags.Usage = func() {
		fmt.Fprintln(flags.Output(), "Usage: wrapperr voyage export --user <Plex username> --out <folder> [--music <audio file>]")
		fmt.Fprintln(flags.Output(), "Run it from Wrapperr's folder (next to config/ and web/).")
		flags.PrintDefaults()
	}
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if *user == "" || *out == "" || flags.NArg() > 0 {
		flags.Usage()
		return 2
	}

	// Checked first, so a run from the wrong folder doesn't create a new config there
	if _, err := os.Stat(filepath.Join("config", "config.json")); err != nil {
		fmt.Fprintln(os.Stderr, "There is no config/config.json here: run the export from Wrapperr's folder.")
		return 1
	}
	// Read without writing it back: the server owns config.json, and an admin may be saving settings meanwhile
	config, err := files.LoadConfigReadOnly()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to load the configuration: "+err.Error())
		return 1
	}
	if configured, err := files.GetConfigState(); err != nil || !configured {
		fmt.Fprintln(os.Stderr, "Wrapperr is not configured yet.")
		return 1
	}
	if config.Timezone != "" {
		if zone, err := time.LoadLocation(config.Timezone); err == nil {
			time.Local = zone
		}
	}
	images, err := modules.ExportVoyage(*user, *out, *music, config)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to export the voyage: "+err.Error())
		return 1
	}
	fmt.Printf("Exported %s's voyage to %s with %d images.\n", *user, *out, images)
	fmt.Println("Serve the folder over HTTP to open it (browsers don't run its modules from a file:// page), for example: python -m http.server --directory " + *out)
	return 0
}
