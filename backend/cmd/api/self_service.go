package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/WolcenOn/BibliotecaEnlaces/backend/internal/auth"
)

func (a *api) registerAccount(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
		GroupName   string `json:"groupName"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.DisplayName = strings.TrimSpace(in.DisplayName)
	in.GroupName = strings.TrimSpace(in.GroupName)
	if in.Email == "" || in.DisplayName == "" || in.GroupName == "" {
		writeError(w, http.StatusBadRequest, "email, displayName and groupName are required")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start registration")
		return
	}
	defer tx.Rollback(r.Context())

	var userID, groupID string
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO users(email,password_hash,display_name,status)
		VALUES($1,$2,$3,'active') RETURNING id`,
		in.Email, hash, in.DisplayName,
	).Scan(&userID); err != nil {
		writeError(w, http.StatusConflict, "email is already registered")
		return
	}
	if err := tx.QueryRow(r.Context(), `
		INSERT INTO groups(name,owner_id) VALUES($1,$2) RETURNING id`,
		in.GroupName, userID,
	).Scan(&groupID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create library")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		INSERT INTO group_members(group_id,user_id,role,status,joined_at)
		VALUES($1,$2,'owner','active',NOW())`, groupID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not assign library owner")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not finish registration")
		return
	}

	token, err := auth.CreateToken(a.jwtSecret, userID, in.Email, 24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"token": token,
		"user": map[string]string{
			"id": userID, "email": in.Email, "displayName": in.DisplayName, "status": "active",
		},
		"group": map[string]string{"id": groupID, "name": in.GroupName, "role": "owner"},
	})
}

func (a *api) createGroup(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name string `json:"name"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len([]rune(in.Name)) > 120 {
		writeError(w, http.StatusBadRequest, "a library name between 1 and 120 characters is required")
		return
	}
	claims := claimsFrom(r.Context())
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start library creation")
		return
	}
	defer tx.Rollback(r.Context())

	var groupID string
	if err := tx.QueryRow(r.Context(), `INSERT INTO groups(name,owner_id) VALUES($1,$2) RETURNING id`, in.Name, claims.UserID).Scan(&groupID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create library")
		return
	}
	if _, err := tx.Exec(r.Context(), `
		INSERT INTO group_members(group_id,user_id,role,status,joined_at)
		VALUES($1,$2,'owner','active',NOW())`, groupID, claims.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not assign library owner")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not finish library creation")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": groupID, "name": in.Name, "role": "owner"})
}
