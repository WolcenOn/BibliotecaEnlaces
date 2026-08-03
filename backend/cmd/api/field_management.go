package main

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

type fieldOptionInput struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type fieldUpdateInput struct {
	Name         string             `json:"name"`
	FieldType    string             `json:"fieldType"`
	IsRequired   bool               `json:"isRequired"`
	IsFilterable bool               `json:"isFilterable"`
	Options      []fieldOptionInput `json:"options"`
}

func (a *api) registerFieldManagementRoutes(mux *http.ServeMux) {
	mux.Handle("PATCH /api/v1/groups/{groupID}/fields/{fieldID}", a.requireAuth(http.HandlerFunc(a.updateCustomField)))
	mux.Handle("DELETE /api/v1/groups/{groupID}/fields/{fieldID}", a.requireAuth(http.HandlerFunc(a.deleteCustomField)))
}

func (a *api) updateCustomField(w http.ResponseWriter, r *http.Request) {
	groupID, fieldID := r.PathValue("groupID"), r.PathValue("fieldID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}

	var in fieldUpdateInput
	if !decodeJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || !validFieldType(in.FieldType) {
		writeError(w, http.StatusBadRequest, "name and a valid fieldType are required")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update field")
		return
	}
	defer tx.Rollback(r.Context())

	result, err := tx.Exec(r.Context(), `
		UPDATE custom_fields
		SET name=$3,field_type=$4,is_required=$5,is_filterable=$6,updated_at=NOW()
		WHERE id=$1 AND group_id=$2 AND is_active=TRUE`,
		fieldID, groupID, in.Name, in.FieldType, in.IsRequired, in.IsFilterable)
	if err != nil || result.RowsAffected() != 1 {
		writeError(w, http.StatusNotFound, "field not found")
		return
	}

	kept := make([]string, 0, len(in.Options))
	for index, optionInput := range in.Options {
		label := strings.TrimSpace(optionInput.Label)
		if label == "" {
			continue
		}
		optionID := strings.TrimSpace(optionInput.ID)
		if optionID != "" {
			var updatedID string
			err = tx.QueryRow(r.Context(), `
				UPDATE custom_field_options
				SET label=$4,value=$5,sort_order=$6,is_active=TRUE
				WHERE id=$1 AND field_id=$2
				  AND EXISTS(SELECT 1 FROM custom_fields WHERE id=$2 AND group_id=$3 AND is_active=TRUE)
				RETURNING id`, optionID, fieldID, groupID, label, normalizeSlug(label), index).Scan(&updatedID)
			if err == nil {
				kept = append(kept, updatedID)
				continue
			}
			if err != pgx.ErrNoRows {
				writeError(w, http.StatusConflict, "could not update field option")
				return
			}
		}

		var newID string
		err = tx.QueryRow(r.Context(), `
			INSERT INTO custom_field_options(field_id,label,value,sort_order)
			VALUES($1,$2,$3,$4)
			RETURNING id`, fieldID, label, normalizeSlug(label), index).Scan(&newID)
		if err != nil {
			writeError(w, http.StatusConflict, "field option already exists")
			return
		}
		kept = append(kept, newID)
	}

	if len(kept) == 0 {
		_, err = tx.Exec(r.Context(), `UPDATE custom_field_options SET is_active=FALSE WHERE field_id=$1`, fieldID)
	} else {
		_, err = tx.Exec(r.Context(), `UPDATE custom_field_options SET is_active=FALSE WHERE field_id=$1 AND NOT (id = ANY($2::uuid[]))`, fieldID, kept)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not synchronize field options")
		return
	}

	if err = tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save field changes")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) deleteCustomField(w http.ResponseWriter, r *http.Request) {
	groupID, fieldID := r.PathValue("groupID"), r.PathValue("fieldID")
	claims := claimsFrom(r.Context())
	if !a.isGroupAdmin(r.Context(), groupID, claims.UserID) {
		writeError(w, http.StatusForbidden, "administrator role required")
		return
	}

	tx, err := a.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove field")
		return
	}
	defer tx.Rollback(r.Context())

	result, err := tx.Exec(r.Context(), `UPDATE custom_fields SET is_active=FALSE,updated_at=NOW() WHERE id=$1 AND group_id=$2 AND is_active=TRUE`, fieldID, groupID)
	if err != nil || result.RowsAffected() != 1 {
		writeError(w, http.StatusNotFound, "field not found")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE custom_field_options SET is_active=FALSE WHERE field_id=$1`, fieldID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove field options")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "could not finish field removal")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
