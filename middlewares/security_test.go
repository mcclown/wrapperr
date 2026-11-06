package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// request runs one request from remoteAddr with headers through an engine trusting the given proxies' header
// (the first entry of trusted may be "header=<name>" to pick it), and returns what the handler saw.
func request(t *testing.T, trusted []string, remoteAddr string, headers map[string]string, handle func(*gin.Context)) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	header := ""
	if len(trusted) > 0 && len(trusted[0]) > 7 && trusted[0][:7] == "header=" {
		header, trusted = trusted[0][7:], trusted[1:]
	}
	if err := ConfigureClientIP(engine, trusted, header); err != nil {
		t.Fatal(err)
	}
	engine.Use(SecurityHeaders())
	engine.GET("/", handle)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = remoteAddr
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

func TestClientIPOnlyFromTrustedProxies(t *testing.T) {
	cases := []struct {
		name    string
		trusted []string
		remote  string
		headers map[string]string
		want    string
	}{
		{"direct", nil, "192.168.1.20:5000", nil, "192.168.1.20"},
		{"spoofed header, no trusted proxies", nil, "203.0.113.9:5000", map[string]string{"X-Forwarded-For": "192.168.1.20"}, "203.0.113.9"},
		{"tunnel, cloudflared trusted", []string{"header=CF-Connecting-IP", "172.17.0.1"}, "172.17.0.1:5000", map[string]string{"CF-Connecting-IP": "198.51.100.7"}, "198.51.100.7"},
		{"header from an untrusted address", []string{"header=CF-Connecting-IP", "172.17.0.1"}, "192.168.1.50:5000", map[string]string{"CF-Connecting-IP": "192.168.1.20"}, "192.168.1.50"},
		// nginx passes a visitor's own CF-Connecting-IP through; only its X-Forwarded-For is read
		{"nginx with a forged CF-Connecting-IP", []string{"192.168.1.5"}, "192.168.1.5:5000", map[string]string{"CF-Connecting-IP": "192.168.1.20", "X-Forwarded-For": "203.0.113.9"}, "203.0.113.9"},
		{"forged X-Forwarded-For through nginx", []string{"192.168.1.5"}, "192.168.1.5:5000", map[string]string{"X-Forwarded-For": "192.168.1.20, 203.0.113.9"}, "203.0.113.9"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var got string
			request(t, c.trusted, c.remote, c.headers, func(ctx *gin.Context) { got = ctx.ClientIP() })
			if got != c.want {
				t.Fatalf("ClientIP = %q, want %q", got, c.want)
			}
		})
	}
}

func TestAdminAllowed(t *testing.T) {
	lan := []string{"192.168.1.0/24"}
	cases := []struct {
		name     string
		networks []string
		trusted  []string
		remote   string
		headers  map[string]string
		want     bool
	}{
		{"no networks: everyone", nil, nil, "203.0.113.9:5000", nil, true},
		{"LAN, direct", lan, nil, "192.168.1.20:5000", nil, true},
		{"internet, direct", lan, nil, "203.0.113.9:5000", nil, false},
		// cloudflared on the LAN but not listed as a trusted proxy: its own address would pass for the client's
		{"tunnel through an untrusted cloudflared", lan, nil, "192.168.1.5:5000", map[string]string{"CF-Connecting-IP": "198.51.100.7"}, false},
		{"tunnel through a trusted cloudflared", lan, []string{"header=CF-Connecting-IP", "192.168.1.5"}, "192.168.1.5:5000", map[string]string{"CF-Connecting-IP": "198.51.100.7"}, false},
		{"LAN through a trusted proxy", lan, []string{"192.168.1.5"}, "192.168.1.5:5000", map[string]string{"X-Forwarded-For": "192.168.1.20"}, true},
		{"internet through nginx, forging CF-Connecting-IP", lan, []string{"192.168.1.5"}, "192.168.1.5:5000", map[string]string{"CF-Connecting-IP": "192.168.1.20", "X-Forwarded-For": "203.0.113.9"}, false},
		{"trusted proxy sending a different header", lan, []string{"header=CF-Connecting-IP", "192.168.1.5"}, "192.168.1.5:5000", map[string]string{"X-Forwarded-For": "192.168.1.20"}, false},
		// a tunnel set to remove visitor IP headers: the request looks like it is from cloudflared on the LAN
		{"trusted proxy sending no header", lan, []string{"header=CF-Connecting-IP", "192.168.1.5"}, "192.168.1.5:5000", nil, false},
		{"LAN, direct, with a trusted proxy configured", lan, []string{"header=CF-Connecting-IP", "192.168.1.5"}, "192.168.1.20:5000", nil, true},
		{"single address", []string{"192.168.1.20"}, nil, "192.168.1.20:5000", nil, true},
		{"invalid list: nobody", []string{"not-a-network"}, nil, "192.168.1.20:5000", nil, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var got bool
			request(t, c.trusted, c.remote, c.headers, func(ctx *gin.Context) { got = AdminAllowed(ctx, c.networks) })
			if got != c.want {
				t.Fatalf("AdminAllowed = %v, want %v", got, c.want)
			}
		})
	}
}

