package models

import "encoding/json"

type WrapperrShareLinkCreateRequest struct {
	Data      WrapperrStatisticsReply `json:"data"`
	Functions WrapperrCustomize       `json:"functions"`
}

type WrapperrShareLinkGetRequest struct {
	Hash string `json:"hash"`
}

type WrapperrShareLink struct {
	Date            string                         `json:"date"`
	UserID          int                            `json:"user_id"`
	WrapperrVersion string                         `json:"wrapperr_version"`
	Hash            string                         `json:"hash"`
	Content         WrapperrShareLinkCreateRequest `json:"content"`
	Voyage          json.RawMessage                `json:"voyage,omitempty"` // the owner's voyage.v1 document, when the link was made with the voyage on
	Message         string                         `json:"message"`
	Error           bool                           `json:"error"`
	Expired         bool                           `json:"expired"`
}
