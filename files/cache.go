package files

import (
	"encoding/json"
	"errors"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"

	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/utilities"
)

var cache_path, _ = filepath.Abs("./config/cache.json")

// Last year's plays, for the comparison with last year
var last_year_cache_path, _ = filepath.Abs("./config/cache_last_year.json")

// Saves the given config struct as cache.json
func SaveCache(cache *[]models.WrapperrDay) error {

	file, err := json.MarshalIndent(cache, "", "	")
	if err != nil {
		return err
	}

	err = ioutil.WriteFile(cache_path, file, 0644)
	if err != nil {
		return err
	}

	return nil
}

// Saves an empty cache, clearing any data present
func ClearCache() error {
	cache := []models.WrapperrDay{}

	err := SaveCache(&cache)
	if err != nil {
		return err
	}

	return nil
}

// Creates empty cache.json
func CreateCacheFile() error {

	var cache []models.WrapperrDay

	err := SaveCache(&cache)
	if err != nil {
		return err
	}

	return nil
}

// Read the cache file and return the file as an object
func GetCache() ([]models.WrapperrDay, error) {
	// Create cache.json if it doesn't exist
	if _, err := os.Stat(cache_path); errors.Is(err, os.ErrNotExist) {

		log.Println("Failed to load cache file.")

		err = CreateCacheFile()
		if err != nil {
			log.Println("Failed to create new cache file. Restarting Wrapperr.")
			err = utilities.RestartSelf()
			if err != nil {
				return nil, err
			}
		}
	}

	// Define cache
	var cache []models.WrapperrDay

	// Load cache file
	file, err := ioutil.ReadFile(cache_path)
	if err != nil {
		return nil, err
	}

	err = json.Unmarshal(file, &cache)
	if err != nil {
		return nil, err
	}

	// Return cache object
	return cache, nil
}

// Saves last year's plays
func SaveLastYearCache(cache *[]models.WrapperrDay) error {
	file, err := json.MarshalIndent(cache, "", "	")
	if err != nil {
		return err
	}
	return ioutil.WriteFile(last_year_cache_path, file, 0644)
}

// Reads last year's plays, which are empty until they have been downloaded
func GetLastYearCache() ([]models.WrapperrDay, error) {
	cache := []models.WrapperrDay{}
	file, err := ioutil.ReadFile(last_year_cache_path)
	if errors.Is(err, os.ErrNotExist) {
		return cache, nil
	} else if err != nil {
		return nil, err
	}

	err = json.Unmarshal(file, &cache)
	return cache, err
}
