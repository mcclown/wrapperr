package modules

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aunefyren/wrapperr/modules/voyage"
)

func TestWriteExportPage(t *testing.T) {
	page := filepath.Join(t.TempDir(), "index.html")
	os.WriteFile(page, []byte(`<body>
<script type="module" src="voyage.js"></script>
</body>`), 0644)
	// A title can't close the script it is written into
	if err := writeExportPage(page, voyage.Document{Version: "voyage.v1", Titles: []voyage.Title{{Name: "</script><script>alert(1)</script>"}}}, ""); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(page)
	s := string(raw)
	if strings.Count(s, "</script>") != 2 || !strings.Contains(s, `\u003c/script\u003e`) {
		t.Fatalf("the document is not escaped: %s", s)
	}
	if !strings.Contains(s, `window.VOYAGE_MUSIC = "";</script>`+"\n"+`<script type="module" src="voyage.js">`) {
		t.Fatalf("the document is set ahead of the page's script, with no music: %s", s)
	}

	os.WriteFile(page, []byte(`<body></body>`), 0644)
	if writeExportPage(page, voyage.Document{}, "") == nil {
		t.Fatal("a page without its script tag is an error")
	}
}

func TestEmptyFolder(t *testing.T) {
	dir := t.TempDir()
	if err := emptyFolder(filepath.Join(dir, "new", "site")); err != nil {
		t.Fatal(err)
	}
	if err := emptyFolder(filepath.Join(dir, "new", "site")); err != nil {
		t.Fatal("an empty folder can be exported into: ", err)
	}
	os.WriteFile(filepath.Join(dir, "new", "site", "keep.txt"), []byte("x"), 0644)
	if emptyFolder(filepath.Join(dir, "new", "site")) == nil {
		t.Fatal("a folder with anything in it is refused")
	}
}
