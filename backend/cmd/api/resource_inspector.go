package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
)

const maxInspectionBytes = 2 << 20

type resourceInspection struct {
	URL          string `json:"url"`
	FinalURL     string `json:"finalUrl,omitempty"`
	Title        string `json:"title,omitempty"`
	Description  string `json:"description,omitempty"`
	ResourceType string `json:"resourceType"`
	Provider     string `json:"provider"`
	MIMEType     string `json:"mimeType,omitempty"`
	ThumbnailURL string `json:"thumbnailUrl,omitempty"`
}

var (
	titlePattern       = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	metaPattern        = regexp.MustCompile(`(?is)<meta\s+[^>]*>`)
	attrPattern        = regexp.MustCompile(`(?is)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`)
	paragraphPattern   = regexp.MustCompile(`(?is)<p(?:\s+[^>]*)?>(.*?)</p>`)
	scriptStylePattern = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<noscript[^>]*>.*?</noscript>`)
	spacePattern       = regexp.MustCompile(`\s+`)
)

func inspectResourceMetadata(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		URL string `json:"url"`
	}
	if !decodeJSON(w, r, &payload) {
		return
	}
	result, err := inspectRemoteResource(r.Context(), payload.URL)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func inspectRemoteResource(parent context.Context, rawURL string) (resourceInspection, error) {
	rawURL = strings.TrimSpace(rawURL)
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return resourceInspection{}, errors.New("el enlace no es una URL HTTP válida")
	}
	if err := validatePublicHost(parent, parsed.Hostname()); err != nil {
		return resourceInspection{}, err
	}

	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()

	if embedded, ok := inspectOEmbed(ctx, parsed); ok {
		return embedded, nil
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return errors.New("demasiadas redirecciones")
			}
			return validatePublicHost(req.Context(), req.URL.Hostname())
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return resourceInspection{}, errors.New("no se pudo preparar la inspección")
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; BibliotecaEnlaces/1.0; +https://github.com/WolcenOn/BibliotecaEnlaces)")
	req.Header.Set("Accept-Language", "es-ES,es;q=0.9,en;q=0.7")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/pdf,image/*;q=0.9,*/*;q=0.5")

	response, err := client.Do(req)
	if err != nil {
		return resourceInspection{}, errors.New("no se pudo acceder al recurso")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 400 {
		return resourceInspection{}, fmt.Errorf("el recurso respondió con estado %d", response.StatusCode)
	}

	finalURL := response.Request.URL
	contentType, _, _ := mime.ParseMediaType(response.Header.Get("Content-Type"))
	result := detectTechnicalResource(parsed, finalURL, contentType)
	result.URL = parsed.String()
	result.FinalURL = finalURL.String()
	result.MIMEType = contentType

	if strings.HasPrefix(contentType, "image/") {
		result.ThumbnailURL = finalURL.String()
		return result, nil
	}
	if contentType != "" && contentType != "text/html" && contentType != "application/xhtml+xml" {
		return result, nil
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, maxInspectionBytes))
	if err == nil {
		extractHTMLMetadata(body, finalURL, &result)
	}
	if isGenericTitle(result.Title, result.Provider) {
		result.Title = ""
	}
	if isGenericDescription(result.Description) {
		result.Description = ""
	}
	return result, nil
}

func inspectOEmbed(ctx context.Context, parsed *url.URL) (resourceInspection, bool) {
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	endpoint := ""
	provider := ""
	resourceType := "video"
	switch {
	case host == "youtu.be" || strings.Contains(host, "youtube.com"):
		endpoint = "https://www.youtube.com/oembed?format=json&url=" + url.QueryEscape(parsed.String())
		provider = "YouTube"
	case host == "vimeo.com" || strings.HasSuffix(host, ".vimeo.com"):
		endpoint = "https://vimeo.com/api/oembed.json?url=" + url.QueryEscape(parsed.String())
		provider = "Vimeo"
	default:
		return resourceInspection{}, false
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	req.Header.Set("User-Agent", "BibliotecaEnlaces/1.0")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return resourceInspection{}, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return resourceInspection{}, false
	}
	var payload struct {
		Title        string `json:"title"`
		AuthorName   string `json:"author_name"`
		ThumbnailURL string `json:"thumbnail_url"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&payload) != nil || strings.TrimSpace(payload.Title) == "" {
		return resourceInspection{}, false
	}
	description := ""
	if strings.TrimSpace(payload.AuthorName) != "" {
		description = "Publicado por " + strings.TrimSpace(payload.AuthorName) + "."
	}
	return resourceInspection{URL: parsed.String(), FinalURL: parsed.String(), Title: strings.TrimSpace(payload.Title), Description: description, ResourceType: resourceType, Provider: provider, MIMEType: "text/html", ThumbnailURL: strings.TrimSpace(payload.ThumbnailURL)}, true
}

