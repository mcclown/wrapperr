package middlewares

import (
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/aunefyren/wrapperr/models"
)

func TestNoSessionIsAnError(t *testing.T) {
	for _, header := range []string{"", "Token abc", "Digest x"} {
		if _, status, err := AuthGetPayloadFromAuthorization(header, models.WrapperrConfig{PlexAuth: true}, models.AdminConfig{}); err == nil || status != http.StatusUnauthorized {
			t.Errorf("Authorization %q: status %d, err %v; want 401", header, status, err)
		}
	}
}

func TestBasicAuthOnlyWhenEnabled(t *testing.T) {
	basic := "Basic " + base64.StdEncoding.EncodeToString([]byte("admin:password"))
	// With basic_auth off the credentials are refused without being checked
	if _, status, err := AuthGetPayloadFromAuthorization(basic, models.WrapperrConfig{}, models.AdminConfig{}); err == nil || status != http.StatusUnauthorized {
		t.Fatalf("basic_auth off: status %d, err %v, want 401", status, err)
	}
	// The scheme is matched in any case
	lower := "basic " + base64.StdEncoding.EncodeToString([]byte("admin"))
	if _, status, _ := AuthGetPayloadFromAuthorization(lower, models.WrapperrConfig{BasicAuth: true}, models.AdminConfig{}); status != http.StatusBadRequest {
		t.Fatalf("lower-case scheme: status %d, want 400 (no colon), not a missing scheme", status)
	}
	// A header with no colon used to panic
	noColon := "Basic " + base64.StdEncoding.EncodeToString([]byte("admin"))
	if _, status, err := AuthGetPayloadFromAuthorization(noColon, models.WrapperrConfig{BasicAuth: true}, models.AdminConfig{}); err == nil || status != http.StatusBadRequest {
		t.Fatalf("no colon: status %d, err %v, want 400", status, err)
	}
}
