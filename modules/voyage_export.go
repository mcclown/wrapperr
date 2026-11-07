package modules

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/voyage"
)

// voyagePage is the voyage page Wrapperr serves, which an export copies
const voyagePage = "web/voyage"

// voyageExportParts are what an export copies of the page: the page, its script, three.js, the fonts, the models
// and the sound effects, with their licences and credits. Not the mock scenes or the contract.
var voyageExportParts = []string{"index.html", "voyage.js", "vendor", "fonts", "models", "audio/sfx"}

// ExportVoyage writes an account's voyage as a static site in out, which must be empty or not exist yet: the page
// with the voyage.v1 document in it, and the posters and backdrops it shows under img/. The voyage is built from the
// play cache as the server last brought it up to date; the export only reads Wrapperr's files (apart from adding
// images to the poster cache), so it can run beside the server. Music is never included unless music names an
// audio file to copy in. If it fails part-way, out is left empty again.
func ExportVoyage(username string, out string, music string, config models.WrapperrConfig) (images int, err error) {
	if !config.UseCache {
		return 0, errors.New("the voyage needs the cache turned on")
	}
	if _, err := os.Stat(filepath.Join(voyagePage, "index.html")); err != nil {
		return 0, errors.New("the voyage page (web/voyage) isn't here: run the export from Wrapperr's folder")
	}
	user, err := exportUser(username)
	if err != nil {
		return 0, err
	}
	if music != "" {
		if files.VoyageMusicType(music) == "" {
			return 0, errors.New("the music must be an audio file (.m4a, .mp3, .ogg, .opus, .wav or .aac)")
		}
		if info, err := os.Stat(music); err != nil || !info.Mode().IsRegular() {
			return 0, fmt.Errorf("there is no music file at %s", music)
		}
	}
	if err := emptyFolder(out); err != nil {
		return 0, err
	}
	defer func() {
		if err != nil {
			clearFolder(out)
		}
	}()

	built, err := buildVoyage(user.UserID, config)
	if errors.Is(err, voyage.ErrNoSessions) {
		return 0, fmt.Errorf("%s has no plays to sail through in the period", user.User)
	} else if err != nil {
		// The server rewrites the play cache in place, so one read in the middle of a save can fail
		return 0, fmt.Errorf("%w (if the server was saving the play cache just then, run the export again)", err)
	}

	// The posters and backdrops, downloaded first if they aren't cached yet. A title whose image can't be had shows
	// without it, rather than the page asking for it again and again.
	have := map[string]bool{}
	if config.WrapperrCustomize.EnablePosters {
		if err := files.InitializePosterDirectories(config); err != nil {
			return 0, err
		}
		failed := map[string]int{}
		for _, image := range built.images {
			if have[image.File] || failed[image.Server] >= 3 {
				continue
			}
			from, err := cachedImage(image, config)
			if err != nil {
				// A server that can't be reached three times in a row is given up on, rather than waiting on each
				// image in turn. A title Plex has no image for any more is only that title.
				var unreachable *url.Error
				if errors.As(err, &unreachable) {
					failed[image.Server]++
				}
				log.Println("Failed to get an image for the export (" + image.File + "). Error: " + err.Error())
				continue
			}
			failed[image.Server] = 0
			if err := copyFile(from, filepath.Join(out, "img", filepath.FromSlash(image.File))); err != nil {
				return 0, err
			}
			have[image.File] = true
		}
	}
	document := built.document
	document.ImageBase = "img/"
	document.Titles = make([]voyage.Title, len(built.document.Titles))
	copy(document.Titles, built.document.Titles)
	for i := range document.Titles {
		if t := &document.Titles[i]; t.Poster != nil && !have[*t.Poster] {
			t.Poster = nil
		}
		if t := &document.Titles[i]; t.Art != nil && !have[*t.Art] {
			t.Art = nil
		}
	}

	for _, part := range voyageExportParts {
		from, to := filepath.Join(voyagePage, filepath.FromSlash(part)), filepath.Join(out, filepath.FromSlash(part))
		info, err := os.Stat(from)
		if err != nil {
			return 0, err
		}
		if info.IsDir() {
			err = os.CopyFS(to, os.DirFS(from))
		} else {
			err = copyFile(from, to)
		}
		if err != nil {
			return 0, err
		}
	}
	// No music file means no music: an empty VOYAGE_MUSIC tells the page not to look for one
	musicURL := ""
	if music != "" {
		musicURL = "audio/music" + strings.ToLower(filepath.Ext(music))
		if err := copyFile(music, filepath.Join(out, filepath.FromSlash(musicURL))); err != nil {
			return 0, err
		}
	}
	return len(have), writeExportPage(filepath.Join(out, "index.html"), document, musicURL)
}

// exportUser is the active account with this Plex username
func exportUser(username string) (models.WrapperrUser, error) {
	users, err := files.GetUsers()
	if err != nil {
		return models.WrapperrUser{}, err
	}
	for _, user := range users {
		if user.User == username {
			if !user.Active {
				return models.WrapperrUser{}, fmt.Errorf("%s is not active", username)
			}
			return user, nil
		}
	}
	return models.WrapperrUser{}, fmt.Errorf("no Plex user called %s (usernames are case-sensitive)", username)
}

// emptyFolder makes out, or checks it is empty, so an export never overwrites or mixes with anything
func emptyFolder(out string) error {
	entries, err := os.ReadDir(out)
	if errors.Is(err, fs.ErrNotExist) {
		return os.MkdirAll(out, 0755)
	} else if err != nil {
		return err
	}
	if len(entries) > 0 {
		return fmt.Errorf("%s is not empty: export into a new or empty folder", out)
	}
	return nil
}

// clearFolder empties out again after a failed export (it was new or empty before), so the export can simply be
// run again
func clearFolder(out string) {
	entries, _ := os.ReadDir(out)
	for _, entry := range entries {
		os.RemoveAll(filepath.Join(out, entry.Name()))
	}
}

// cachedImage is the poster cache's file for an image, downloading it first if it isn't there
func cachedImage(image voyage.Image, config models.WrapperrConfig) (string, error) {
	for _, server := range config.TautulliConfig {
		if files.GetTautulliServerHash(server) != image.Server {
			continue
		}
		if ok, path := files.PosterExists(server, image.Ref(), 0); ok {
			return path, nil
		}
		return files.DownloadPoster(server, image.Ref())
	}
	return "", errors.New("no Tautulli server for it")
}

// writeExportPage writes the page with the document set on it, ahead of the page's script
func writeExportPage(page string, document voyage.Document, musicURL string) error {
	raw, err := os.ReadFile(page)
	if err != nil {
		return err
	}
	// json.Marshal escapes <, > and &, so nothing in the document can close the script
	data, err := json.Marshal(document)
	if err != nil {
		return err
	}
	musicJSON, _ := json.Marshal(musicURL)
	const script = `<script type="module" src="voyage.js"></script>`
	if strings.Count(string(raw), script) != 1 {
		return errors.New("the voyage page's script tag wasn't found")
	}
	set := "<script>window.VOYAGE = " + string(data) + ";\nwindow.VOYAGE_MUSIC = " + string(musicJSON) + ";</script>\n"
	return os.WriteFile(page, []byte(strings.Replace(string(raw), script, set+script, 1)), 0644)
}

func copyFile(from string, to string) error {
	if err := os.MkdirAll(filepath.Dir(to), 0755); err != nil {
		return err
	}
	in, err := os.Open(from)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(to)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
