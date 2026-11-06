package middlewares

import (
	"fmt"
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

// ProxyHeaders are the client address headers reverse proxies send. client_ip_header picks the one Wrapperr reads.
var ProxyHeaders = []string{"X-Forwarded-For", "X-Real-IP", "CF-Connecting-IP"}

// ClientIPHeader returns the canonical name of a client_ip_header setting ("" means X-Forwarded-For), or false
// when it isn't one of ProxyHeaders.
func ClientIPHeader(setting string) (string, bool) {
	setting = strings.TrimSpace(setting)
	if setting == "" {
		return ProxyHeaders[0], true
	}
	for _, header := range ProxyHeaders {
		if strings.EqualFold(setting, header) {
			return header, true
		}
	}
	return "", false
}

// ConfigureClientIP makes the engine take the client's address from the one configured header, and only when the
// request comes from one of the trusted proxies. Only one header is read: a proxy passes on headers it doesn't set
// itself (nginx forwards a visitor's own CF-Connecting-IP, say), so reading several would let a visitor choose
// their address. With no trusted proxies no header is read at all.
func ConfigureClientIP(engine *gin.Engine, trustedProxies []string, header string) error {
	settings, err := configureEngine(engine, trustedProxies, header)
	if err != nil {
		return err
	}
	activeProxyMu.Lock()
	activeProxy = settings
	activeProxyMu.Unlock()
	return nil
}

// proxySettings are the trusted proxies and client address header an engine runs with.
type proxySettings struct {
	trusted []*net.IPNet
	header  string
}

// The settings the server's engine runs with, which AdminAllowed checks requests against
var (
	activeProxyMu sync.Mutex
	activeProxy   proxySettings
)

func configureEngine(engine *gin.Engine, trustedProxies []string, header string) (proxySettings, error) {
	canonical, ok := ClientIPHeader(header)
	if !ok {
		return proxySettings{}, fmt.Errorf("client_ip_header must be one of %s", strings.Join(ProxyHeaders, ", "))
	}
	trusted, err := ParseNetworks(trustedProxies)
	if err != nil {
		return proxySettings{}, err
	}
	engine.ForwardedByClientIP = true
	engine.RemoteIPHeaders = []string{canonical}
	if err := engine.SetTrustedProxies(trustedProxies); err != nil {
		return proxySettings{}, err
	}
	return proxySettings{trusted: trusted, header: canonical}, nil
}

// ProxiedButUntrusted reports a request that carries a reverse proxy's client address header but whose address
// wasn't taken from it, because it did not come through a trusted proxy (or its proxy sent a different header).
// Its real origin is unknown: a Cloudflare tunnel's cloudflared, say, before it is listed in trusted_proxies,
// whose own (local) address would otherwise pass for the client's.
func ProxiedButUntrusted(context *gin.Context) bool {
	if context.ClientIP() != context.RemoteIP() {
		return false
	}
	for _, header := range ProxyHeaders {
		if context.GetHeader(header) != "" {
			return true
		}
	}
	return false
}

// untrustedProxyWarning is logged once: proxied requests from an untrusted address mean every visitor shares the
// proxy's address, so the per-address rate limits act as one limit for all of them.
var untrustedProxyWarning sync.Once

func warnUntrustedProxy(context *gin.Context) {
	if ProxiedButUntrusted(context) {
		untrustedProxyWarning.Do(func() {
			log.Println("Warning: requests arrive through a proxy at " + context.RemoteIP() + " that is not in trusted_proxies " +
				"(or doesn't send client_ip_header). Every visitor then looks like the proxy, so rate limits are shared by all of them.")
		})
	}
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
			if headerMissing(context, currentProxy()) {
				log.Println("Admin request refused: it came from trusted proxy " + context.RemoteIP() + " without its client_ip_header, " +
					"so its origin is unknown. Open the admin pages from your own address, not the proxy's.")
			} else {
				log.Println("Admin request refused from outside admin_networks - Origin: " + context.ClientIP())
			}
			context.AbortWithStatus(http.StatusNotFound)
			return
		}
		context.Next()
	}
}

// AdminAllowed reports whether a request may reach the admin side under the given admin_networks: everyone when
// the list is empty, otherwise only a client inside it whose address is known. An invalid list lets nobody in.
func AdminAllowed(context *gin.Context, adminNetworks []string) bool {
	return adminAllowed(context, currentProxy(), adminNetworks)
}

