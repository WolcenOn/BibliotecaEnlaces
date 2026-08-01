FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN sed -i '/mux.HandleFunc("POST \/api\/v1\/links\/inspect", inspectLink)/a\	a.registerMusicRoutes(mux)\n\	a.registerPasswordRecoveryRoutes(mux)' cmd/api/main.go
RUN sed -i 's#baseURL := strings.TrimRight(envOr("FRONTEND_APP_URL", "https://wolcenon.github.io/music-discovery-pwa"), "/")#baseURL := invitationFrontendURL()#' cmd/api/main.go
RUN sed -i 's#if in.ExpiresHours <= 0 || in.ExpiresHours > 720 { in.ExpiresHours = 168 }#if in.ExpiresHours <= 0 || in.ExpiresHours > 8760 { writeError(w, http.StatusBadRequest, "invalid invitation duration"); return }#' cmd/api/main.go
RUN sed -i 's#if in.MaxUses <= 0 || in.MaxUses > 100 { in.MaxUses = 1 }#if in.MaxUses <= 0 || in.MaxUses > 100 { writeError(w, http.StatusBadRequest, "invalid invitation maxUses"); return }#' cmd/api/main.go
RUN sed -i 's#Handler:           cors(mux),#Handler:           secureCors(mux),#' cmd/api/main.go
RUN gofmt -w cmd internal
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -mod=readonly -o /music-discovery-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /music-discovery-api /music-discovery-api
EXPOSE 8080
ENTRYPOINT ["/music-discovery-api"]