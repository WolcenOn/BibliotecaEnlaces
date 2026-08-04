package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/WolcenOn/BibliotecaEnlaces/backend/internal/auth"
	"github.com/WolcenOn/BibliotecaEnlaces/backend/internal/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type inspection struct {
	Platform string `json:"platform"`
	Type     string `json:"type"`
	URL      string `json:"url"`
}

type api struct {
	db        *pgxpool.Pool
	jwtSecret string
}

type currentUser struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	Status      string `json:"status"`
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

	jwtSecret := os.Getenv("JWT_SECRET")
	if len(jwtSecret) < 32 {
		log.Fatal("JWT_SECRET must contain at least 32 characters")
	}

	app := &api{db: pool, jwtSecret: jwtSecret}
	mux := http.NewServeMux()
	app.registerRoutes(mux)

	port := envOr("PORT", "8080")
	server := &http.Server{
		Addr:              ":" + port,
		Handler:           cors(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      65 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("database connected and migrations applied; API listening on :%s", port)
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

func (a *api) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", a.health)
	mux.HandleFunc("POST /api/v1/setup/bootstrap", a.bootstrap)
	mux.HandleFunc("POST /api/v1/auth/login", a.login)
	mux.HandleFunc("POST /api/v1/auth/register", a.registerAccount)
	mux.Handle("GET /api/v1/me", a.requireAuth(http.HandlerFunc(a.me)))
	mux.Handle("GET /api/v1/groups", a.requireAuth(http.HandlerFunc(a.groups)))
	mux.Handle("POST /api/v1/groups", a.requireAuth(http.HandlerFunc(a.createGroup)))
	mux.Handle("POST /api/v1/groups/{groupID}/invitations", a.requireAuth(http.HandlerFunc(a.createInvitation)))
	mux.HandleFunc("POST /api/v1/invitations/{token}/accept", a.acceptInvitation)
	mux.Handle("GET /api/v1/groups/{groupID}/membership-requests", a.requireAuth(http.HandlerFunc(a.membershipRequests)))
	mux.Handle("POST /api/v1/groups/{groupID}/membership-requests/{userID}/approve", a.requireAuth(http.HandlerFunc(a.approveMember)))
	mux.Handle("POST /api/v1/groups/{groupID}/resources/enrich", a.requireAuth(http.HandlerFunc(a.enrichResource)))
	mux.HandleFunc("POST /api/v1/links/inspect", inspectLink)
	a.registerConfigurableRoutes(mux)
	a.registerFieldManagementRoutes(mux)
	a.registerResourceSocialRoutes(mux)
}

func (a *api) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := a.db.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "degraded", "database": "unavailable", "time": time.Now().UTC()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "database": "ok", "time": time.Now().UTC()})
}

func (a *api) bootstrap(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SetupToken  string `json:"setupToken"`
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"displayName"`
		GroupName   string `json:"groupName"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if subtleToken(in.SetupToken) != subtleToken(os.Getenv("ADMIN_SETUP_TOKEN")) || os.Getenv("ADMIN_SETUP_TOKEN") == "" {
		writeError(w, http.StatusUnauthorized, "invalid setup token")
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
		writeError(w, http.StatusInternalServerError, "could not start setup")
		return
	}
	defer tx.Rollback(r.Context())
	var count int
	if err := tx.QueryRow(r.Context(), "SELECT COUNT(*) FROM users").Scan(&count); err != nil || count != 0 {
		writeError(w, http.StatusConflict, "application has already been initialized")
		return
	}
	var userID, groupID string
	if err := tx.QueryRow(r.Context(), `INSERT INTO users(email,password_hash,display_name,status) VALUES($1,$2,$3,'active') RETURNING id`, in.Email, hash, in.DisplayName).Scan(&userID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create administrator")
		return
	}
	if err := tx.QueryRow(r.Context(), `INSERT INTO groups(name,owner_id) VALUES($1,$2) RETURNING id`, in.GroupName, userID).Scan(&groupID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create group")
		return
	}
	if _, err := tx.Exec(r.Context(), `INSERT INTO group_members(group_id,user_id,role,status,joined_at) VALUES($1,$2,'owner','active',NOW())`, groupID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not add administrator to group")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not finish setup")
		return
	}
	token, _ := auth.CreateToken(a.jwtSecret, userID, in.Email, 24*time.Hour)
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "userId": userID, "groupId": groupID})
}

