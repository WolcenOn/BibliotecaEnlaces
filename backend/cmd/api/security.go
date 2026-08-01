package main

import (
	"net/http"
	"os"
	"strings"
)

func allowedOrigins() map[string]struct{} {
	configured := os.Getenv("FRONTEND_ORIGIN")
	if configured == "" {
		configured = "https://wolcenon.github.io,http://localhost:8000"
	}
	origins := make(map[string]struct{})
	for _, origin := range strings.Split(configured, ",") {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin != "" {
			origins[origin] = struct{}{}
		}
	}
	return origins
}

func secureCors(next http.Handler) http.Handler {
	origins := allowedOrigins()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Add("Vary", "Origin")

		origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
		if origin != "" {
			if _, ok := origins[origin]; !ok {
				writeError(w, http.StatusForbidden, "origin not allowed")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
