package main

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type customFieldOption struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Value     string `json:"value"`
	SortOrder int    `json:"sortOrder"`
}

type customField struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Slug         string              `json:"slug"`
	FieldType    string              `json:"fieldType"`
	IsRequired   bool                `json:"isRequired"`
	IsFilterable bool                `json:"isFilterable"`
	SortOrder    int                 `json:"sortOrder"`
	Options      []customFieldOption `json:"options"`
}

type resourceInput struct {
	URL             string              `json:"url"`
	NormalizedURL   string              `json:"normalizedUrl"`
	FinalURL        string              `json:"finalUrl"`
	Title           string              `json:"title"`
	Description     string              `json:"description"`
	ResourceType    string              `json:"resourceType"`
	Provider        string              `json:"provider"`
	MIMEType        string              `json:"mimeType"`
	ThumbnailURL    string              `json:"thumbnailUrl"`
	OriginalComment string              `json:"originalComment"`
	SourceType      string              `json:"sourceType"`
	SourceAuthor    string              `json:"sourceAuthor"`
	SourceDate      *time.Time          `json:"sourceDate"`
	FieldValues     map[string][]string `json:"fieldValues"`
	Tags            []string            `json:"tags"`
}

func (a *api) registerConfigurableRoutes(mux *http.ServeMux) {
	mux.Handle("POST /api/v1/resources/inspect", a.requireAuth(http.HandlerFunc(inspectResourceMetadata)))
	mux.Handle("GET /api/v1/groups/{groupID}/fields", a.requireAuth(http.HandlerFunc(a.listCustomFields)))
	mux.Handle("POST /api/v1/groups/{groupID}/fields", a.requireAuth(http.HandlerFunc(a.createCustomField)))
	mux.Handle("POST /api/v1/groups/{groupID}/fields/{fieldID}/options", a.requireAuth(http.HandlerFunc(a.createCustomFieldOption)))
	mux.Handle("GET /api/v1/groups/{groupID}/resources", a.requireAuth(http.HandlerFunc(a.listResources)))
	mux.Handle("POST /api/v1/groups/{groupID}/resources", a.requireAuth(http.HandlerFunc(a.createResource)))
}

func (a *api) listCustomFields(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isActiveGroupMember(r, groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "active membership required")
		return
	}

	rows, err := a.db.Query(r.Context(), `
		SELECT id,name,slug,field_type,is_required,is_filterable,sort_order
		FROM custom_fields
		WHERE group_id=$1 AND is_active=TRUE
		ORDER BY sort_order,name`, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load fields")
		return
	}
	defer rows.Close()

	fields := make([]customField, 0)
	for rows.Next() {
		var field customField
		if err := rows.Scan(&field.ID, &field.Name, &field.Slug, &field.FieldType, &field.IsRequired, &field.IsFilterable, &field.SortOrder); err != nil {
			writeError(w, http.StatusInternalServerError, "could not read fields")
			return
		}
		field.Options = make([]customFieldOption, 0)
		optionRows, err := a.db.Query(r.Context(), `
			SELECT id,label,value,sort_order
			FROM custom_field_options
			WHERE field_id=$1 AND is_active=TRUE
			ORDER BY sort_order,label`, field.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not load field options")
			return
		}
		for optionRows.Next() {
			var option customFieldOption
			if optionRows.Scan(&option.ID, &option.Label, &option.Value, &option.SortOrder) == nil {
				field.Options = append(field.Options, option)
			}
		}
		optionRows.Close()
		fields = append(fields, field)
	}
	writeJSON(w, http.StatusOK, fields)
}

