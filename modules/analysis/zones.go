package analysis

import (
	_ "embed"
	"math"
	"strconv"
	"strings"
	"sync"
)

// zone1970.tab is tzdb's table of time zones with the countries they cover and their principal location (public
// domain, from the tzdata 2026e Python package).
//
//go:embed zone1970.tab
var zoneTable string

type zoneRow struct {
	countries []string
	lat, lon  float64
	name      string
}

var (
	zonesOnce sync.Once
	zoneRows  []zoneRow
)

func loadZones() []zoneRow {
	zonesOnce.Do(func() {
		for _, line := range strings.Split(zoneTable, "\n") {
			line = strings.TrimRight(line, "\r")
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			fields := strings.Split(line, "\t")
			if len(fields) < 3 {
				continue
			}
			lat, lon, ok := parseISO6709(fields[1])
			if !ok {
				continue
			}
			zoneRows = append(zoneRows, zoneRow{countries: strings.Split(fields[0], ","), lat: lat, lon: lon, name: fields[2]})
		}
	})
	return zoneRows
}

// parseISO6709 reads tzdb's ±DDMM±DDDMM or ±DDMMSS±DDDMMSS into degrees.
func parseISO6709(s string) (lat, lon float64, ok bool) {
	split := strings.IndexAny(s[1:], "+-") + 1
	if split <= 0 {
		return 0, 0, false
	}
	lat, ok1 := parseDMS(s[:split], 2)
	lon, ok2 := parseDMS(s[split:], 3)
	return lat, lon, ok1 && ok2
}

func parseDMS(s string, degreeDigits int) (float64, bool) {
	if len(s) != 1+degreeDigits+2 && len(s) != 1+degreeDigits+4 {
		return 0, false
	}
	sign := 1.0
	if s[0] == '-' {
		sign = -1
	}
	digits := s[1:]
	value := 0.0
	for i, scale := 0, 1.0; i < len(digits); scale *= 60 {
		width := 2
		if i == 0 {
			width = degreeDigits
		}
		n, err := strconv.Atoi(digits[i : i+width])
		if err != nil {
			return 0, false
		}
		value += float64(n) / scale
		i += width
	}
	return sign * value, true
}

// ZoneForLocation is the time zone for a place: of the zones covering its country (an ISO 3166 code), the one whose
// principal location is nearest. It reports false for a country tzdb doesn't know.
func ZoneForLocation(country string, lat, lon float64) (string, bool) {
	country = strings.ToUpper(strings.TrimSpace(country))
	best, bestDistance := "", math.Inf(1)
	for _, row := range loadZones() {
		for _, c := range row.countries {
			if c != country {
				continue
			}
			if d := distance(lat, lon, row.lat, row.lon); d < bestDistance {
				best, bestDistance = row.name, d
			}
			break
		}
	}
	return best, best != ""
}

// distance is the great-circle angle between two points, which is all a nearest-point comparison needs.
func distance(lat1, lon1, lat2, lon2 float64) float64 {
	rad := math.Pi / 180
	a := math.Pow(math.Sin((lat2-lat1)*rad/2), 2) + math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Pow(math.Sin((lon2-lon1)*rad/2), 2)
	return 2 * math.Asin(math.Min(1, math.Sqrt(a)))
}