func TestAdminAllowedAfterRestart(t *testing.T) {
	lan := []string{"192.168.1.0/24"}
	// The admin is on the LAN behind a trusted nginx today
	nginx := map[string]string{"X-Forwarded-For": "192.168.1.20"}
	var now, cleared, kept bool
	request(t, []string{"192.168.1.5"}, "192.168.1.5:5000", nginx, func(ctx *gin.Context) {
		now = AdminAllowed(ctx, lan)
		cleared = AdminAllowedAfterRestart(ctx, nil, "", lan)                  // trusted_proxies cleared in the same save
		kept = AdminAllowedAfterRestart(ctx, []string{"192.168.1.5"}, "", lan) // left as it is
	})
	if !now || cleared || !kept {
		t.Fatalf("now %v, after clearing trusted_proxies %v (want false), keeping it %v", now, cleared, kept)
	}
	// Browsing from the proxy's own address: allowed today, but not once it is a trusted proxy
	var direct, asProxy bool
	request(t, nil, "192.168.1.5:5000", nil, func(ctx *gin.Context) {
		direct = AdminAllowed(ctx, lan)
		asProxy = AdminAllowedAfterRestart(ctx, []string{"192.168.1.5"}, "", lan)
	})
	if !direct || asProxy {
		t.Fatalf("from the proxy's address: now %v, once it is trusted %v (want false)", direct, asProxy)
	}
}

func TestConfigureClientIPFailureKeepsSettings(t *testing.T) {
	if err := ConfigureClientIP(gin.New(), []string{"192.168.1.5"}, "CF-Connecting-IP"); err != nil {
		t.Fatal(err)
	}
	if err := ConfigureClientIP(gin.New(), []string{"not-a-network"}, ""); err == nil {
		t.Fatal("expected an error for a bad proxy")
	}
	if got := currentProxy(); got.header != "CF-Connecting-IP" || len(got.trusted) != 1 {
		t.Fatalf("settings after a failed call = %+v, want the earlier ones", got)
	}
}

func TestClientIPHeader(t *testing.T) {
	for setting, want := range map[string]string{"": "X-Forwarded-For", "cf-connecting-ip": "CF-Connecting-IP", " X-Real-IP ": "X-Real-IP"} {
		if got, ok := ClientIPHeader(setting); !ok || got != want {
			t.Fatalf("ClientIPHeader(%q) = %q, %v", setting, got, ok)
		}
	}
	if _, ok := ClientIPHeader("True-Client-IP"); ok {
		t.Fatal("an unknown header should be refused")
	}
}

func TestParseNetworks(t *testing.T) {
	networks, err := ParseNetworks([]string{" 10.0.0.0/8 ", "192.168.1.20", "", "::1"})
	if err != nil || len(networks) != 3 {
		t.Fatalf("ParseNetworks = %v, %v", networks, err)
	}
	if !InNetworks("10.2.3.4", networks) || !InNetworks("192.168.1.20", networks) || InNetworks("192.168.1.21", networks) || !InNetworks("::1", networks) {
		t.Fatal("InNetworks gave the wrong answer")
	}
	if _, err := ParseNetworks([]string{"192.168.1.0/33"}); err == nil {
		t.Fatal("expected an error for a bad CIDR")
	}
}

func TestRateLimiter(t *testing.T) {
	now := time.Unix(1000, 0)
	limiter := NewRateLimiter(2, time.Minute)
	limiter.now = func() time.Time { return now }
	for i, want := range []bool{true, true, false} {
		if ok, _ := limiter.Allow("a"); ok != want {
			t.Fatalf("request %d: allowed = %v, want %v", i+1, ok, want)
		}
	}
	if ok, _ := limiter.Allow("b"); !ok {
		t.Fatal("another client should have its own limit")
	}
	if _, wait := limiter.Allow("a"); wait != time.Minute {
		t.Fatalf("wait = %v, want 1m", wait)
	}
	now = now.Add(time.Minute)
	if ok, _ := limiter.Allow("a"); !ok {
		t.Fatal("the window should have reset")
	}
}

func TestRateLimiterIPv6AndCap(t *testing.T) {
	now := time.Unix(1000, 0)
	limiter := NewRateLimiter(1, time.Minute)
	limiter.now = func() time.Time { return now }
	limiter.maxKeys = 2
	if ok, _ := limiter.Allow("2001:db8:1:2::1"); !ok {
		t.Fatal("first request refused")
	}
	if ok, _ := limiter.Allow("2001:db8:1:2:aaaa::9"); ok {
		t.Fatal("another address in the same /64 should share its limit")
	}
	if ok, _ := limiter.Allow("2001:db8:1:3::1"); !ok {
		t.Fatal("another /64 should have its own limit")
	}
	// A new client beyond maxKeys is still let in (an arbitrary one is forgotten), so a flood of clients can't
	// lock out everyone else
	if ok, _ := limiter.Allow("198.51.100.7"); !ok {
		t.Fatal("a new client beyond maxKeys should be allowed")
	}
	if len(limiter.hits) != 2 {
		t.Fatalf("tracking %d clients, want maxKeys (2)", len(limiter.hits))
	}
}

func TestSecurityHeaders(t *testing.T) {
	rec := request(t, nil, "192.168.1.20:5000", nil, func(ctx *gin.Context) { ctx.String(http.StatusOK, "ok") })
	for _, h := range []string{"Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"} {
		if rec.Header().Get(h) == "" {
			t.Fatalf("missing %s", h)
		}
	}
}