func (a *api) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password string }
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	var user currentUser
	var passwordHash string
	err := a.db.QueryRow(r.Context(), `SELECT id,email,display_name,status,password_hash FROM users WHERE email=$1`, in.Email).Scan(&user.ID, &user.Email, &user.DisplayName, &user.Status, &passwordHash)
	if err != nil || user.Status != "active" || !auth.CheckPassword(passwordHash, in.Password) {
		writeError(w, http.StatusUnauthorized, "invalid credentials or account not approved")
		return
	}
	token, err := auth.CreateToken(a.jwtSecret, user.ID, user.Email, 24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

func (a *api) me(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	var user currentUser
	if err := a.db.QueryRow(r.Context(), `SELECT id,email,display_name,status FROM users WHERE id=$1`, claims.UserID).Scan(&user.ID, &user.Email, &user.DisplayName, &user.Status); err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (a *api) groups(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	rows, err := a.db.Query(r.Context(), `SELECT g.id,g.name,gm.role FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_id=$1 AND gm.status='active' ORDER BY g.name`, claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load groups")
		return
	}
	defer rows.Close()
	items := make([]map[string]string, 0)
	for rows.Next() {
		var id, name, role string
		if rows.Scan(&id, &name, &role) == nil {
			items = append(items, map[string]string{"id": id, "name": name, "role": role})
		}
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *api) createInvitation(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}
	var in struct {
		ExpiresHours int `json:"expiresHours"`
		MaxUses      int `json:"maxUses"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	if in.ExpiresHours <= 0 || in.ExpiresHours > 720 {
		in.ExpiresHours = 168
	}
	if in.MaxUses <= 0 || in.MaxUses > 100 {
		in.MaxUses = 1
	}
	raw, err := randomToken(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not generate invitation")
		return
	}
	hash := sha256.Sum256([]byte(raw))
	expires := time.Now().UTC().Add(time.Duration(in.ExpiresHours) * time.Hour)
	if _, err := a.db.Exec(r.Context(), `INSERT INTO invitations(group_id,token_hash,created_by,expires_at,max_uses) VALUES($1,$2,$3,$4,$5)`, groupID, hex.EncodeToString(hash[:]), claims.UserID, expires, in.MaxUses); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save invitation")
		return
	}
	baseURL := strings.TrimRight(envOr("FRONTEND_APP_URL", "https://wolcenon.github.io/BibliotecaEnlaces"), "/")
	writeJSON(w, http.StatusCreated, map[string]any{"token": raw, "url": baseURL + "/invite.html?token=" + raw, "expiresAt": expires, "maxUses": in.MaxUses})
}

func (a *api) acceptInvitation(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Password, DisplayName string }
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.DisplayName = strings.TrimSpace(in.DisplayName)
	hashPassword, err := auth.HashPassword(in.Password)
	if err != nil || in.Email == "" || in.DisplayName == "" {
		writeError(w, http.StatusBadRequest, "valid email, displayName and password are required")
		return
	}
	tokenHash := sha256.Sum256([]byte(r.PathValue("token")))
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, 500, "could not accept invitation")
		return
	}
	defer tx.Rollback(r.Context())
	var invitationID, groupID string
	var uses, maxUses int
	err = tx.QueryRow(r.Context(), `SELECT id,group_id,uses,max_uses FROM invitations WHERE token_hash=$1 AND status='active' AND expires_at>NOW() FOR UPDATE`, hex.EncodeToString(tokenHash[:])).Scan(&invitationID, &groupID, &uses, &maxUses)
	if err != nil || uses >= maxUses {
		writeError(w, http.StatusGone, "invitation is invalid or expired")
		return
	}
	var userID string
	err = tx.QueryRow(r.Context(), `INSERT INTO users(email,password_hash,display_name,status) VALUES($1,$2,$3,'pending') RETURNING id`, in.Email, hashPassword, in.DisplayName).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusConflict, "email is already registered")
		return
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO group_members(group_id,user_id,role,status) VALUES($1,$2,'member','pending')`, groupID, userID); err != nil {
		writeError(w, 500, "could not create membership request")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE invitations SET uses=uses+1,status=CASE WHEN uses+1>=max_uses THEN 'expired' ELSE status END WHERE id=$1`, invitationID); err != nil {
		writeError(w, 500, "could not update invitation")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		writeError(w, 500, "could not finish invitation")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "pending_approval"})
}

func (a *api) membershipRequests(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, 403, "administrator role required")
		return
	}
	rows, err := a.db.Query(r.Context(), `SELECT u.id,u.email,u.display_name,gm.created_at FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.status='pending' ORDER BY gm.created_at`, groupID)
	if err != nil {
		writeError(w, 500, "could not load requests")
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, email, name string
		var created time.Time
		if rows.Scan(&id, &email, &name, &created) == nil {
			items = append(items, map[string]any{"id": id, "email": email, "displayName": name, "createdAt": created})
		}
	}
	writeJSON(w, 200, items)
}

func (a *api) approveMember(w http.ResponseWriter, r *http.Request) {
	groupID, userID := r.PathValue("groupID"), r.PathValue("userID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, 403, "administrator role required")
		return
	}
	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, 500, "could not approve member")
		return
	}
	defer tx.Rollback(r.Context())
	result, err := tx.Exec(r.Context(), `UPDATE group_members SET status='active',joined_at=NOW() WHERE group_id=$1 AND user_id=$2 AND status='pending'`, groupID, userID)
	if err != nil || result.RowsAffected() != 1 {
		writeError(w, 404, "membership request not found")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE users SET status='active',updated_at=NOW() WHERE id=$1`, userID); err != nil {
		writeError(w, 500, "could not activate user")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		writeError(w, 500, "could not finish approval")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) isGroupAdmin(ctx context.Context, groupID, userID string) bool {
	var exists bool
	_ = a.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active' AND role IN ('owner','admin'))`, groupID, userID).Scan(&exists)
	return exists
}

type contextKey string

const claimsKey contextKey = "claims"

func (a *api) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, 401, "authentication required")
			return
		}
		claims, err := auth.ParseToken(a.jwtSecret, strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
		if err != nil {
			writeError(w, 401, "invalid or expired session")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), claimsKey, claims)))
	})
}

func claimsFrom(ctx context.Context) auth.Claims {
	claims, _ := ctx.Value(claimsKey).(auth.Claims)
	return claims
}

func inspectLink(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		URL string `json:"url"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	payload.URL = strings.TrimSpace(payload.URL)
	if payload.URL == "" {
		writeError(w, 400, "url is required")
		return
	}
	platform, kind := detectLink(payload.URL)
	writeJSON(w, 200, inspection{Platform: platform, Type: kind, URL: payload.URL})
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

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, 400, "invalid JSON body")
		return false
	}
	return true
}
func randomToken(size int) (string, error) {
	b := make([]byte, size)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
func subtleToken(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}
func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := envOr("FRONTEND_ORIGIN", "http://localhost:8000")
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("encode response failed: %v", err)
	}
}

var _ = fmt.Sprintf
var _ = pgx.ErrNoRows
