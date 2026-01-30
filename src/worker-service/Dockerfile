# Dockerfile for the thumbnail worker service using Puppeteer

# =============================================================================
# BASE STAGE - Install Chromium and dependencies (cached after first build)
# =============================================================================
# This stage is separate so the slow apt-get install is cached and reused
FROM node:20-bookworm-slim AS chromium-base

# Install runtime dependencies for Puppeteer/Chromium
# This is the slow step (~15min) but gets cached after first build
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    curl \
    gnupg \
    ffmpeg \
    chromium \
    chromium-driver \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*

# =============================================================================
# BUILD STAGE - Install Node dependencies
# =============================================================================
FROM node:20-bookworm-slim AS builder

# Install build dependencies and CA certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget git \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and .npmrc
COPY package*.json .npmrc ./

# Copy scripts directory (needed for download-model.js)
COPY scripts ./scripts

# Install dependencies with proper SSL configuration
RUN npm config set strict-ssl false && \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    SKIP_MODEL_DOWNLOAD=true PUPPETEER_SKIP_DOWNLOAD=true NODE_TLS_REJECT_UNAUTHORIZED=0 npm ci --omit=dev || \
    SKIP_MODEL_DOWNLOAD=true PUPPETEER_SKIP_DOWNLOAD=true NODE_TLS_REJECT_UNAUTHORIZED=0 npm install --production

# Download the BLIP model after dependencies are installed
RUN node scripts/download-model.js || echo "Model download failed, will download on first use"

# =============================================================================
# RUNTIME STAGE - Combine chromium base with app code
# =============================================================================
FROM chromium-base AS runtime

WORKDIR /app

# Set NODE_ENV
ENV NODE_ENV=production

# Tell Puppeteer to use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy .model-cache from builder stage (if it exists)
COPY --from=builder /app/.model-cache ./.model-cache

# Copy package files
COPY package*.json ./

# Copy application code
COPY . .

# Add user to audio,video groups so we don't need --no-sandbox (Puppeteer best practice)
RUN groupadd -r worker && useradd -r -g worker -G audio,video worker \
    && mkdir -p /home/worker/Downloads /app \
    && chown -R worker:worker /home/worker \
    && chown -R worker:worker /app

USER worker

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the application directly
CMD ["node", "index.js"]
