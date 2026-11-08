package models

import "encoding/json"

type WrapperrShareLinkCreateRequest struct {
	Data      WrapperrStatisticsReply `json:"data"`
	Functions WrapperrCustomize       `json:"functions"`
}

// WrapperrShareLinkImage is one of a shared voyage's posters or backdrops, as Wrapperr's poster cache fetches it.
type WrapperrShareLinkImage struct {
	ServerHash string `json:"server_hash"`
	RatingKey  int    `json:"rating_key"`
	Path       string `json:"path"` // its Plex path
	Kind       string `json:"kind,omitempty"`
}

type WrapperrShareLinkGetRequest struct {
	Hash   string `json:"hash"`
	Voyage bool   `json:"voyage"` // the link's voyage, rather than only whether it has one
}

type WrapperrShareLink struct {
	Date            string                         `json:"date"`
	UserID          int                            `json:"user_id"`
	WrapperrVersion string                         `json:"wrapperr_version"`
	Hash            string                         `json:"hash"`
	Content         WrapperrShareLinkCreateRequest `json:"content"`
	Voyage          json.RawMessage                `json:"voyage,omitempty"`        // the owner's voyage.v1 document, when the link was made with the voyage on
	HasVoyage       bool                           `json:"has_voyage,omitempty"`    // in a reply without the voyage: whether the link has one
	VoyageImages    []WrapperrShareLinkImage       `json:"voyage_images,omitempty"` // where the voyage's posters and backdrops come from (kept on the server, never sent)
	Message         string                         `json:"message"`
	Error           bool                           `json:"error"`
	Expired         bool                           `json:"expired"`
}
