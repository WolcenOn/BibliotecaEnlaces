package main

import (
	"context"
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

const maxInspectionBytes = 1 << 20

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
	titlePattern = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	metaPattern  = regexp.MustCompile(`(?is)<meta\s+[^>]*>`)
	attrPattern  = regexp.MustCompile(`(?is)([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`)
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

	ctx, cancel := context.WithTimeout(parent, 8*time.Second)
	defer cancel()

	client := &http.Client{
		Timeout: 8 * time.Second,
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
	req.Header.Set("User-Agent", "BibliotecaEnlaces/1.0 (+metadata preview)")
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
	if err != nil {
		return result, nil
	}
	extractHTMLMetadata(body, finalURL, &result)
	return result, nil
}

func detectTechnicalResource(originalURL, finalURL *url.URL, contentType string) resourceInspection {
	host := strings.TrimPrefix(strings.ToLower(finalURL.Hostname()), "www.")
	pathname := strings.ToLower(finalURL.Path)
	result := resourceInspection{ResourceType: "link", Provider: host}

	switch {
	case host == "youtu.be" || strings.Contains(host, "youtube.com"):
		result.ResourceType = "video"
		result.Provider = "YouTube"
		videoID := finalURL.Query().Get("v")
		if host == "youtu.be" {
			videoID = strings.Trim(pathname, "/")
		}
		if videoID != "" {
			result.ThumbnailURL = "https://i.ytimg.com/vi/" + url.PathEscape(videoID) + "/hqdefault.jpg"
		}
	case host == "vimeo.com" || strings.HasSuffix(host, ".vimeo.com"):
		result.ResourceType = "video"
		result.Provider = "Vimeo"
	case host == "docs.google.com" && strings.Contains(pathname, "/document/"):
		result.ResourceType = "document"
		result.Provider = "Google Docs"
	case host == "docs.google.com" && strings.Contains(pathname, "/presentation/"):
		result.ResourceType = "presentation"
		result.Provider = "Google Slides"
	case host == "docs.google.com" && strings.Contains(pathname, "/spreadsheets/"):
		result.ResourceType = "spreadsheet"
		result.Provider = "Google Sheets"
	case host == "drive.google.com":
		result.ResourceType = "document"
		result.Provider = "Google Drive"
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
		content := strings.TrimSpace(attributes["content"])
		if key != "" && content != "" {
			metadata[key] = html.UnescapeString(content)
		}
	}

	result.Title = firstNonEmpty(metadata["og:title"], metadata["twitter:title"])
	if result.Title == "" {
		if match := titlePattern.FindStringSubmatch(document); len(match) == 2 {
			result.Title = strings.TrimSpace(html.UnescapeString(stripTags(match[1])))
		}
	}
	result.Description = firstNonEmpty(metadata["og:description"], metadata["twitter:description"], metadata["description"])
	image := firstNonEmpty(metadata["og:image:secure_url"], metadata["og:image"], metadata["twitter:image"], metadata["twitter:image:src"])
	if image != "" {
		if resolved, err := baseURL.Parse(strings.TrimSpace(image)); err == nil && (resolved.Scheme == "http" || resolved.Scheme == "https") {
			result.ThumbnailURL = resolved.String()
		}
	}
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
