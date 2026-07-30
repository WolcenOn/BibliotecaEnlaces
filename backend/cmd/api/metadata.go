package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type musicMetadata struct {
	URL       string `json:"url"`
	Platform  string `json:"platform"`
	Type      string `json:"type"`
	ExternalID string `json:"externalId,omitempty"`
	Title     string `json:"title,omitempty"`
	Artist    string `json:"artist,omitempty"`
	ImageURL  string `json:"imageUrl,omitempty"`
}

var metadataHTTPClient = &http.Client{Timeout: 8 * time.Second}

func inspectLink(w http.ResponseWriter, r *http.Request) {
	var payload struct{ URL string `json:"url"` }
	if !decodeJSON(w, r, &payload) { return }
	metadata, err := resolveMusicMetadata(r.Context(), payload.URL)
	if err != nil { writeError(w, http.StatusBadRequest, err.Error()); return }
	writeJSON(w, http.StatusOK, metadata)
}

func resolveMusicMetadata(ctx context.Context, raw string) (musicMetadata, error) {
	canonical, parsed, err := canonicalMusicURL(raw)
	if err != nil { return musicMetadata{}, err }
	platform, kind := detectLink(canonical)
	result := musicMetadata{URL: canonical, Platform: platform, Type: kind, ExternalID: externalIDFromURL(parsed, platform, kind)}

	switch platform {
	case "spotify":
		if result.ExternalID != "" && os.Getenv("SPOTIFY_CLIENT_ID") != "" && os.Getenv("SPOTIFY_CLIENT_SECRET") != "" {
			if data, err := spotifyMetadata(ctx, kind, result.ExternalID); err == nil { mergeMetadata(&result, data); return result, nil }
		}
		if data, err := oEmbedMetadata(ctx, "https://open.spotify.com/oembed?url="+url.QueryEscape(canonical)); err == nil { mergeMetadata(&result, data) }
	case "youtube":
		if result.ExternalID != "" && os.Getenv("YOUTUBE_API_KEY") != "" {
			if data, err := youtubeMetadata(ctx, kind, result.ExternalID); err == nil { mergeMetadata(&result, data); return result, nil }
		}
		if kind == "video" {
			if data, err := oEmbedMetadata(ctx, "https://www.youtube.com/oembed?format=json&url="+url.QueryEscape(canonical)); err == nil { mergeMetadata(&result, data) }
		}
	}
	return result, nil
}

func canonicalMusicURL(raw string) (string, *url.URL, error) {
	raw = strings.TrimSpace(raw)
	u, err := url.ParseRequestURI(raw)
	if err != nil || u.Scheme == "" || u.Host == "" { return "", nil, fmt.Errorf("valid url is required") }
	u.Scheme = "https"
	u.Host = strings.ToLower(strings.TrimPrefix(u.Host, "www."))
	u.Fragment = ""

	switch {
	case u.Host == "youtu.be":
		id := strings.Trim(strings.Split(strings.Trim(u.Path, "/"), "/")[0], " ")
		u.Host, u.Path, u.RawQuery = "youtube.com", "/watch", url.Values{"v": []string{id}}.Encode()
	case strings.Contains(u.Host, "youtube.com"):
		u.Host = "youtube.com"
		q := u.Query()
		clean := url.Values{}
		if v := q.Get("v"); v != "" { clean.Set("v", v) }
		if list := q.Get("list"); list != "" { clean.Set("list", list) }
		if strings.Contains(u.Path, "/shorts/") {
			parts := strings.Split(strings.Trim(u.Path, "/"), "/")
			if len(parts) > 1 { u.Path = "/watch"; clean.Set("v", parts[1]) }
		} else if clean.Get("list") != "" && clean.Get("v") == "" { u.Path = "/playlist" } else { u.Path = "/watch" }
		u.RawQuery = clean.Encode()
	case strings.Contains(u.Host, "spotify.com"):
		u.Host = "open.spotify.com"
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) > 0 && strings.HasPrefix(parts[0], "intl-") { parts = parts[1:] }
		u.Path = "/" + strings.Join(parts, "/")
		u.RawQuery = ""
	default:
		u.RawQuery = ""
	}
	return u.String(), u, nil
}

