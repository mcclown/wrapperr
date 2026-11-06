package modules

import (
	"errors"
	"log"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
)

func UsersSaveUserEntry(newUser models.WrapperrUser) (err error) {
	err = files.UpdateUsers(func(users []models.WrapperrUser) ([]models.WrapperrUser, error) {
		var userFound = false
		var userIndex = 0
		for index, user := range users {
			if user.UserID == newUser.UserID || user.User == newUser.User {
				userFound = true
				userIndex = index
			}
		}

		if userFound {
			users[userIndex].Wrappings = append(users[userIndex].Wrappings, newUser.Wrappings...)
		} else {
			users = append(users, newUser)
		}
		return users, nil
	})
	if err != nil {
		log.Println("Failed to save new users. Error: " + err.Error())
		return errors.New("Failed to save new users.")
	}

	return
}

func UsersGetUser(userID int) (user models.WrapperrUser, err error) {
	err = nil
	user = models.WrapperrUser{}

	users, err := files.GetUsers()
	if err != nil {
		log.Println("Failed to get users. Error: " + err.Error())
		return user, errors.New("Failed to get users.")
	}

	for _, foundUser := range users {
		if foundUser.UserID == userID {
			return foundUser, nil
		}
	}

	return user, errors.New("User not found.")
}

func UsersUpdateUser(userID int, FriendlyName string, userName string, Email string, Active bool, TautulliServers []string, Ignore bool) (err error) {
	errNotFound := errors.New("Failed to find user based on ID.")
	err = files.UpdateUsers(func(users []models.WrapperrUser) ([]models.WrapperrUser, error) {
		for index := range users {
			if users[index].UserID != userID {
				continue
			}
			users[index].Active = Active
			users[index].Email = Email
			users[index].FriendlyName = FriendlyName
			users[index].User = userName
			users[index].TautulliServers = TautulliServers
			users[index].Ignore = Ignore
			return users, nil
		}
		return users, errNotFound
	})
	if err == errNotFound {
		return err
	} else if err != nil {
		log.Println("Failed to save users. Error: " + err.Error())
		return errors.New("Failed to save users.")
	}

	return
}

func UsersGetIgnoredUserIDs() (users []int, err error) {
	err = nil
	users = []int{}

	foundUsers, err := files.GetUsers()
	if err != nil {
		log.Println("Failed to get users. Error: " + err.Error())
		return users, errors.New("Failed to get users.")
	}

	for _, foundUser := range foundUsers {
		if foundUser.Ignore {
			users = append(users, foundUser.UserID)
		}
	}

	return users, err
}
