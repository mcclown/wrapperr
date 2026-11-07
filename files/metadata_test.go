package files

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/aunefyren/wrapperr/models"
)

func TestUpdateMetadataMerges(t *testing.T) {
	saved := metadataPath
	metadataPath = filepath.Join(t.TempDir(), "metadata.json")
	defer func() { metadataPath = saved }()

	if metadata, err := GetMetadata(); err != nil || len(metadata) != 0 {
		t.Fatalf("a missing file should be an empty cache, got %v, %v", metadata, err)
	}
	if err := UpdateMetadata(map[string]models.PlexMetadata{MetadataKey("s1", 1): {Year: 2001}, MetadataKey("s1", 2): {Year: 2002}}); err != nil {
		t.Fatal(err)
	}
	if err := UpdateMetadata(map[string]models.PlexMetadata{MetadataKey("s1", 2): {Year: 2022}, MetadataKey("s2", 1): {Missing: true}}); err != nil {
		t.Fatal(err)
	}
	metadata, err := GetMetadata()
	if err != nil {
		t.Fatal(err)
	}
	if len(metadata) != 3 || metadata["s1_1"].Year != 2001 || metadata["s1_2"].Year != 2022 || !metadata["s2_1"].Missing {
		t.Fatalf("merged to %+v", metadata)
	}

	// An unreadable file is an empty cache, and the next update replaces it
	if err := os.WriteFile(metadataPath, []byte(`{"s1_1":`), 0644); err != nil {
		t.Fatal(err)
	}
	if metadata, err := GetMetadata(); err != nil || len(metadata) != 0 {
		t.Fatalf("a corrupt file: %v, %v; want an empty cache", metadata, err)
	}
	if err := UpdateMetadata(map[string]models.PlexMetadata{MetadataKey("s1", 3): {Year: 2003}}); err != nil {
		t.Fatal(err)
	}
	if metadata, _ := GetMetadata(); len(metadata) != 1 {
		t.Fatalf("after a corrupt file, %+v", metadata)
	}
}
