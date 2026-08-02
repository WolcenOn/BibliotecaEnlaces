package main

import (
	"net/netip"
	"net/url"
	"testing"
)

func TestDetectTechnicalResource(t *testing.T) {
	tests := []struct {
		name         string
		rawURL       string
		contentType  string
		resourceType string
		provider     string
	}{
		{"PDF por cabecera", "https://example.org/material", "application/pdf", "pdf", "example.org"},
		{"Imagen directa", "https://example.org/photo.jpg", "image/jpeg", "image", "example.org"},
		{"YouTube", "https://www.youtube.com/watch?v=abc123", "text/html", "video", "YouTube"},
		{"Google Docs", "https://docs.google.com/document/d/abc/edit", "text/html", "document", "Google Docs"},
		{"Google Slides", "https://docs.google.com/presentation/d/abc/edit", "text/html", "presentation", "Google Slides"},
		{"Google Sheets", "https://docs.google.com/spreadsheets/d/abc/edit", "text/html", "spreadsheet", "Google Sheets"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			parsed, err := url.Parse(test.rawURL)
			if err != nil {
				t.Fatal(err)
			}
			result := detectTechnicalResource(parsed, parsed, test.contentType)
			if result.ResourceType != test.resourceType {
				t.Fatalf("resourceType=%q, expected %q", result.ResourceType, test.resourceType)
			}
			if result.Provider != test.provider {
				t.Fatalf("provider=%q, expected %q", result.Provider, test.provider)
			}
		})
	}
}

func TestExtractHTMLMetadata(t *testing.T) {
	base, _ := url.Parse("https://example.org/articles/item")
	result := resourceInspection{}
	htmlDocument := []byte(`<!doctype html><html><head>
		<title>Título de respaldo</title>
		<meta property="og:title" content="Recurso educativo">
		<meta name="description" content="Descripción del recurso">
		<meta property="og:image" content="/images/preview.jpg">
	</head></html>`)

	extractHTMLMetadata(htmlDocument, base, &result)
	if result.Title != "Recurso educativo" {
		t.Fatalf("title=%q", result.Title)
	}
	if result.Description != "Descripción del recurso" {
		t.Fatalf("description=%q", result.Description)
	}
	if result.ThumbnailURL != "https://example.org/images/preview.jpg" {
		t.Fatalf("thumbnail=%q", result.ThumbnailURL)
	}
}

func TestPrivateAddressesAreRejected(t *testing.T) {
	privateAddresses := []string{"127.0.0.1", "10.0.0.2", "192.168.1.10", "169.254.1.2", "::1", "fc00::1"}
	for _, raw := range privateAddresses {
		address := netip.MustParseAddr(raw)
		if isPublicAddress(address) {
			t.Fatalf("private address accepted: %s", raw)
		}
	}
	if !isPublicAddress(netip.MustParseAddr("1.1.1.1")) {
		t.Fatal("public address rejected")
	}
}
