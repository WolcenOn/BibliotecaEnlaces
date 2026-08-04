package main

import (
	"net/http"
	"time"
)

// livenessHealth only verifies that the HTTP process is running. Railway must
// not restart a healthy process because PostgreSQL is briefly unavailable.
func (a *api) livenessHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "api",
		"time":    time.Now().UTC(),
	})
}
