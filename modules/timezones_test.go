package modules

import (
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/aunefyren/wrapperr/models"
)

func TestPublicIP(t *testing.T) {
	for ip, want := range map[string]bool{"203.0.113.5": true, "192.168.1.2": false, "10.0.0.1": false, "127.0.0.1": false,
		"fe80::1": false, "100.100.1.2": false, "2001:db8::1": true, "not-an-ip": false} {
		if publicIP(ip) != want {
			t.Errorf("publicIP(%s) = %v, want %v", ip, !want, want)
		}
	}
}

// fakeTautulli answers get_user_ips and get_geoip_lookup like Tautulli does.
func fakeTautulli(t *testing.T, ips []string, locations map[string]string) models.TautulliConfig {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Query().Get("cmd") {
		case "get_user_ips":
			rows := ""
			for i, ip := range ips {
				if i > 0 {
					rows += ","
				}
				rows += `{"ip_address":"` + ip + `","play_count":` + strconv.Itoa(100-i) + `}`
			}
			w.Write([]byte(`{"response":{"result":"success","data":{"data":[` + rows + `]}}}`))
		case "get_geoip_lookup":
			if location, ok := locations[r.URL.Query().Get("ip_address")]; ok {
				w.Write([]byte(`{"response":{"result":"success","data":` + location + `}}`))
			} else {
				w.Write([]byte(`{"response":{"result":"error","data":{}}}`))
			}
		}
	}))
	t.Cleanup(server.Close)
	u, _ := url.Parse(server.URL)
	host, port, _ := net.SplitHostPort(u.Host)
	portNumber, _ := strconv.Atoi(port)
	return models.TautulliConfig{TautulliIP: host, TautulliPort: portNumber, TautulliApiKey: "test"}
}

func TestLookupTimezone(t *testing.T) {
	brisbane := `{"country":"Australia","code":"AU","region":"Queensland","latitude":-27.47,"longitude":153.03,"timezone":"Etc/UTC"}`
	// The LAN address is skipped, the first public one has no location, the next does
	server := fakeTautulli(t, []string{"192.168.1.2", "198.51.100.1", "203.0.113.5"}, map[string]string{"203.0.113.5": brisbane})
	zone, label, ok, err := lookupTimezone(server, 1)
	if err != nil || !ok || zone != "Australia/Brisbane" || label != "Australia / Queensland" {
		t.Fatalf("lookupTimezone = %q, %q, %v, %v", zone, label, ok, err)
	}

	lan := fakeTautulli(t, []string{"192.168.1.2", "10.0.0.4"}, nil)
	if _, _, ok, err := lookupTimezone(lan, 1); ok || err != nil {
		t.Fatalf("a LAN-only viewer should keep the server zone, got ok %v err %v", ok, err)
	}
}

func TestSetTimezoneRefusesUnknownZones(t *testing.T) {
	// Refused before users.json is read
	for _, zone := range []string{"Mars/Base", "Local", "../../etc/passwd"} {
		if err := UsersSetTimezone(1, zone); err == nil || err.Error() != "Unknown time zone." {
			t.Errorf("UsersSetTimezone(%q) = %v, want Unknown time zone.", zone, err)
		}
	}
}
