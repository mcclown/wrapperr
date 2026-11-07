package files

import "testing"

func TestBackdropFiles(t *testing.T) {
	if PosterFilename(42, "") != "42.jpg" || PosterFilename(42, BackdropKind) != "42-art.jpg" {
		t.Fatal("a backdrop is cached as <key>-art.jpg next to its <key>.jpg poster")
	}
	poster := PosterReference{ServerHash: "s1", RatingKey: 42, ThumbPath: "/library/metadata/42/thumb/1"}
	backdrop := PosterReference{ServerHash: "s1", RatingKey: 42, ThumbPath: "/library/metadata/42/art/1", Kind: BackdropKind}
	if poster.queueKey() == backdrop.queueKey() {
		t.Fatal("a poster and a backdrop of one title should queue separately")
	}
	for path, want := range map[string]bool{"/library/metadata/42/art/1790957743": true, "/library/metadata/42/art": true,
		"/library/metadata/42/thumb/1": false, "/library/metadata/42/art/1?url=http://x": false, "http://x/library/metadata/42/art": false} {
		if validArtPath.MatchString(path) != want {
			t.Errorf("validArtPath(%q) = %v, want %v", path, !want, want)
		}
	}
}
