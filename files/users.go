package files

import (
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/aunefyren/wrapperr/models"
)

var usersPath, _ = filepath.Abs("./config/users.json")

// usersMu serialises changes to users.json, so two changes at once can't undo each other
var usersMu sync.Mutex

// Saves the given users struct as users.json. The file is replaced in one step, so a reader never sees half of it.
func SaveUsers(users []models.WrapperrUser) (err error) {
	err = nil

	file, err := json.MarshalIndent(users, "", "	")
	if err != nil {
		return err
	}

	temp := usersPath + ".tmp"
	if err = os.WriteFile(temp, file, 0644); err != nil {
		return err
	}
	if err = os.Rename(temp, usersPath); err != nil {
		os.Remove(temp)
		return err
	}

	return nil
}

// UpdateUsers reads users.json, lets change edit the users, and saves them, with no other UpdateUsers in between.
// When change returns an error nothing is saved.
func UpdateUsers(change func(users []models.WrapperrUser) ([]models.WrapperrUser, error)) error {
	usersMu.Lock()
	defer usersMu.Unlock()
	users, err := GetUsers()
	if err != nil {
		return err
	}
	users, err = change(users)
	if err != nil {
		return err
	}
	return SaveUsers(users)
}

// Creates empty users.json
func CreateUsersFile() error {
	var users []models.WrapperrUser

	err := SaveUsers(users)
	if err != nil {
		return err
	}

	return nil
}

// Read the users file and return the file as an object
func GetUsers() (users []models.WrapperrUser, err error) {
	users = []models.WrapperrUser{}
	err = nil

	// Create users.json if it doesn't exist
	if _, err := os.Stat(usersPath); errors.Is(err, os.ErrNotExist) {
		log.Println("Users file does not exist. Creating.")

		err = CreateUsersFile()
		if err != nil {
			return users, err
		}
	}

	// Load users file
	file, err := os.ReadFile(usersPath)
	if err != nil {
		return users, err
	}

	// Parse users file
	err = json.Unmarshal(file, &users)
	if err != nil {
		return users, err
	}
	if err != nil {
		return users, err
	}

	sort.Slice(users, func(i, j int) bool {
		return users[i].UserID < users[j].UserID
	})

	// Return users object
	return users, nil
}