func currentProxy() proxySettings {
	activeProxyMu.Lock()
	defer activeProxyMu.Unlock()
	return activeProxy
}

// headerMissing reports a request from a trusted proxy without its client address header. Its origin is unknown:
// a tunnel set to strip visitor IP headers, say, would otherwise pass every visitor off as the proxy's own address.
func headerMissing(context *gin.Context, settings proxySettings) bool {
	return InNetworks(context.RemoteIP(), settings.trusted) && context.GetHeader(settings.header) == ""
}

func adminAllowed(context *gin.Context, settings proxySettings, adminNetworks []string) bool {
	if len(adminNetworks) == 0 {
		return true
	}
	networks, err := parseNetworksCached(adminNetworks)
	if err != nil {
		log.Println("Invalid admin_networks, refusing admin access. Error: " + err.Error())
		return false
	}
	if headerMissing(context, settings) {
		return false
	}
	return !ProxiedButUntrusted(context) && InNetworks(context.ClientIP(), networks)
}

// AdminAllowedAfterRestart reports whether the request would still reach the admin side once Wrapperr restarts
// with these trusted_proxies and client_ip_header (they take effect on restart) and admin_networks.
func AdminAllowedAfterRestart(context *gin.Context, trustedProxies []string, header string, adminNetworks []string) bool {
	engine := gin.New()
	settings, err := configureEngine(engine, trustedProxies, header)
	if err != nil {
		return false
	}
	future := gin.CreateTestContextOnly(discardWriter{http.Header{}}, engine)
	future.Request = context.Request
	return adminAllowed(future, settings, adminNetworks)
}

// discardWriter is a ResponseWriter for a context that only answers questions about a request.
type discardWriter struct{ header http.Header }

func (w discardWriter) Header() http.Header         { return w.header }
func (w discardWriter) Write(b []byte) (int, error) { return len(b), nil }
func (w discardWriter) WriteHeader(int)             {}

// The admin networks last parsed, so each admin request doesn't parse them again
var (
	networksMu     sync.Mutex
	networksKey    *string
	networksParsed []*net.IPNet
	networksErr    error
)

func parseNetworksCached(entries []string) ([]*net.IPNet, error) {
	key := strings.Join(entries, "\x00")
	networksMu.Lock()
	defer networksMu.Unlock()
	if networksKey == nil || *networksKey != key {
		networksKey = &key
		networksParsed, networksErr = ParseNetworks(entries)
	}
	return networksParsed, networksErr
}

// RateLimiter counts requests per client in fixed windows. An IPv6 client is counted by its /64, which one
// household or server usually has to itself, so cycling addresses inside it doesn't reset the limit.
type RateLimiter struct {
	limit     int
	window    time.Duration
	maxKeys   int
	mu        sync.Mutex
	hits      map[string]*rateWindow
	lastSweep time.Time
	now       func() time.Time
}

type rateWindow struct {
	start time.Time
	count int
}

// NewRateLimiter allows limit requests per client in each window.
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{limit: limit, window: window, maxKeys: 100000, hits: map[string]*rateWindow{}, now: time.Now}
}

// rateKey is the client a request is counted against: its address, or its /64 for IPv6.
func rateKey(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil || parsed.To4() != nil {
		return ip
	}
	return parsed.Mask(net.CIDRMask(64, 128)).String() + "/64"
}

// Allow records a request from the client at ip and reports whether it is within the limit, and if not, how long
// until it may try again.
func (r *RateLimiter) Allow(ip string) (bool, time.Duration) {
	key := rateKey(ip)
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	if now.Sub(r.lastSweep) >= r.window { // drop finished windows, once a window
		for k, w := range r.hits {
			if now.Sub(w.start) >= r.window {
				delete(r.hits, k)
			}
		}
		r.lastSweep = now
	}
	w, ok := r.hits[key]
	if !ok || now.Sub(w.start) >= r.window {
		if !ok && len(r.hits) >= r.maxKeys { // more clients in one window than it tracks: forget an arbitrary one
			for k := range r.hits {
				delete(r.hits, k)
				break
			}
		}
		r.hits[key] = &rateWindow{start: now, count: 1}
		return true, 0
	}
	if w.count >= r.limit {
		return false, w.start.Add(r.window).Sub(now)
	}
	w.count++
	return true, 0
}

// RateLimit answers 429 once a client has made limit requests to this route in the window.
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	limiter := NewRateLimiter(limit, window)
	return func(context *gin.Context) {
		warnUntrustedProxy(context)
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
