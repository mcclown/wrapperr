package modules

import (
	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/voyage"
)

// VoyageToShare is an account's voyage for a share link, with the posters and backdrops it points at, which the
// link keeps so they can be fetched again while it lasts. The two come from the same build: if the voyage was
// rebuilt in between, the newer one is shared.
func VoyageToShare(userID int, config models.WrapperrConfig) (voyage.Document, []files.PosterReference, error) {
	document, err := VoyageForUser(userID, config)
	if err != nil {
		return voyage.Document{}, nil, err
	}
	voyages.Lock()
	defer voyages.Unlock()
	built, ok := voyages.built[userID]
	if !ok {
		// Everything was rebuilt since, and this account's not yet: the voyage is shared without its images' sources
		return document, nil, nil
	}
	refs := make([]files.PosterReference, 0, len(built.images))
	for _, image := range built.images {
		refs = append(refs, files.PosterReference{ServerHash: image.Server, RatingKey: image.RatingKey, ThumbPath: image.Path, Kind: image.Kind})
	}
	return built.document, refs, nil
}
