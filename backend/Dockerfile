FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN sed -i '/mux.HandleFunc("POST \/api\/v1\/links\/inspect", inspectLink)/a\	a.registerMusicRoutes(mux)\n\ta.registerPasswordRecoveryRoutes(mux)' cmd/api/main.go
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -mod=readonly -o /music-discovery-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /music-discovery-api /music-discovery-api
EXPOSE 8080
ENTRYPOINT ["/music-discovery-api"]