package middlewares

import (
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/aunefyren/wrapperr/models"
)

func TestBasicAuthOnlyWhenEnabled(t *testing.T) {
	basic := "Basic " + base64.StdEncoding.EncodeToString([]byte("admin:password"))
	// With basic_auth off the credentials are refused without being checked
	if _, status, err := AuthGetPayloadFromAuthorization(basic, models.WrapperrConfig{}, models.AdminConfig{}); err == nil || status != http.StatusUnauthorized {
		t.Fatalf("basic_auth off: status %d, err %v, want 401", status, err)
	}
	// A header with no colon used to panic
	noColon := "Basic " + base64.StdEncoding.EncodeToString([]byte("admin"))
	if _, status, err := AuthGetPayloadFromAuthorization(noColon, models.WrapperrConfig{BasicAuth: true}, models.AdminConfig{}); err == nil || status != http.StatusBadRequest {
		t.Fatalf("no colon: status %d, err %v, want 400", status, err)
	}
}
