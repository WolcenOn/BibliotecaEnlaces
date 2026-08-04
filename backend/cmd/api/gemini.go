package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type enrichOption struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type enrichField struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	FieldType string         `json:"fieldType"`
	Options   []enrichOption `json:"options"`
}

type enrichRequest struct {
	URL          string        `json:"url"`
	Title        string        `json:"title"`
	Description  string        `json:"description"`
	Provider     string        `json:"provider"`
	ResourceType string        `json:"resourceType"`
	MIMEType     string        `json:"mimeType"`
	Fields       []enrichField `json:"fields"`
}

type suggestedFieldValue struct {
	FieldID  string   `json:"fieldId"`
	OptionIDs []string `json:"optionIds"`
}

type enrichResponse struct {
	Title        string                `json:"title"`
	Description  string                `json:"description"`
	Provider     string                `json:"provider"`
	ResourceType string                `json:"resourceType"`
	Tags         []string              `json:"tags"`
	FieldValues  []suggestedFieldValue `json:"fieldValues"`
	Source       string                `json:"source"`
	Model        string                `json:"model"`
}

type geminiGenerateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (a *api) enrichResource(w http.ResponseWriter, r *http.Request) {
	apiKey := strings.TrimSpace(os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" {
		writeError(w, http.StatusServiceUnavailable, "Gemini no está configurado. Añade GEMINI_API_KEY en Railway.")
		return
	}

	groupID := r.PathValue("groupID")
	claims := claimsFrom(r.Context())
	var member bool
	_ = a.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2 AND status='active')`, groupID, claims.UserID).Scan(&member)
	if !member {
		writeError(w, http.StatusForbidden, "No perteneces a esta biblioteca.")
		return
	}

	var in enrichRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	in.URL = strings.TrimSpace(in.URL)
	parsed, err := url.Parse(in.URL)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Hostname() == "" {
		writeError(w, http.StatusBadRequest, "La URL no es válida.")
		return
	}
	if len(in.Fields) > 100 {
		writeError(w, http.StatusBadRequest, "La biblioteca tiene demasiados campos para el análisis.")
		return
	}

	model := strings.TrimSpace(os.Getenv("GEMINI_MODEL"))
	if model == "" {
		model = "gemini-3.5-flash-lite"
	}

	fieldJSON, _ := json.Marshal(in.Fields)
	prompt := fmt.Sprintf(`Analiza este recurso para una biblioteca colaborativa en español.
Devuelve datos breves, objetivos y útiles. No inventes autores, fechas ni datos que no aparezcan en el recurso.
Conserva los datos existentes cuando sean correctos. La descripción debe tener como máximo 500 caracteres.
Para fieldValues usa únicamente fieldId y optionIds que existan en la lista proporcionada. Si no hay evidencia suficiente, omite ese campo.

