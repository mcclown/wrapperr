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

func TestInstallVoyageMusic(t *testing.T) {
	original := voyageMusicDir
	voyageMusicDir = t.TempDir()
	defer func() { voyageMusicDir = original }()
	read := func(name string) string {
		body, _ := os.ReadFile(voyageMusicDir + "/" + name)
		return string(body)
	}

	// An admin's own file stays through uploads and removal
	if err := os.WriteFile(voyageMusicDir+"/theme.m4a", []byte("own"), 0644); err != nil {
		t.Fatal(err)
	}

	temp, err := writeVoyageMusic(".mp3", strings.NewReader("first"))
	if err != nil {
		t.Fatal(err)
	}
	done, err := installVoyageMusic(temp, "voyage-music.mp3")
	if err != nil {
		t.Fatal(err)
	}
	done(true)

	// The same type again, but the settings fail to save: the first is put back
	temp, _ = writeVoyageMusic(".mp3", strings.NewReader("second"))
	done, _ = installVoyageMusic(temp, "voyage-music.mp3")
	if read("voyage-music.mp3") != "second" {
		t.Errorf("expected the new upload in place, got %q", read("voyage-music.mp3"))
	}
	done(false)
	if read("voyage-music.mp3") != "first" {
		t.Errorf("expected the first upload put back, got %q", read("voyage-music.mp3"))
	}

	// Another type replaces it once the earlier ones are cleared away
	temp, _ = writeVoyageMusic(".ogg", strings.NewReader("third"))
	done, _ = installVoyageMusic(temp, "voyage-music.ogg")
	done(true)
	RemoveVoyageMusicUploads("voyage-music.ogg")
	if _, err := os.Stat(voyageMusicDir + "/voyage-music.mp3"); !os.IsNotExist(err) {
		t.Errorf("expected the earlier upload gone, got %v", err)
	}
	if _, err := writeVoyageMusic(".html", strings.NewReader("<p>")); err == nil {
		t.Error("expected a page refused")
	}

	RemoveVoyageMusicUploads("")
	entries, _ := os.ReadDir(voyageMusicDir)
	if len(entries) != 1 || entries[0].Name() != "theme.m4a" {
		t.Errorf("expected only the admin's own file left, got %v", entries)
	}
}
