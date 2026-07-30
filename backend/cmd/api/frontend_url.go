package main

import (
	"net/url"
	"strings"
)

const defaultFrontendAppURL = "https://wolcenon.github.io/music-discovery-pwa"

// invitationFrontendURL protects invitation links from a common Railway
// misconfiguration where FRONTEND_APP_URL only contains the github.io host
// and omits the project-site path.
func invitationFrontendURL() string {
	raw := strings.TrimRight(envOr("FRONTEND_APP_URL", defaultFrontendAppURL), "/")
	parsed, err := url.Parse(raw)
	if err != nil {
		return defaultFrontendAppURL
	}

	if strings.EqualFold(parsed.Host, "wolcenon.github.io") && (parsed.Path == "" || parsed.Path == "/") {
		parsed.Path = "/music-discovery-pwa"
		return strings.TrimRight(parsed.String(), "/")
	}

	return raw
}