func (a *api) createCustomField(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}
	var in struct {
		Name         string   `json:"name"`
		Slug         string   `json:"slug"`
		FieldType    string   `json:"fieldType"`
		IsRequired   bool     `json:"isRequired"`
		IsFilterable bool     `json:"isFilterable"`
		SortOrder    int      `json:"sortOrder"`
		Options      []string `json:"options"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.Slug = normalizeSlug(in.Slug)
	if in.Slug == "" {
		in.Slug = normalizeSlug(in.Name)
	}
	if in.Name == "" || in.Slug == "" || !validFieldType(in.FieldType) {
		writeError(w, http.StatusBadRequest, "name, slug and a valid fieldType are required")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create field")
		return
	}
	defer tx.Rollback(r.Context())

	var field customField
	err = tx.QueryRow(r.Context(), `
		INSERT INTO custom_fields(group_id,name,slug,field_type,is_required,is_filterable,sort_order)
		VALUES($1,$2,$3,$4,$5,$6,$7)
		RETURNING id,name,slug,field_type,is_required,is_filterable,sort_order`,
		groupID, in.Name, in.Slug, in.FieldType, in.IsRequired, in.IsFilterable, in.SortOrder,
	).Scan(&field.ID, &field.Name, &field.Slug, &field.FieldType, &field.IsRequired, &field.IsFilterable, &field.SortOrder)
	if err != nil {
		writeError(w, http.StatusConflict, "field slug already exists")
		return
	}
	field.Options = make([]customFieldOption, 0)
	for index, label := range in.Options {
		label = strings.TrimSpace(label)
		if label == "" {
			continue
		}
		var option customFieldOption
		err = tx.QueryRow(r.Context(), `
			INSERT INTO custom_field_options(field_id,label,value,sort_order)
			VALUES($1,$2,$3,$4)
			RETURNING id,label,value,sort_order`, field.ID, label, normalizeSlug(label), index,
		).Scan(&option.ID, &option.Label, &option.Value, &option.SortOrder)
		if err != nil {
			writeError(w, http.StatusConflict, "field option already exists")
			return
		}
		field.Options = append(field.Options, option)
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save field")
		return
	}
	writeJSON(w, http.StatusCreated, field)
}

func (a *api) createCustomFieldOption(w http.ResponseWriter, r *http.Request) {
	groupID, fieldID := r.PathValue("groupID"), r.PathValue("fieldID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}
	var in struct {
		Label     string `json:"label"`
		Value     string `json:"value"`
		SortOrder int    `json:"sortOrder"`
	}
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Label = strings.TrimSpace(in.Label)
	in.Value = normalizeSlug(in.Value)
	if in.Value == "" {
		in.Value = normalizeSlug(in.Label)
	}
	var option customFieldOption
	err := a.db.QueryRow(r.Context(), `
		INSERT INTO custom_field_options(field_id,label,value,sort_order)
		SELECT id,$3,$4,$5 FROM custom_fields WHERE id=$1 AND group_id=$2 AND is_active=TRUE
		RETURNING id,label,value,sort_order`, fieldID, groupID, in.Label, in.Value, in.SortOrder,
	).Scan(&option.ID, &option.Label, &option.Value, &option.SortOrder)
	if err != nil {
		writeError(w, http.StatusConflict, "could not create field option")
		return
	}
	writeJSON(w, http.StatusCreated, option)
}

func (a *api) listResources(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isActiveGroupMember(r, groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "active membership required")
		return
	}
	rows, err := a.db.Query(r.Context(), `
		SELECT id,url,title,description,resource_type,provider,mime_type,thumbnail_url,
		       original_comment,source_type,source_author,source_date,created_at
		FROM resources WHERE group_id=$1 ORDER BY created_at DESC LIMIT 200`, groupID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load resources")
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, url, title, description, resourceType, provider, mimeType, thumbnail, comment, sourceType, sourceAuthor string
		var sourceDate *time.Time
		var createdAt time.Time
		if rows.Scan(&id, &url, &title, &description, &resourceType, &provider, &mimeType, &thumbnail, &comment, &sourceType, &sourceAuthor, &sourceDate, &createdAt) == nil {
			items = append(items, map[string]any{
				"id": id, "url": url, "title": title, "description": description,
				"resourceType": resourceType, "provider": provider, "mimeType": mimeType,
				"thumbnailUrl": thumbnail, "originalComment": comment,
				"sourceType": sourceType, "sourceAuthor": sourceAuthor,
				"geminiTags": sourceAuthor,
				"sourceDate": sourceDate, "createdAt": createdAt,
			})
		}
	}
	writeJSON(w, http.StatusOK, items)
}

func (a *api) createResource(w http.ResponseWriter, r *http.Request) {
	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	if !a.isActiveGroupMember(r, groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "active membership required")
		return
	}
	var in resourceInput
	if !decodeJSON(w, r, &in) {
		return
	}
	in.URL = strings.TrimSpace(in.URL)
	in.NormalizedURL = strings.TrimSpace(in.NormalizedURL)
	if in.NormalizedURL == "" {
		in.NormalizedURL = in.URL
	}
	if in.URL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	if in.ResourceType == "" {
		in.ResourceType = "link"
	}
	if in.SourceType == "" {
		in.SourceType = "manual"
	}
	if len(in.Tags) > 0 {
		in.SourceAuthor = cleanGeminiTags(strings.Join(in.Tags, ","))
	} else {
		in.SourceAuthor = cleanGeminiTags(in.SourceAuthor)
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create resource")
		return
	}
	defer tx.Rollback(r.Context())
	var resourceID string
	err = tx.QueryRow(r.Context(), `
		INSERT INTO resources(group_id,url,normalized_url,final_url,title,description,resource_type,provider,mime_type,
		                      thumbnail_url,original_comment,source_type,source_author,source_date,created_by)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		RETURNING id`, groupID, in.URL, in.NormalizedURL, nullable(in.FinalURL), in.Title, in.Description,
		in.ResourceType, in.Provider, in.MIMEType, in.ThumbnailURL, in.OriginalComment,
		in.SourceType, in.SourceAuthor, in.SourceDate, claims.UserID,
	).Scan(&resourceID)
	if err != nil {
		writeError(w, http.StatusConflict, "resource already exists in this library")
		return
	}

	for fieldID, optionIDs := range in.FieldValues {
		for _, optionID := range optionIDs {
			if strings.TrimSpace(optionID) == "" {
				continue
			}
			result, err := tx.Exec(r.Context(), `
				INSERT INTO resource_field_values(resource_id,field_id,option_id)
				SELECT $1,f.id,o.id
				FROM custom_fields f
				JOIN custom_field_options o ON o.field_id=f.id
				WHERE f.id=$2 AND f.group_id=$3 AND o.id=$4 AND f.is_active=TRUE AND o.is_active=TRUE`,
				resourceID, fieldID, groupID, optionID)
			if err != nil || result.RowsAffected() != 1 {
				writeError(w, http.StatusBadRequest, "invalid custom field value")
				return
			}
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save resource")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": resourceID})
}

func (a *api) isActiveGroupMember(r *http.Request, groupID, userID string) bool {
	var exists bool
	err := a.db.QueryRow(r.Context(), `
		SELECT EXISTS(
			SELECT 1 FROM group_members
			WHERE group_id=$1 AND user_id=$2 AND status='active'
		)`, groupID, userID).Scan(&exists)
	return err == nil && exists
}

func validFieldType(value string) bool {
	switch value {
	case "single_select", "multi_select", "text", "number", "date", "boolean":
		return true
	default:
		return false
	}
}

func normalizeSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	previousDash := false
	for _, r := range value {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
			previousDash = false
		} else if !previousDash && b.Len() > 0 {
			b.WriteByte('-')
			previousDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func cleanGeminiTags(value string) string {
	seen := map[string]bool{}
	clean := make([]string, 0, 12)
	for _, raw := range strings.Split(value, ",") {
		tag := strings.TrimSpace(raw)
		key := strings.ToLower(tag)
		if tag == "" || seen[key] || len([]rune(tag)) > 50 {
			continue
		}
		seen[key] = true
		clean = append(clean, tag)
		if len(clean) == 12 {
			break
		}
	}
	return strings.Join(clean, ", ")
}

func nullable(value string) any {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return value
}

var _ = pgx.ErrNoRows