URL: %s
Título actual: %s
Descripción actual: %s
Proveedor actual: %s
Tipo actual: %s
Campos configurables: %s`, in.URL, in.Title, in.Description, in.Provider, in.ResourceType, string(fieldJSON))

	parts := []map[string]any{{"text": prompt}}
	if isPDFResource(in) && parsed.Scheme == "https" {
		parts = append([]map[string]any{{"file_data": map[string]any{"mime_type": "application/pdf", "file_uri": in.URL}}}, parts...)
	}

	schema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title": map[string]any{"type": "string"},
			"description": map[string]any{"type": "string"},
			"provider": map[string]any{"type": "string"},
			"resourceType": map[string]any{"type": "string", "enum": []string{"link", "pdf", "image", "video", "audio", "document", "presentation", "spreadsheet", "interactive"}},
			"tags": map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "maxItems": 12},
			"fieldValues": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"fieldId": map[string]any{"type": "string"},
						"optionIds": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					},
					"required": []string{"fieldId", "optionIds"},
				},
			},
		},
		"required": []string{"title", "description", "provider", "resourceType", "tags", "fieldValues"},
	}

	payload := map[string]any{
		"contents": []map[string]any{{"role": "user", "parts": parts}},
		"generationConfig": map[string]any{
			"temperature":      0.2,
			"responseMimeType": "application/json",
			"responseSchema":   schema,
			"maxOutputTokens":  2048,
		},
	}
	body, _ := json.Marshal(payload)
	ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
	defer cancel()
	endpoint := "https://generativelanguage.googleapis.com/v1beta/models/" + url.PathEscape(model) + ":generateContent"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "No se pudo preparar la consulta a Gemini.")
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", apiKey)

	resp, err := (&http.Client{Timeout: 55 * time.Second}).Do(req)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Gemini no respondió a tiempo.")
		return
	}
	defer resp.Body.Close()
	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	var generated geminiGenerateResponse
	if json.Unmarshal(responseBody, &generated) != nil {
		writeError(w, http.StatusBadGateway, "Gemini devolvió una respuesta no válida.")
		return
	}
	if resp.StatusCode >= 400 || generated.Error != nil {
		message := "Gemini no pudo analizar el recurso."
		if generated.Error != nil && generated.Error.Message != "" {
			message = generated.Error.Message
		}
		writeError(w, http.StatusBadGateway, message)
		return
	}
	if len(generated.Candidates) == 0 || len(generated.Candidates[0].Content.Parts) == 0 {
		writeError(w, http.StatusBadGateway, "Gemini no devolvió sugerencias.")
		return
	}

	var out enrichResponse
	if err := json.Unmarshal([]byte(generated.Candidates[0].Content.Parts[0].Text), &out); err != nil {
		writeError(w, http.StatusBadGateway, "No se pudieron interpretar las sugerencias de Gemini.")
		return
	}
	validateEnrichment(&out, in)
	out.Source = "gemini"
	out.Model = model
	writeJSON(w, http.StatusOK, out)
}

func isPDFResource(in enrichRequest) bool {
	lowerURL := strings.ToLower(in.URL)
	return strings.Contains(strings.ToLower(in.MIMEType), "application/pdf") || strings.EqualFold(in.ResourceType, "pdf") || strings.Contains(lowerURL, ".pdf")
}

func validateEnrichment(out *enrichResponse, in enrichRequest) {
	out.Title = strings.TrimSpace(out.Title)
	out.Description = strings.TrimSpace(out.Description)
	if len([]rune(out.Description)) > 500 {
		out.Description = string([]rune(out.Description)[:500])
	}
	out.Provider = strings.TrimSpace(out.Provider)
	allowedTypes := map[string]bool{"link": true, "pdf": true, "image": true, "video": true, "audio": true, "document": true, "presentation": true, "spreadsheet": true, "interactive": true}
	if !allowedTypes[out.ResourceType] {
		out.ResourceType = in.ResourceType
	}

	seenTags := map[string]bool{}
	cleanTags := make([]string, 0, len(out.Tags))
	for _, tag := range out.Tags {
		tag = strings.TrimSpace(tag)
		key := strings.ToLower(tag)
		if tag == "" || seenTags[key] || len([]rune(tag)) > 50 {
			continue
		}
		seenTags[key] = true
		cleanTags = append(cleanTags, tag)
		if len(cleanTags) == 12 {
			break
		}
	}
	out.Tags = cleanTags

	valid := map[string]map[string]bool{}
	for _, field := range in.Fields {
		options := map[string]bool{}
		for _, option := range field.Options {
			options[option.ID] = true
		}
		valid[field.ID] = options
	}
	cleanValues := make([]suggestedFieldValue, 0, len(out.FieldValues))
	for _, value := range out.FieldValues {
		options, ok := valid[value.FieldID]
		if !ok {
			continue
		}
		ids := make([]string, 0, len(value.OptionIDs))
		seen := map[string]bool{}
		for _, id := range value.OptionIDs {
			if options[id] && !seen[id] {
				seen[id] = true
				ids = append(ids, id)
			}
		}
		if len(ids) > 0 {
			cleanValues = append(cleanValues, suggestedFieldValue{FieldID: value.FieldID, OptionIDs: ids})
		}
	}
	out.FieldValues = cleanValues
}
