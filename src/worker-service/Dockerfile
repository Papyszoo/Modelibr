# Dockerfile for the thumbnail worker service

# Build stage - install dependencies
FROM node:20-bookworm-slim AS builder

# Install build dependencies and CA certificates
# Need python and build tools for native modules (canvas, gl, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget git \
    python3 build-essential \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    libxi-dev libglu1-mesa-dev libglew-dev pkg-config \
    mesa-common-dev libgl1-mesa-dev \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with proper SSL configuration
# The allowlist proxy uses a self-signed certificate, so we need to disable strict SSL
# Also set environment variables for node-gyp to disable strict SSL
RUN npm config set strict-ssl false && \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    NODE_TLS_REJECT_UNAUTHORIZED=0 npm ci --omit=dev || NODE_TLS_REJECT_UNAUTHORIZED=0 npm install --production

# Runtime stage - only copy what's needed
FROM node:20-bookworm-slim AS runtime

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 ca-certificates dos2unix \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    libvips42 \
    libxi6 libglu1-mesa libglew2.2 xvfb xauth \
  && ln -s /usr/bin/python3 /usr/bin/python \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set NODE_ENV
ENV NODE_ENV=production

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy package files
COPY package*.json ./

# Copy application code
COPY . .

# Fix line endings in entrypoint script (handles cases where .gitattributes wasn't applied in existing checkouts)
# Make entrypoint script executable
RUN dos2unix docker-entrypoint.sh && chmod +x docker-entrypoint.sh

# Create X11 socket directory for Xvfb
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

RUN useradd -u 1001 worker && chown -R worker:worker /app
USER worker

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use custom entrypoint to properly handle xvfb-run arguments
ENTRYPOINT ["/app/docker-entrypoint.sh"]