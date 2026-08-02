package main

import (
	"net/http"
	"os"
	"strings"

	"github.com/WolcenOn/BibliotecaEnlaces/backend/internal/auth"
)

func (a *api) registerPasswordRecoveryRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/setup/reset-owner-password", a.resetOwnerPassword)
}

func (a *api) resetOwnerPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SetupToken string `json:"setupToken"`
		Email      string `json:"email"`
		Password   string `json:"password"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}

	configuredToken := os.Getenv("ADMIN_SETUP_TOKEN")
	if configuredToken == "" || subtleToken(strings.TrimSpace(in.SetupToken)) != subtleToken(configuredToken) {
		writeError(w, http.StatusUnauthorized, "invalid setup token")
		return
	}

	email := strings.ToLower(strings.TrimSpace(in.Email))
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}

	passwordHash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := a.db.Exec(r.Context(), `
		UPDATE users u
		SET password_hash = $2, status = 'active', updated_at = NOW()
		WHERE u.email = $1
		  AND EXISTS (
			SELECT 1
			FROM group_members gm
			WHERE gm.user_id = u.id
			  AND gm.role = 'owner'
		  )`, email, passwordHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	if result.RowsAffected() != 1 {
		writeError(w, http.StatusNotFound, "owner account not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "password_updated"})
}
