FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -o /music-discovery-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /music-discovery-api /music-discovery-api
EXPOSE 8080
ENTRYPOINT ["/music-discovery-api"]
