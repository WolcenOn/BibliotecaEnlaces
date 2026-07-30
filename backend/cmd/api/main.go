package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type inspection struct {
	Platform string `json:"platform"`
	Type     string `json:"type"`
	URL      string `json:"url"`
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ok",
			"time":   time.Now().UTC(),
		})
	})

	mux.HandleFunc("POST /api/v1/links/inspect", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.URL == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url is required"})
			return
		}

		platform, kind := detectLink(payload.URL)
		writeJSON(w, http.StatusOK, inspection{Platform: platform, Type: kind, URL: payload.URL})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           cors(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("API listening on :%s", port)
	log.Fatal(server.ListenAndServe())
}

func detectLink(raw string) (string, string) {
	switch {
	case strings.Contains(raw, "open.spotify.com/track/"):
		return "spotify", "track"
	case strings.Contains(raw, "open.spotify.com/playlist/"):
		return "spotify", "playlist"
	case strings.Contains(raw, "open.spotify.com/album/"):
		return "spotify", "album"
	case strings.Contains(raw, "youtube.com/playlist"):
		return "youtube", "playlist"
	case strings.Contains(raw, "youtu.be/"), strings.Contains(raw, "youtube.com/watch"):
		return "youtube", "video"
	default:
		return "other", "link"
	}
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := os.Getenv("FRONTEND_ORIGIN")
		if origin == "" {
			origin = "http://localhost:8000"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
