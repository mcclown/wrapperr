package files

import (
	"path/filepath"
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
