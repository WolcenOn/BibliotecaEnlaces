package main

import (
	"net/http"
	"os"
	"strings"

	"github.com/WolcenOn/BibliotecaEnlaces/backend/internal/auth"
)

func (a *api) resetOwnerPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SetupToken string `json:"setupToken"`
		Email      string `json:"email"`
		Password   string `json:"password"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}

	configuredToken := strings.TrimSpace(os.Getenv("ADMIN_SETUP_TOKEN"))
	providedToken := strings.TrimSpace(in.SetupToken)
	if configuredToken == "" || subtleToken(providedToken) != subtleToken(configuredToken) {
		writeError(w, http.StatusUnauthorized, "invalid recovery credentials")
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
		SET password_hash=$2
		WHERE u.email=$1
		  AND u.status='active'
		  AND EXISTS (
			SELECT 1
			FROM groups g
			JOIN group_members gm ON gm.group_id=g.id
			WHERE g.owner_id=u.id
			  AND gm.user_id=u.id
			  AND gm.role='owner'
			  AND gm.status='active'
		  )`, email, passwordHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not reset password")
		return
	}
	if result.RowsAffected() != 1 {
		writeError(w, http.StatusForbidden, "recovery is only available for an active library owner")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "password_updated"})
}