func detectTechnicalResource(originalURL, finalURL *url.URL, contentType string) resourceInspection {
	host := strings.TrimPrefix(strings.ToLower(finalURL.Hostname()), "www.")
	pathname := strings.ToLower(finalURL.Path)
	result := resourceInspection{ResourceType: "link", Provider: host}
	switch {
	case host == "youtu.be" || strings.Contains(host, "youtube.com"):
		result.ResourceType, result.Provider = "video", "YouTube"
		videoID := finalURL.Query().Get("v")
		if host == "youtu.be" {
			videoID = strings.Trim(pathname, "/")
		}
		if videoID != "" {
			result.ThumbnailURL = "https://i.ytimg.com/vi/" + url.PathEscape(videoID) + "/hqdefault.jpg"
		}
	case host == "vimeo.com" || strings.HasSuffix(host, ".vimeo.com"):
		result.ResourceType, result.Provider = "video", "Vimeo"
	case host == "docs.google.com" && strings.Contains(pathname, "/document/"):
		result.ResourceType, result.Provider = "document", "Google Docs"
	case host == "docs.google.com" && strings.Contains(pathname, "/presentation/"):
		result.ResourceType, result.Provider = "presentation", "Google Slides"
	case host == "docs.google.com" && strings.Contains(pathname, "/spreadsheets/"):
		result.ResourceType, result.Provider = "spreadsheet", "Google Sheets"
	case host == "drive.google.com":
		result.ResourceType, result.Provider = "document", "Google Drive"
	case contentType == "application/pdf" || strings.HasSuffix(pathname, ".pdf"):
		result.ResourceType = "pdf"
	case strings.HasPrefix(contentType, "image/"):
		result.ResourceType = "image"
	case strings.HasPrefix(contentType, "video/"):
		result.ResourceType = "video"
	case strings.HasPrefix(contentType, "audio/"):
		result.ResourceType = "audio"
	case strings.Contains(contentType, "presentation"):
		result.ResourceType = "presentation"
	case strings.Contains(contentType, "spreadsheet") || strings.Contains(contentType, "excel"):
		result.ResourceType = "spreadsheet"
	case strings.Contains(contentType, "word") || strings.Contains(contentType, "document"):
		result.ResourceType = "document"
	default:
		extension := strings.ToLower(path.Ext(pathname))
		if extension == ".png" || extension == ".jpg" || extension == ".jpeg" || extension == ".gif" || extension == ".webp" || extension == ".svg" {
			result.ResourceType = "image"
		}
	}
	_ = originalURL
	return result
}

