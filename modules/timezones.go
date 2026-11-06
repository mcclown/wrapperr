package modules

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aunefyren/wrapperr/files"
	"github.com/aunefyren/wrapperr/models"
	"github.com/aunefyren/wrapperr/modules/analysis"
)

// Where an account's time zone came from
const (
	TimezoneSourceGeoIP = "geoip"
	TimezoneSourceAdmin = "admin"
)

// tautulliGet calls one Tautulli API command and decodes its reply.
func tautulliGet(server models.TautulliConfig, command string, parameters url.Values, reply interface{}) error {
	urlString, err := buildTautulliAPIURL(server.TautulliPort, server.TautulliIP, server.TautulliHttps, server.TautulliRoot, server.TautulliApiKey, command, parameters)
	if err != nil {
		return errors.New("Failed to build Tautulli connection URL.")
	}
	req, err := http.NewRequest("GET", urlString, nil)
	if err != nil {
		return errors.New("Failed to reach Tautulli server.")
	}
	req.Header.Add("Accept", "application/json")
	res, err := tautulliClient.Do(req)
	if err != nil {
		return errors.New("Failed to reach Tautulli server.")
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return errors.New("Failed to read Tautulli API response body.")
	}
	if err := json.Unmarshal(body, reply); err != nil {
		return errors.New("Failed to parse Tautulli response.")
	}
	return nil
}

// tautulliUserIPs are the addresses an account has played from, most plays first. They are only held in memory.
func tautulliUserIPs(server models.TautulliConfig, userID int) ([]string, error) {
	var reply struct {
		Response struct {
			Data struct {
				Data []struct {
					IPAddress string `json:"ip_address"`
				} `json:"data"`
			} `json:"data"`
		} `json:"response"`
	}
	parameters := url.Values{"user_id": {strconv.Itoa(userID)}, "order_column": {"play_count"}, "order_dir": {"desc"}, "length": {"25"}}
	if err := tautulliGet(server, "get_user_ips", parameters, &reply); err != nil {
		return nil, err
	}
	var ips []string
	for _, row := range reply.Response.Data.Data {
		ips = append(ips, row.IPAddress)
	}
	return ips, nil
}

type geoIPLocation struct {
	Country   string  `json:"country"`
	Code      string  `json:"code"`
	Region    string  `json:"region"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

func tautulliGeoIP(server models.TautulliConfig, ip string) (geoIPLocation, error) {
	var reply struct {
		Response struct {
			Result string        `json:"result"`
			Data   geoIPLocation `json:"data"`
		} `json:"response"`
	}
	if err := tautulliGet(server, "get_geoip_lookup", url.Values{"ip_address": {ip}}, &reply); err != nil {
		return geoIPLocation{}, err
	}
	if reply.Response.Result != "success" || reply.Response.Data.Code == "" {
		return geoIPLocation{}, errors.New("No GeoIP location.")
	}
	return reply.Response.Data, nil
}

// publicIP reports an address that says where someone is: not a LAN, loopback or link-local one.
func publicIP(address string) bool {
	ip := net.ParseIP(strings.TrimSpace(address))
	return ip != nil && !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() && !ip.IsUnspecified()
}

// lookupTimezone finds an account's time zone from the public address it has played from most, through
// Tautulli's GeoIP lookup. It reports false when there's no public address (a LAN viewer keeps the server's zone)
// or no location for it.
func lookupTimezone(server models.TautulliConfig, userID int) (zone string, label string, found bool, err error) {
	ips, err := tautulliUserIPs(server, userID)
	if err != nil {
		return "", "", false, err
	}
	tried := 0
	for _, ip := range ips {
		if !publicIP(ip) {
			continue
		}
		if tried++; tried > 3 {
			break
		}
		location, err := tautulliGeoIP(server, ip)
		if err != nil {
			continue
		}
		zone, ok := analysis.ZoneForLocation(location.Code, location.Latitude, location.Longitude)
		if !ok {
			continue
		}
		label = location.Country
		if location.Region != "" {
			label += " / " + location.Region
		}
		return zone, label, true, nil
	}
	return "", "", false, nil
}

// UsersLookupTimezones sets each account's time zone from GeoIP, leaving alone those an admin has set. Only the
// zone and its "Country / Region" label are kept, never the addresses. It returns how many accounts got a zone.
func UsersLookupTimezones() (found int, err error) {
	config, err := files.GetConfig()
	if err != nil {
		return 0, errors.New("Failed to load Wrapperr settings.")
	}
	servers := map[string]models.TautulliConfig{}
	for _, server := range config.TautulliConfig {
		servers[server.TautulliName] = server
	}

	users, err := files.GetUsers()
	if err != nil {
		return 0, errors.New("Failed to get users.")
	}
	// Look every account up first, then write the results into a fresh read of users.json, so the slow lookups
	// don't hold a stale copy that would undo other changes
	type result struct{ zone, label string }
	results := map[int]result{}
	for _, user := range users {
		if user.Ignore || user.TimezoneSource == TimezoneSourceAdmin {
			continue
		}
		for _, name := range user.TautulliServers {
			server, ok := servers[name]
			if !ok {
				continue
			}
			zone, label, ok, err := lookupTimezone(server, user.UserID)
			if err != nil {
				log.Println("Failed to look up a time zone for user ID " + strconv.Itoa(user.UserID) + ". Error: " + err.Error())
				break
			}
			if ok {
				results[user.UserID] = result{zone, label}
				break
			}
		}
	}

	users, err = files.GetUsers()
	if err != nil {
		return 0, errors.New("Failed to get users.")
	}
	for i := range users {
		r, ok := results[users[i].UserID]
		if !ok || users[i].TimezoneSource == TimezoneSourceAdmin {
			continue
		}
		users[i].Timezone, users[i].TimezoneLabel, users[i].TimezoneSource = r.zone, r.label, TimezoneSourceGeoIP
		found++
	}
	if err := files.SaveUsers(users); err != nil {
		return found, errors.New("Failed to save users.")
	}
	return found, nil
}

// UsersSetTimezone sets an account's time zone by hand, which GeoIP lookups then leave alone. An empty zone clears
// it, back to the server's zone until the next lookup.
func UsersSetTimezone(userID int, zone string) error {
	zone = strings.TrimSpace(zone)
	if zone != "" {
		if _, err := time.LoadLocation(zone); err != nil || zone == "Local" {
			return errors.New("Unknown time zone.")
		}
	}
	users, err := files.GetUsers()
	if err != nil {
		return errors.New("Failed to get users.")
	}
	for i := range users {
		if users[i].UserID != userID {
			continue
		}
		if zone == "" {
			users[i].Timezone, users[i].TimezoneLabel, users[i].TimezoneSource = "", "", ""
		} else {
			users[i].Timezone, users[i].TimezoneLabel, users[i].TimezoneSource = zone, "", TimezoneSourceAdmin
		}
		if err := files.SaveUsers(users); err != nil {
			return errors.New("Failed to save users.")
		}
		return nil
	}
	return errors.New("Failed to find user based on ID.")
}

// UsersTimezones are the accounts' time zones by user ID, for the analysis; accounts without one use the server's.
func UsersTimezones() (map[int]*time.Location, error) {
	users, err := files.GetUsers()
	if err != nil {
		return nil, errors.New("Failed to get users.")
	}
	zones := map[int]*time.Location{}
	for _, user := range users {
		if user.Timezone == "" {
			continue
		}
		if zone, err := time.LoadLocation(user.Timezone); err == nil {
			zones[user.UserID] = zone
		}
	}
	return zones, nil
}
