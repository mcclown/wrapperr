package files

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/aunefyren/wrapperr/models"
)

var metadataPath, _ = filepath.Abs("./config/metadata.json")

// metadataMu serialises changes to metadata.json and keeps reads apart from them (on Windows a file being read
// can't be replaced)
var metadataMu sync.RWMutex

// MetadataKey is the key of a title in metadata.json: its Tautulli server hash and Plex rating key.
func MetadataKey(serverHash string, ratingKey int) string {
	return fmt.Sprintf("%s_%d", serverHash, ratingKey)
}

// GetMetadata reads metadata.json; a missing file is an empty cache.
func GetMetadata() (map[string]models.PlexMetadata, error) {
	metadataMu.RLock()
	defer metadataMu.RUnlock()
	return getMetadata()
}

func getMetadata() (map[string]models.PlexMetadata, error) {
	metadata := map[string]models.PlexMetadata{}
	file, err := os.ReadFile(metadataPath)
	if errors.Is(err, os.ErrNotExist) {
		return metadata, nil
	} else if err != nil {
		return metadata, err
	}
	if err := json.Unmarshal(file, &metadata); err != nil {
		return map[string]models.PlexMetadata{}, err
	}
	return metadata, nil
}

// UpdateMetadata merges entries into metadata.json, with no other change in between. The file is replaced in one
// step, so a reader never sees half of it.
func UpdateMetadata(entries map[string]models.PlexMetadata) error {
	if len(entries) == 0 {
		return nil
	}
	metadataMu.Lock()
	defer metadataMu.Unlock()
	metadata, err := getMetadata()
	if err != nil {
		return err
	}
	for key, entry := range entries {
		metadata[key] = entry
	}
	file, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	temp := metadataPath + ".tmp"
	if err := os.WriteFile(temp, file, 0644); err != nil {
		return err
	}
	if err := os.Rename(temp, metadataPath); err != nil {
		os.Remove(temp)
		return err
	}
	return nil
}
