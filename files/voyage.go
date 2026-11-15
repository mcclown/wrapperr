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

// voyageMusicUpload is the name an uploaded music file is saved under, with its own extension
const voyageMusicUpload = "voyage-music"

// VoyageMusicExtension is the extension of a voyage music file name in lower case, if it is one the voyage can play
func VoyageMusicExtension(name string) (string, bool) {
	extension := strings.ToLower(filepath.Ext(name))
	_, ok := voyageMusicTypes[extension]
	return extension, ok
}

// SaveVoyageMusic writes an uploaded music file to config/voyage/ as voyage-music with its extension and returns
// the name it was saved under. It writes to a temporary file first, so a failed upload leaves the music as it was.
func SaveVoyageMusic(extension string, upload io.Reader) (string, error) {
	if _, ok := voyageMusicTypes[extension]; !ok {
		return "", errors.New("not a voyage music file type")
	}
	if err := os.MkdirAll(voyageMusicDir, 0755); err != nil {
		return "", err
	}
	file, err := os.CreateTemp(voyageMusicDir, ".upload-*")
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(file, upload); err != nil {
		file.Close()
		os.Remove(file.Name())
		return "", err
	}
	if err := file.Close(); err != nil {
		os.Remove(file.Name())
		return "", err
	}
	name := voyageMusicUpload + extension
	if err := os.Rename(file.Name(), filepath.Join(voyageMusicDir, name)); err != nil {
		os.Remove(file.Name())
		return "", err
	}
	return name, nil
}

// voyageMusicMu takes music uploads and removals one at a time, so two can't delete each other's file
var voyageMusicMu sync.Mutex

// SetVoyageMusicUpload saves an uploaded music file and makes it the voyage's music. The settings name the new
// file before earlier uploads are deleted, so if they can't be saved the music stays as it was.
func SetVoyageMusicUpload(extension string, upload io.Reader) (string, error) {
	voyageMusicMu.Lock()
	defer voyageMusicMu.Unlock()
	config, err := GetConfig()
	if err != nil {
		return "", err
	}
	name, err := SaveVoyageMusic(extension, upload)
	if err != nil {
		return "", err
	}
	previous := config.VoyageMusic
	config.VoyageMusic = name
	if err := SaveConfig(config); err != nil {
		if name != previous {
			os.Remove(filepath.Join(voyageMusicDir, name))
		}
		return "", err
	}
	RemoveVoyageMusicUploads(name)
	return name, nil
}

// ClearVoyageMusic turns the voyage's music off and deletes uploaded music (a file put in config/voyage/ by hand
// stays).
func ClearVoyageMusic() error {
	voyageMusicMu.Lock()
	defer voyageMusicMu.Unlock()
	config, err := GetConfig()
	if err != nil {
		return err
	}
	config.VoyageMusic = ""
	if err := SaveConfig(config); err != nil {
		return err
	}
	RemoveVoyageMusicUploads("")
	return nil
}

// RemoveVoyageMusicUploads deletes uploaded music files other than keep (all of them when keep is ""). Files an
// admin put in config/voyage/ by hand are left alone.
func RemoveVoyageMusicUploads(keep string) {
	for extension := range voyageMusicTypes {
		name := voyageMusicUpload + extension
		if name == keep {
			continue
		}
		if err := os.Remove(filepath.Join(voyageMusicDir, name)); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Println("Failed to remove an earlier voyage music upload. Error: " + err.Error())
		}
	}
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