func extractHTMLMetadata(body []byte, baseURL *url.URL, result *resourceInspection) {
	document := string(body)
	metadata := make(map[string]string)
	for _, tag := range metaPattern.FindAllString(document, -1) {
		attributes := parseAttributes(tag)
		key := strings.ToLower(firstNonEmpty(attributes["property"], attributes["name"], attributes["itemprop"]))
		content := cleanMetadataText(attributes["content"])
		if key != "" && content != "" {
			metadata[key] = content
		}
	}
	result.Title = firstNonEmpty(metadata["og:title"], metadata["twitter:title"], metadata["headline"], metadata["name"])
	if result.Title == "" {
		if match := titlePattern.FindStringSubmatch(document); len(match) == 2 {
			result.Title = cleanMetadataText(stripTags(match[1]))
		}
	}
	result.Description = firstNonEmpty(metadata["og:description"], metadata["twitter:description"], metadata["description"], metadata["article:description"])
	if isGenericDescription(result.Description) {
		result.Description = firstMeaningfulParagraph(document)
	}
	image := firstNonEmpty(metadata["og:image:secure_url"], metadata["og:image"], metadata["twitter:image"], metadata["twitter:image:src"])
	if image != "" {
		if resolved, err := baseURL.Parse(strings.TrimSpace(image)); err == nil && (resolved.Scheme == "http" || resolved.Scheme == "https") {
			result.ThumbnailURL = resolved.String()
		}
	}
}

func firstMeaningfulParagraph(document string) string {
	cleaned := scriptStylePattern.ReplaceAllString(document, " ")
	for _, match := range paragraphPattern.FindAllStringSubmatch(cleaned, -1) {
		if len(match) != 2 {
			continue
		}
		text := cleanMetadataText(stripTags(match[1]))
		length := len([]rune(text))
		if length >= 80 && length <= 600 && !isGenericDescription(text) {
			return text
		}
	}
	return ""
}

func cleanMetadataText(value string) string {
	value = html.UnescapeString(strings.TrimSpace(value))
	value = spacePattern.ReplaceAllString(value, " ")
	if len([]rune(value)) > 600 {
		value = string([]rune(value)[:600])
	}
	return strings.TrimSpace(value)
}

func isGenericTitle(value, provider string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	provider = strings.ToLower(strings.TrimSpace(provider))
	if value == "" {
		return false
	}
	generic := []string{"inicio", "home", "página principal", "welcome", "untitled", "documento sin título", "just a moment", "access denied"}
	for _, item := range generic {
		if value == item || value == item+" | "+provider {
			return true
		}
	}
	return value == provider
}

func isGenericDescription(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "" {
		return false
	}
	generic := []string{"sitio web", "página web", "más información", "descubre más", "haz clic aquí", "welcome", "inicio", "contenido digital", "recurso online"}
	if len([]rune(value)) < 35 {
		return true
	}
	for _, item := range generic {
		if value == item || strings.HasPrefix(value, item+".") {
			return true
		}
	}
	return false
}

func parseAttributes(tag string) map[string]string {
	attributes := make(map[string]string)
	for _, match := range attrPattern.FindAllStringSubmatch(tag, -1) {
		value := firstNonEmpty(match[2], match[3], match[4])
		attributes[strings.ToLower(match[1])] = value
	}
	return attributes
}

func validatePublicHost(ctx context.Context, hostname string) error {
	hostname = strings.TrimSpace(strings.ToLower(hostname))
	if hostname == "" || hostname == "localhost" || strings.HasSuffix(hostname, ".localhost") {
		return errors.New("el destino no es público")
	}
	addresses, err := net.DefaultResolver.LookupNetIP(ctx, "ip", hostname)
	if err != nil || len(addresses) == 0 {
		return errors.New("no se pudo resolver el dominio")
	}
	for _, address := range addresses {
		if !isPublicAddress(address) {
			return errors.New("el destino no es público")
		}
	}
	return nil
}

func isPublicAddress(address netip.Addr) bool {
	return address.IsValid() && !address.IsLoopback() && !address.IsPrivate() && !address.IsLinkLocalUnicast() && !address.IsLinkLocalMulticast() && !address.IsMulticast() && !address.IsUnspecified()
}

func stripTags(value string) string {
	replacer := regexp.MustCompile(`(?is)<[^>]+>`)
	return replacer.ReplaceAllString(value, "")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
