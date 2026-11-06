package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

// request runs one request from remoteAddr with headers through an engine trusting the given proxies, and returns
// what the handler saw.
func request(t *testing.T, trusted []string, remoteAddr string, headers map[string]string, handle func(*gin.Context)) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.RemoteIPHeaders = []string{"CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"}
	if err := engine.SetTrustedProxies(trusted); err != nil {
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
		{"tunnel, cloudflared trusted", []string{"172.17.0.1"}, "172.17.0.1:5000", map[string]string{"CF-Connecting-IP": "198.51.100.7"}, "198.51.100.7"},
		{"header from an untrusted address", []string{"172.17.0.1"}, "192.168.1.50:5000", map[string]string{"CF-Connecting-IP": "192.168.1.20"}, "192.168.1.50"},
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
		{"tunnel through a trusted cloudflared", lan, []string{"192.168.1.5"}, "192.168.1.5:5000", map[string]string{"CF-Connecting-IP": "198.51.100.7"}, false},
		{"LAN through a trusted proxy", lan, []string{"192.168.1.5"}, "192.168.1.5:5000", map[string]string{"X-Forwarded-For": "192.168.1.20"}, true},
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

func TestSecurityHeaders(t *testing.T) {
	rec := request(t, nil, "192.168.1.20:5000", nil, func(ctx *gin.Context) { ctx.String(http.StatusOK, "ok") })
	for _, h := range []string{"Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"} {
		if rec.Header().Get(h) == "" {
			t.Fatalf("missing %s", h)
		}
	}
}
