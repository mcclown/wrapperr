package analysis

import "testing"

func TestZoneForLocation(t *testing.T) {
	cases := []struct {
		country  string
		lat, lon float64
		want     string
	}{
		{"AU", -27.47, 153.03, "Australia/Brisbane"}, // Brisbane
		{"AU", -28.00, 153.43, "Australia/Brisbane"}, // Gold Coast
		{"AU", -35.28, 149.13, "Australia/Sydney"},   // Canberra
		{"AU", -31.95, 115.86, "Australia/Perth"},    // Perth
		{"ie", 53.35, -6.26, "Europe/Dublin"},        // lower case
		{"NZ", -36.85, 174.76, "Pacific/Auckland"},
		{"US", 41.88, -87.63, "America/Chicago"},
		{"GB", 51.5, -0.12, "Europe/London"},
	}
	for _, c := range cases {
		if got, ok := ZoneForLocation(c.country, c.lat, c.lon); !ok || got != c.want {
			t.Errorf("ZoneForLocation(%s, %v, %v) = %q, want %q", c.country, c.lat, c.lon, got, c.want)
		}
	}
	if _, ok := ZoneForLocation("XX", 0, 0); ok {
		t.Error("an unknown country should have no zone")
	}
}

func TestParseISO6709(t *testing.T) {
	lat, lon, ok := parseISO6709("-3352+15113")
	if !ok || lat > -33.86 || lat < -33.87 || lon < 151.21 || lon > 151.22 {
		t.Fatalf("Sydney parsed as %v, %v", lat, lon)
	}
	lat, lon, ok = parseISO6709("+404251-0740023")
	if !ok || lat < 40.71 || lat > 40.72 || lon > -74.00 || lon < -74.01 {
		t.Fatalf("New York parsed as %v, %v", lat, lon)
	}
}
