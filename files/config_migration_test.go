package files

import (
	"encoding/json"
	"testing"
)

func TestMigrateV3_3_0toV3_4_0(t *testing.T) {
	input := []byte(`{"wrapperr_version":"v3.3.1","wrapperr_customize":{"get_year_stats_requests":false}}`)

	output, err := migrateV3_3_0toV3_4_0(input)
	if err != nil {
		t.Fatalf("migration failed: %v", err)
	}

	var migrated struct {
		Version   string `json:"wrapperr_version"`
		Customize struct {
			GetUserRequestStats  bool `json:"get_user_request_stats"`
			GetYearStatsRequests bool `json:"get_year_stats_requests"`
			Following            bool `json:"get_user_request_stats_following"`
			OrderByPercent       bool `json:"stats_order_requests_by_percent"`
		} `json:"wrapperr_customize"`
	}
	if err := json.Unmarshal(output, &migrated); err != nil {
		t.Fatalf("failed to parse migrated config: %v", err)
	}

	if migrated.Version != "v3.4.0" {
		t.Errorf("expected version v3.4.0, got %s", migrated.Version)
	}
	if !migrated.Customize.GetUserRequestStats {
		t.Errorf("expected missing get_user_request_stats to default to true")
	}
	if !migrated.Customize.Following || !migrated.Customize.OrderByPercent {
		t.Errorf("expected missing following and percentage ordering settings to default to true")
	}
	if migrated.Customize.GetYearStatsRequests {
		t.Errorf("expected existing get_year_stats_requests to be kept as false")
	}
}
