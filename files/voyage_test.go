package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aunefyren/wrapperr/models"
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

func TestVoyageMusicSettings(t *testing.T) {
	dir := t.TempDir()
	origConfig, origDefault, origCache, origMusic := config_path, default_config_path, configCache, voyageMusicDir
	t.Cleanup(func() {
		config_path, default_config_path, configCache, voyageMusicDir = origConfig, origDefault, origCache, origMusic
	})
	config_path = filepath.Join(dir, "config.json")
	default_config_path, _ = filepath.Abs("./configDefault.json")
	configCache = nil
	voyageMusicDir = filepath.Join(dir, "voyage")
	if err := SaveConfig(models.WrapperrConfig{Timezone: "Europe/Paris", WrappedStart: 1, WrappedEnd: 2}); err != nil {
		t.Fatal(err)
	}

	// A copy of the settings read before the upload
	stale, err := GetConfig()
	if err != nil {
		t.Fatal(err)
	}
	name, err := SetVoyageMusicUpload(".mp3", strings.NewReader("music"))
	if err != nil || name != "voyage-music.mp3" {
		t.Fatalf("got %q, %v", name, err)
	}

	// Saving the stale copy, by any part of Wrapperr, keeps the music
	stale.Timezone = "Europe/Oslo"
	if err := SaveConfig(stale); err != nil {
		t.Fatal(err)
	}
	if config, _ := GetConfig(); config.VoyageMusic != name || config.Timezone != "Europe/Oslo" {
		t.Errorf("expected the music kept and the time zone saved, got %q, %q", config.VoyageMusic, config.Timezone)
	}
	// So does a settings save that doesn't set the music; one that does sets it
	if err := SaveSettings(stale, false); err != nil {
		t.Fatal(err)
	}
	if config, _ := GetConfig(); config.VoyageMusic != name {
		t.Errorf("expected the music kept, got %q", config.VoyageMusic)
	}

	// A save setting the music to a file that isn't there is refused; to one that is, saved
	stale.VoyageMusic = "missing.mp3"
	if err := SaveSettings(stale, true); err != ErrVoyageMusicMissing {
		t.Errorf("expected a missing file refused, got %v", err)
	}
	if err := os.WriteFile(filepath.Join(voyageMusicDir, "theme.m4a"), []byte("own"), 0644); err != nil {
		t.Fatal(err)
	}
	stale.VoyageMusic = "theme.m4a"
	if err := SaveSettings(stale, true); err != nil {
		t.Fatal(err)
	}
	if config, _ := GetConfig(); config.VoyageMusic != "theme.m4a" {
		t.Errorf("expected the music set, got %q", config.VoyageMusic)
	}

	if err := ClearVoyageMusic(); err != nil {
		t.Fatal(err)
	}
	if config, _ := GetConfig(); config.VoyageMusic != "" {
		t.Errorf("expected no music, got %q", config.VoyageMusic)
	}
	if _, err := os.Stat(filepath.Join(voyageMusicDir, name)); !os.IsNotExist(err) {
		t.Errorf("expected the upload deleted, got %v", err)
	}
}
