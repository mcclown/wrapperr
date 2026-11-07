package files

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

var voyageEventsPath, _ = filepath.Abs("./config/voyage_events.json")

var voyageMusicDir, _ = filepath.Abs("./config/voyage")

// voyageMusicTypes are the audio files the voyage's music may be, as browsers play them
var voyageMusicTypes = map[string]string{".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg",
	".wav": "audio/wav", ".aac": "audio/aac"}

// VoyageMusicPath is where the voyage's music file (the voyage_music setting) is: a plain file name with an audio
// extension, in config/voyage/. None ships with Wrapperr. It reports false for any other name.
func VoyageMusicPath(name string) (string, bool) {
	if name == "" || name != filepath.Base(name) || strings.ContainsAny(name, `/\:`) || strings.HasPrefix(name, ".") {
		return "", false
	}
	if _, ok := voyageMusicTypes[strings.ToLower(filepath.Ext(name))]; !ok {
		return "", false
	}
	return filepath.Join(voyageMusicDir, name), true
}

// VoyageMusicType is the content type of a voyage music file.
func VoyageMusicType(name string) string {
	return voyageMusicTypes[strings.ToLower(filepath.Ext(name))]
}

var voyageEventsMu sync.Mutex

// GetVoyageEvents reads config/voyage_events.json, the voyage's world events and easter eggs, writing seed there
// first if it doesn't exist, so an admin can edit it.
func GetVoyageEvents(seed []byte) ([]byte, error) {
	voyageEventsMu.Lock()
	defer voyageEventsMu.Unlock()
	file, err := os.ReadFile(voyageEventsPath)
	if errors.Is(err, os.ErrNotExist) {
		log.Println("Voyage events file does not exist. Creating it from the built-in one.")
		if err := os.WriteFile(voyageEventsPath, seed, 0644); err != nil {
			return nil, err
		}
		return seed, nil
	}
	return file, err
}

// VoyageFileStamps changes when the files a voyage is built from that are only written when they change do: the
// Plex metadata, the events and the settings. The play cache is saved on every statistics request, so it is
// compared by content (CacheDigest) instead.
func VoyageFileStamps() string {
	var parts []string
	for _, path := range []string{metadataPath, voyageEventsPath, config_path} {
		info, err := os.Stat(path)
		if err != nil {
			parts = append(parts, "-")
			continue
		}
		parts = append(parts, strconv.FormatInt(info.ModTime().UnixNano(), 10)+":"+strconv.FormatInt(info.Size(), 10))
	}
	return strings.Join(parts, "|")
}

// CacheDigest is a hash of the play cache's contents.
func CacheDigest() (string, error) {
	file, err := os.Open(cache_path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
