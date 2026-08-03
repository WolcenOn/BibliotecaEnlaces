package main

import (
	"net/http"
	"strings"
	"time"
)

type managedMember struct {
	ID           string     `json:"id"`
	DisplayName  string     `json:"displayName"`
	Email        string     `json:"email"`
	Role         string     `json:"role"`
	Status       string     `json:"status"`
	JoinedAt     *time.Time `json:"joinedAt"`
	LastActivity *time.Time `json:"lastActivity"`
	Resources    int        `json:"resources"`
	Comments     int        `json:"comments"`
	Ratings      int        `json:"ratings"`
}

func (a *api) managedMembers(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT u.id,u.display_name,u.email,gm.role,gm.status,gm.joined_at,
		       GREATEST(
		         COALESCE(gm.joined_at,gm.created_at),
		         COALESCE((SELECT MAX(r.created_at) FROM resources r WHERE r.group_id=gm.group_id AND r.created_by=u.id),'-infinity'::timestamptz),
		         COALESCE((SELECT MAX(rc.created_at) FROM resource_comments rc JOIN resources r ON r.id=rc.resource_id WHERE r.group_id=gm.group_id AND rc.user_id=u.id),'-infinity'::timestamptz),
		         COALESCE((SELECT MAX(rr.updated_at) FROM resource_ratings rr JOIN resources r ON r.id=rr.resource_id WHERE r.group_id=gm.group_id AND rr.user_id=u.id),'-infinity'::timestamptz)
		       ) AS last_activity,
		       (SELECT COUNT(*) FROM resources r WHERE r.group_id=gm.group_id AND r.created_by=u.id),
		       (SELECT COUNT(*) FROM resource_comments rc JOIN resources r ON r.id=rc.resource_id WHERE r.group_id=gm.group_id AND rc.user_id=u.id),
		       (SELECT COUNT(*) FROM resource_ratings rr JOIN resources r ON r.id=rr.resource_id WHERE r.group_id=gm.group_id AND rr.user_id=u.id)
		FROM group_members gm
		JOIN users u ON u.id=gm.user_id
		WHERE gm.group_id=$1
		ORDER BY CASE gm.status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,u.display_name`, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load managed members")
		return
	}
	defer rows.Close()

	items := make([]managedMember, 0)
	for rows.Next() {
		var item managedMember
		if err := rows.Scan(&item.ID, &item.DisplayName, &item.Email, &item.Role, &item.Status, &item.JoinedAt, &item.LastActivity, &item.Resources, &item.Comments, &item.Ratings); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read managed members")
			return
		}
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *api) updateManagedMember(w http.ResponseWriter, r *http.Request) {
	groupID, userID := r.PathValue("groupID"), r.PathValue("userID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}

	var in struct {
		DisplayName string `json:"displayName"`
		Role        string `json:"role"`
		Status      string `json:"status"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	in.DisplayName = strings.TrimSpace(in.DisplayName)
	if in.DisplayName == "" || (in.Role != "member" && in.Role != "admin") || (in.Status != "active" && in.Status != "inactive") {
		writeError(w, http.StatusBadRequest, "valid displayName, role and status are required")
		return
	}

	var currentRole string
	if err := a.db.QueryRow(r.Context(), `SELECT role FROM group_members WHERE group_id=$1 AND user_id=$2`, groupID, userID).Scan(&currentRole); err != nil {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}
	if currentRole == "owner" {
		writeError(w, http.StatusForbidden, "the library owner cannot be edited here")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update member")
		return
	}
	defer tx.Rollback(r.Context())
	if _, err := tx.Exec(r.Context(), `UPDATE users SET display_name=$2 WHERE id=$1`, userID, in.DisplayName); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update member profile")
		return
	}
	result, err := tx.Exec(r.Context(), `UPDATE group_members SET role=$3,status=$4,joined_at=CASE WHEN $4='active' THEN COALESCE(joined_at,NOW()) ELSE joined_at END WHERE group_id=$1 AND user_id=$2 AND role<>'owner'`, groupID, userID, in.Role, in.Status)
	if err != nil || result.RowsAffected() != 1 {
		writeError(w, http.StatusInternalServerError, "could not update membership")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) deleteManagedMember(w http.ResponseWriter, r *http.Request) {
	groupID, userID := r.PathValue("groupID"), r.PathValue("userID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}
	if userID == claims.UserID {
		writeError(w, http.StatusForbidden, "you cannot remove yourself from the administration panel")
		return
	}
	result, err := a.db.Exec(r.Context(), `DELETE FROM group_members WHERE group_id=$1 AND user_id=$2 AND role<>'owner'`, groupID, userID)
	if err != nil || result.RowsAffected() != 1 {
		writeError(w, http.StatusForbidden, "member not found or protected")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
