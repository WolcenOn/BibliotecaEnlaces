package main

import (
	"net/http"
	"strings"
)

func (a *api) resourceDashboard(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isActiveGroupMember(r, groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "active membership required")
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	addedBy := strings.TrimSpace(r.URL.Query().Get("addedBy"))
	rows, err := a.db.Query(r.Context(), `
		SELECT r.id,r.url,r.title,r.description,r.resource_type,r.provider,r.thumbnail_url,
		       r.original_comment,r.created_at,r.created_by,u.display_name,
		       COALESCE(AVG(rr.value),0),COUNT(DISTINCT rr.user_id),COUNT(DISTINCT rc.id),
		       EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=r.group_id AND gm.user_id=$2 AND gm.status='active' AND gm.role IN ('owner','admin')) OR r.created_by=$2
		FROM resources r
		JOIN users u ON u.id=r.created_by
		LEFT JOIN resource_ratings rr ON rr.resource_id=r.id
		LEFT JOIN resource_comments rc ON rc.resource_id=r.id
		WHERE r.group_id=$1
		  AND ($3='' OR r.title ILIKE '%'||$3||'%' OR r.description ILIKE '%'||$3||'%' OR r.provider ILIKE '%'||$3||'%')
		  AND ($4='' OR r.created_by::text=$4)
		GROUP BY r.id,u.display_name
		ORDER BY r.created_at DESC
		LIMIT 200`, groupID, claims.UserID, q, addedBy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load resource dashboard")
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, url, title, description, resourceType, provider, thumbnail, comment, createdBy, addedByName string
		var createdAt any
		var rating float64
		var votes, comments int
		var canEdit bool
		if err := rows.Scan(&id, &url, &title, &description, &resourceType, &provider, &thumbnail, &comment, &createdAt, &createdBy, &addedByName, &rating, &votes, &comments, &canEdit); err != nil {
			continue
		}
		items = append(items, map[string]any{"id": id, "url": url, "title": title, "description": description, "resourceType": resourceType, "provider": provider, "thumbnailUrl": thumbnail, "originalComment": comment, "createdAt": createdAt, "createdBy": createdBy, "addedBy": addedByName, "rating": rating, "votes": votes, "comments": comments, "canEdit": canEdit})
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *api) groupMembers(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isActiveGroupMember(r, groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "active membership required")
		return
	}
	rows, err := a.db.Query(r.Context(), `SELECT u.id,u.display_name FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.status='active' ORDER BY u.display_name`, groupID)
	if err != nil {
		writeError(w, 500, "could not load members")
		return
	}
	defer rows.Close()
	items := make([]map[string]string, 0)
	for rows.Next() {
		var id, name string
		if rows.Scan(&id, &name) == nil { items = append(items, map[string]string{"id": id, "displayName": name}) }
	}
	writeJSON(w, 200, items)
}

func (a *api) rateResource(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r.Context())
	var value struct{ Value int `json:"value"` }
	if !decodeJSON(w, r, &value) || value.Value < 1 || value.Value > 5 { if value.Value < 1 || value.Value > 5 { writeError(w, 400, "rating must be between 1 and 5") }; return }
	result, err := a.db.Exec(r.Context(), `INSERT INTO resource_ratings(resource_id,user_id,value) SELECT r.id,$2,$3 FROM resources r JOIN group_members gm ON gm.group_id=r.group_id AND gm.user_id=$2 AND gm.status='active' WHERE r.id=$1 ON CONFLICT(resource_id,user_id) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, r.PathValue("resourceID"), claims.UserID, value.Value)
	if err != nil || result.RowsAffected() != 1 { writeError(w, 404, "resource not found"); return }
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) resourceComments(w http.ResponseWriter, r *http.Request) {
	resourceID := r.PathValue("resourceID")
	claims := claimsFrom(r.Context())
	if r.Method == http.MethodGet {
		rows, err := a.db.Query(r.Context(), `SELECT rc.id,u.display_name,rc.body,rc.created_at FROM resource_comments rc JOIN users u ON u.id=rc.user_id JOIN resources res ON res.id=rc.resource_id JOIN group_members gm ON gm.group_id=res.group_id AND gm.user_id=$2 AND gm.status='active' WHERE rc.resource_id=$1 ORDER BY rc.created_at`, resourceID, claims.UserID)
		if err != nil { writeError(w, 500, "could not load comments"); return }
		defer rows.Close(); items := make([]map[string]any,0)
		for rows.Next(){ var id,name,body string; var createdAt any; if rows.Scan(&id,&name,&body,&createdAt)==nil { items=append(items,map[string]any{"id":id,"displayName":name,"body":body,"createdAt":createdAt}) } }
		writeJSON(w,200,items); return
	}
	var in struct{ Body string `json:"body"` }; if !decodeJSON(w,r,&in){return}; in.Body=strings.TrimSpace(in.Body); if in.Body==""{writeError(w,400,"comment is required");return}
	result,err:=a.db.Exec(r.Context(),`INSERT INTO resource_comments(resource_id,user_id,body) SELECT res.id,$2,$3 FROM resources res JOIN group_members gm ON gm.group_id=res.group_id AND gm.user_id=$2 AND gm.status='active' WHERE res.id=$1`,resourceID,claims.UserID,in.Body)
	if err!=nil||result.RowsAffected()!=1{writeError(w,404,"resource not found");return}; writeJSON(w,201,map[string]string{"status":"created"})
}

func (a *api) updateResource(w http.ResponseWriter, r *http.Request) {
	claims:=claimsFrom(r.Context()); resourceID:=r.PathValue("resourceID")
	var in struct{ Title,Description,Provider,OriginalComment,ThumbnailURL string }
	if !decodeJSON(w,r,&in){return}
	result,err:=a.db.Exec(r.Context(),`UPDATE resources r SET title=$3,description=$4,provider=$5,original_comment=$6,thumbnail_url=$7,updated_at=NOW() WHERE r.id=$1 AND (r.created_by=$2 OR EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=r.group_id AND gm.user_id=$2 AND gm.status='active' AND gm.role IN ('owner','admin')))`,resourceID,claims.UserID,strings.TrimSpace(in.Title),strings.TrimSpace(in.Description),strings.TrimSpace(in.Provider),strings.TrimSpace(in.OriginalComment),strings.TrimSpace(in.ThumbnailURL))
	if err!=nil||result.RowsAffected()!=1{writeError(w,403,"not allowed to edit this resource");return}; w.WriteHeader(204)
}

func (a *api) deleteResource(w http.ResponseWriter, r *http.Request) {
	claims:=claimsFrom(r.Context()); resourceID:=r.PathValue("resourceID")
	result,err:=a.db.Exec(r.Context(),`DELETE FROM resources r WHERE r.id=$1 AND (r.created_by=$2 OR EXISTS(SELECT 1 FROM group_members gm WHERE gm.group_id=r.group_id AND gm.user_id=$2 AND gm.status='active' AND gm.role IN ('owner','admin')))`,resourceID,claims.UserID)
	if err!=nil||result.RowsAffected()!=1{writeError(w,403,"not allowed to delete this resource");return}; w.WriteHeader(204)
}
