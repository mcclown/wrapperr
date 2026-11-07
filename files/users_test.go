package files

import (
	"path/filepath"
	"sync"
	"testing"

	"github.com/aunefyren/wrapperr/models"
)

func TestUpdateUsersConcurrent(t *testing.T) {
	saved := usersPath
	usersPath = filepath.Join(t.TempDir(), "users.json")
	defer func() { usersPath = saved }()

	var wg sync.WaitGroup
	errs := make(chan error, 80)
	for i := 0; i < 40; i++ {
		wg.Add(2)
		go func(id int) {
			defer wg.Done()
			errs <- UpdateUsers(func(users []models.WrapperrUser) ([]models.WrapperrUser, error) {
				return append(users, models.WrapperrUser{UserID: id}), nil
			})
		}(i)
		go func() {
			defer wg.Done()
			_, err := GetUsers()
			errs <- err
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	users, err := GetUsers()
	if err != nil || len(users) != 40 {
		t.Fatalf("%d users, err %v; want all 40 changes kept", len(users), err)
	}
}
