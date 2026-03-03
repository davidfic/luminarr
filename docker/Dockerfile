# ── Build stage ───────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

ARG VERSION=dev
ARG BUILD_TIME=unknown

WORKDIR /app

# Download dependencies first (cached unless go.mod/go.sum change)
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# modernc/sqlite is pure Go — CGO_ENABLED=0 produces a fully static binary.
RUN CGO_ENABLED=0 GOOS=linux go build \
      -ldflags "-X github.com/davidfic/luminarr/internal/version.Version=${VERSION} \
                -X github.com/davidfic/luminarr/internal/version.BuildTime=${BUILD_TIME} \
                -s -w" \
      -o /luminarr ./cmd/luminarr

# ── Final stage ───────────────────────────────────────────────────────────────
# scratch: zero OS footprint. The binary is fully self-contained.
FROM scratch

# TLS root certificates (needed for outbound HTTPS: TMDB, indexers, Claude API)
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# The binary
COPY --from=builder /luminarr /luminarr

# Default data directory (mount a volume here in production)
VOLUME ["/config"]

EXPOSE 7878

ENTRYPOINT ["/luminarr"]
