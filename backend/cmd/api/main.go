package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/WolcenOn/music-discovery-pwa/backend/internal/database"
	"github.com/jackc/pgx/v5/pgxpool"
)

type inspection struct {
	Platform string `json:"platform"`
	Type     string `json:"type"`
	URL      string `json:"url"`
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := database.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("database connection failed: %v", err)
	}
	defer pool.Close()

	if err := database.Migrate(ctx, pool); err != nil {
		log.Fatalf("database migration failed: %v", err)
	}
	log.Print("database connected and migrations applied")

	mux := http.NewServeMux()
	registerRoutes(mux, pool)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           cors(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("API listening on :%s", port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server failed: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("server shutdown failed: %v", err)
	}
}

func registerRoutes(mux *http.ServeMux, pool *pgxpool.Pool) {
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		checkCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		databaseStatus := "ok"
		statusCode := http.StatusOK
		if err := pool.Ping(checkCtx); err != nil {
			databaseStatus = "unavailable"
			statusCode = http.StatusServiceUnavailable
		}

		writeJSON(w, statusCode, map[string]any{
			"status":   map[bool]string{true: "ok", false: "degraded"}[statusCode == http.StatusOK],
			"database": databaseStatus,
			"time":     time.Now().UTC(),
		})
	})

	mux.HandleFunc("POST /api/v1/links/inspect", func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			URL string `json:"url"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil || strings.TrimSpace(payload.URL) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url is required"})
			return
		}

		payload.URL = strings.TrimSpace(payload.URL)
		platform, kind := detectLink(payload.URL)
		writeJSON(w, http.StatusOK, inspection{Platform: platform, Type: kind, URL: payload.URL})
	})
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
		w.Header().Set("Vary", "Origin")
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
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("encode response failed: %v", err)
	}
}
