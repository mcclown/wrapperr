package routes

import (
	"crypto/sha256"
	"encoding/base64"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestVoyagePagePolicy(t *testing.T) {
	// The page as it ships: its import map is allowed by hash, not by allowing every inline script
	policy := VoyagePagePolicy(filepath.Join("..", "web", "voyage", "index.html"))
	if strings.Contains(policy, "unsafe-inline'; style") || !strings.Contains(policy, "script-src 'self' 'sha256-") {
		t.Fatalf("policy %q", policy)
	}
	for _, want := range []string{"connect-src 'self' blob:", "frame-ancestors 'none'", "default-src 'self'"} {
		if !strings.Contains(policy, want) {
			t.Errorf("policy has no %s", want)
		}
	}
	if regexp.MustCompile(`https?:`).MatchString(policy) {
		t.Errorf("the voyage page loads nothing from other sites: %s", policy)
	}

	page := filepath.Join(t.TempDir(), "index.html")
	os.WriteFile(page, []byte(`<head><script type="importmap">{"imports": {}}</script></head>`), 0644)
	sum := sha256.Sum256([]byte(`{"imports": {}}`))
	if !strings.Contains(VoyagePagePolicy(page), "'sha256-"+base64.StdEncoding.EncodeToString(sum[:])+"'") {
		t.Fatal("the hash is of the import map's text")
	}
	if !strings.Contains(VoyagePagePolicy(filepath.Join(t.TempDir(), "missing.html")), "script-src 'self' 'unsafe-inline'") {
		t.Fatal("without the page, inline scripts are allowed rather than the page breaking")
	}
}
