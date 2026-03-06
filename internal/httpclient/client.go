// Package httpclient provides a shared HTTP client used for all outbound
// requests from Luminarr. It:
//   - Logs every request with method, sanitized URL, HTTP status, and duration
//   - Strips auth-related query parameters from logged URLs
//   - Sets a descriptive User-Agent header on every request
//   - Blocks redirects to a different host (SSRF protection)
package httpclient

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/luminarr/luminarr/internal/version"
)

// Client wraps *http.Client with structured request logging and security
// controls. Construct one with New and use Do in place of http.Client.Do.
type Client struct {
	inner  *http.Client
	logger *slog.Logger
}

// New returns a Client with a 30-second timeout.
func New(logger *slog.Logger) *Client {
	return &Client{
		inner: &http.Client{
			Timeout:       30 * time.Second,
			CheckRedirect: sameHostOnly,
		},
		logger: logger,
	}
}

// Do executes the request, sets the User-Agent, and logs the outcome.
func (c *Client) Do(req *http.Request) (*http.Response, error) {
	req.Header.Set("User-Agent", "Luminarr/"+version.Version)

	start := time.Now()
	resp, err := c.inner.Do(req)

	status := 0
	if resp != nil {
		status = resp.StatusCode
	}

	c.logger.Info("outbound request",
		"method", req.Method,
		"url", sanitizeURL(req.URL),
		"status", status,
		"duration_ms", time.Since(start).Milliseconds(),
	)

	return resp, err
}

// sameHostOnly rejects redirects to a different host, guarding against SSRF
// through misconfigured plugin settings.
func sameHostOnly(req *http.Request, via []*http.Request) error {
	if len(via) == 0 {
		return nil
	}
	origHost := via[0].URL.Hostname()
	if req.URL.Hostname() != origHost {
		return fmt.Errorf("httpclient: redirect to %q blocked (cross-host redirects not allowed)", req.URL.Host)
	}
	return nil
}

// sanitizeURL returns a string representation of u with auth-related query
// parameters replaced by "***". The original *url.URL is not modified.
func sanitizeURL(u *url.URL) string {
	if u == nil {
		return ""
	}
	q := u.Query()
	changed := false
	for k := range q {
		if isSensitiveParam(strings.ToLower(k)) {
			q.Set(k, "***")
			changed = true
		}
	}
	if !changed {
		return u.String()
	}
	clean := *u
	clean.RawQuery = q.Encode()
	return clean.String()
}

// isSensitiveParam reports whether a lowercase query-parameter name is likely
// to carry credentials. We err on the side of redacting more rather than less.
func isSensitiveParam(name string) bool {
	for _, kw := range []string{"key", "token", "password", "secret", "auth"} {
		if strings.Contains(name, kw) {
			return true
		}
	}
	return false
}