func mergeMetadata(dst *musicMetadata, src musicMetadata) {
	if src.Title != "" { dst.Title = src.Title }
	if src.Artist != "" { dst.Artist = src.Artist }
	if src.ImageURL != "" { dst.ImageURL = src.ImageURL }
}

func oEmbedMetadata(ctx context.Context, endpoint string) (musicMetadata, error) {
	var payload struct { Title, AuthorName, ThumbnailURL string }
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	resp, err := metadataHTTPClient.Do(req)
	if err != nil { return musicMetadata{}, err }
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK { return musicMetadata{}, fmt.Errorf("metadata unavailable") }
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil { return musicMetadata{}, err }
	return musicMetadata{Title: payload.Title, Artist: payload.AuthorName, ImageURL: payload.ThumbnailURL}, nil
}

func spotifyMetadata(ctx context.Context, kind, id string) (musicMetadata, error) {
	form := strings.NewReader("grant_type=client_credentials")
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://accounts.spotify.com/api/token", form)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	credentials := os.Getenv("SPOTIFY_CLIENT_ID") + ":" + os.Getenv("SPOTIFY_CLIENT_SECRET")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(credentials)))
	resp, err := metadataHTTPClient.Do(req)
	if err != nil { return musicMetadata{}, err }
	defer resp.Body.Close()
	var token struct{ AccessToken string `json:"access_token"` }
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&token) != nil { return musicMetadata{}, fmt.Errorf("spotify authentication failed") }

	resource := map[string]string{"track":"tracks", "album":"albums", "playlist":"playlists", "artist":"artists"}[kind]
	if resource == "" { return musicMetadata{}, fmt.Errorf("unsupported spotify resource") }
	req, _ = http.NewRequestWithContext(ctx, http.MethodGet, "https://api.spotify.com/v1/"+resource+"/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	resp, err = metadataHTTPClient.Do(req)
	if err != nil { return musicMetadata{}, err }
	defer resp.Body.Close()
	var payload struct {
		Name string `json:"name"`
		Artists []struct{ Name string `json:"name"` } `json:"artists"`
		Owner struct{ DisplayName string `json:"display_name"` } `json:"owner"`
		Images []struct{ URL string `json:"url"` } `json:"images"`
		Album struct{ Images []struct{ URL string `json:"url"` } `json:"images"` } `json:"album"`
	}
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&payload) != nil { return musicMetadata{}, fmt.Errorf("spotify metadata unavailable") }
	artists := make([]string, 0, len(payload.Artists)); for _, artist := range payload.Artists { artists = append(artists, artist.Name) }
	image := ""; if len(payload.Images) > 0 { image = payload.Images[0].URL } else if len(payload.Album.Images) > 0 { image = payload.Album.Images[0].URL }
	artist := strings.Join(artists, ", "); if artist == "" { artist = payload.Owner.DisplayName }
	return musicMetadata{Title: payload.Name, Artist: artist, ImageURL: image}, nil
}

func youtubeMetadata(ctx context.Context, kind, id string) (musicMetadata, error) {
	resource := "videos"; part := "snippet"; if kind == "playlist" { resource = "playlists" }
	endpoint := fmt.Sprintf("https://www.googleapis.com/youtube/v3/%s?part=%s&id=%s&key=%s", resource, part, url.QueryEscape(id), url.QueryEscape(os.Getenv("YOUTUBE_API_KEY")))
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	resp, err := metadataHTTPClient.Do(req)
	if err != nil { return musicMetadata{}, err }
	defer resp.Body.Close()
	var payload struct { Items []struct { Snippet struct { Title, ChannelTitle string; Thumbnails struct { High struct{ URL string `json:"url"` } `json:"high"`; Medium struct{ URL string `json:"url"` } `json:"medium"` } `json:"thumbnails"` } `json:"snippet"` } `json:"items"` }
	if resp.StatusCode != http.StatusOK || json.NewDecoder(resp.Body).Decode(&payload) != nil || len(payload.Items) == 0 { return musicMetadata{}, fmt.Errorf("youtube metadata unavailable") }
	s := payload.Items[0].Snippet; image := s.Thumbnails.High.URL; if image == "" { image = s.Thumbnails.Medium.URL }
	return musicMetadata{Title: s.Title, Artist: s.ChannelTitle, ImageURL: image}, nil
}
