package middlewares

import (
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aunefyren/wrapperr/files"

	"github.com/gin-gonic/gin"
)

// ContentSecurityPolicy is sent with every response. It allows what the bundled pages load today: jQuery from
// code.jquery.com, Google Fonts, the inline script block each page carries, and plex.tv for Plex sign-in.
const ContentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self' 'unsafe-inline' https://code.jquery.com; " +
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
	"font-src 'self' https://fonts.gstatic.com; " +
	"img-src 'self' data: blob:; " +
	"connect-src 'self' https://plex.tv; " +
	"frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

// SecurityHeaders sets the browser security headers on every response.
func SecurityHeaders() gin.HandlerFunc {
	return func(context *gin.Context) {
		h := context.Writer.Header()
		h.Set("Content-Security-Policy", ContentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		context.Next()
	}
}

// BodyLimit caps the size of a request body. A larger body fails to read, which the handlers already answer with
// a bad request.
func BodyLimit(maxBytes int64) gin.HandlerFunc {
	return func(context *gin.Context) {
		if context.Request.Body != nil {
			context.Request.Body = http.MaxBytesReader(context.Writer, context.Request.Body, maxBytes)
		}
		context.Next()
	}
}

// ParseNetworks reads IP addresses and CIDR ranges ("192.168.1.0/24", "10.0.0.5"). A bare address is taken as a
// single-address range.
func ParseNetworks(entries []string) ([]*net.IPNet, error) {
	var networks []*net.IPNet
	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if !strings.Contains(entry, "/") {
			ip := net.ParseIP(entry)
			if ip == nil {
				return nil, &net.ParseError{Type: "IP address", Text: entry}
			}
			bits := 128
			if ip.To4() != nil {
				ip, bits = ip.To4(), 32
			}
			networks = append(networks, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
			continue
		}
		_, network, err := net.ParseCIDR(entry)
		if err != nil {
			return nil, err
		}
		networks = append(networks, network)
	}
	return networks, nil
}

// InNetworks reports whether ip is inside any of the networks.
func InNetworks(ip string, networks []*net.IPNet) bool {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	for _, network := range networks {
		if network.Contains(parsed) {
			return true
		}
	}
	return false
}

// ProxiedButUntrusted reports a request that carries a reverse proxy's client address header but did not come
// through a trusted proxy, so its real origin is unknown: a Cloudflare tunnel's cloudflared, say, before it is
// listed in trusted_proxies, whose own (local) address would otherwise pass for the client's.
func ProxiedButUntrusted(context *gin.Context) bool {
	for _, header := range []string{"CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"} {
		if context.GetHeader(header) != "" && context.ClientIP() == context.RemoteIP() {
			return true
		}
	}
	return false
}

// AdminNetworks limits the admin pages and API to the configured admin_networks. Anyone else gets a 404, so the
// admin side does not exist for them. With no networks configured everyone may reach it, as before.
func AdminNetworks() gin.HandlerFunc {
	return func(context *gin.Context) {
		config, err := files.GetConfig()
		if err != nil {
			log.Println("Failed to load Wrapperr settings. Error: " + err.Error())
			context.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "Failed to load Wrapperr settings."})
			return
		}
		if !AdminAllowed(context, config.AdminNetworks) {
			log.Println("Admin request refused from outside admin_networks - Origin: " + context.ClientIP())
			context.AbortWithStatus(http.StatusNotFound)
			return
		}
		context.Next()
	}
}

// AdminAllowed reports whether a request may reach the admin side under the given admin_networks: everyone when
// the list is empty, otherwise only a client inside it whose address is known. An invalid list lets nobody in.
func AdminAllowed(context *gin.Context, adminNetworks []string) bool {
	if len(adminNetworks) == 0 {
		return true
	}
	networks, err := ParseNetworks(adminNetworks)
	if err != nil {
		log.Println("Invalid admin_networks, refusing admin access. Error: " + err.Error())
		return false
	}
	return !ProxiedButUntrusted(context) && InNetworks(context.ClientIP(), networks)
}

// RateLimiter counts requests per client IP in fixed windows.
type RateLimiter struct {
	limit  int
	window time.Duration
	mu     sync.Mutex
	hits   map[string]*rateWindow
	now    func() time.Time
}

type rateWindow struct {
	start time.Time
	count int
}

// NewRateLimiter allows limit requests per client IP in each window.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{limit: limit, window: window, hits: map[string]*rateWindow{}, now: time.Now}
}

// Allow records a request from key and reports whether it is within the limit, and if not, how long until the
// window resets.
func (r *RateLimiter) Allow(key string) (bool, time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	if len(r.hits) > 10000 { // drop finished windows so the map can't grow without bound
		for k, w := range r.hits {
			if now.Sub(w.start) >= r.window {
				delete(r.hits, k)
			}
		}
	}
	w, ok := r.hits[key]
	if !ok || now.Sub(w.start) >= r.window {
		r.hits[key] = &rateWindow{start: now, count: 1}
		return true, 0
	}
	if w.count >= r.limit {
		return false, w.start.Add(r.window).Sub(now)
	}
	w.count++
	return true, 0
}

// RateLimit answers 429 once a client IP has made limit requests to this route in the window.
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	limiter := NewRateLimiter(limit, window)
	return func(context *gin.Context) {
		ok, wait := limiter.Allow(context.ClientIP())
		if !ok {
			seconds := int(wait.Seconds()) + 1
			log.Println("Rate limit hit on " + context.FullPath() + " - Origin: " + context.ClientIP())
			context.Header("Retry-After", strconv.Itoa(seconds))
			context.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests. Try again in " + strconv.Itoa(seconds) + " seconds."})
			return
		}
		context.Next()
	}
}
