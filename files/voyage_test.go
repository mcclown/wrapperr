package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVoyageMusicPath(t *testing.T) {
	for name, want := range map[string]bool{
		"theme.m4a": true, "Sea Shanty.MP3": true, "loop.ogg": true,
		"": false, "../config.json": false, "sub/theme.m4a": false, `..\theme.m4a`: false, "C:theme.m4a": false,
		".m4a": false, "theme.m4a.exe": false, "cache.json": false, "theme": false,
	} {
		path, ok := VoyageMusicPath(name)
		if ok != want {
			t.Errorf("VoyageMusicPath(%q) = %v, want %v", name, ok, want)
		}
		if ok && filepath.Dir(path) != voyageMusicDir {
			t.Errorf("VoyageMusicPath(%q) = %s, outside config/voyage", name, path)
		}
	}
	if VoyageMusicType("x.MP3") != "audio/mpeg" || VoyageMusicType("x.m4a") != "audio/mp4" {
		t.Fatal("music content types")
	}
}

func TestSaveVoyageMusic(t *testing.T) {
	original := voyageMusicDir
	voyageMusicDir = t.TempDir()
	defer func() { voyageMusicDir = original }()

	// An admin's own file stays through uploads and removal
	if err := os.WriteFile(voyageMusicDir+"/theme.m4a", []byte("own"), 0644); err != nil {
		t.Fatal(err)
	}

	name, err := SaveVoyageMusic(".mp3", strings.NewReader("first"))
	if err != nil || name != "voyage-music.mp3" {
		t.Fatalf("got %q, %v", name, err)
	}
	// Another upload replaces it, whatever its type
	name, err = SaveVoyageMusic(".ogg", strings.NewReader("second"))
	if err != nil || name != "voyage-music.ogg" {
		t.Fatalf("got %q, %v", name, err)
	}
	if _, err := os.Stat(voyageMusicDir + "/voyage-music.mp3"); !os.IsNotExist(err) {
		t.Errorf("expected the earlier upload gone, got %v", err)
	}
	if got, _ := os.ReadFile(voyageMusicDir + "/voyage-music.ogg"); string(got) != "second" {
		t.Errorf("expected the new upload, got %q", got)
	}
	if _, err := SaveVoyageMusic(".html", strings.NewReader("<p>")); err == nil {
		t.Error("expected a page refused")
	}

	RemoveVoyageMusicUploads("")
	entries, _ := os.ReadDir(voyageMusicDir)
	if len(entries) != 1 || entries[0].Name() != "theme.m4a" {
		t.Errorf("expected only the admin's own file left, got %v", entries)
	}
}
