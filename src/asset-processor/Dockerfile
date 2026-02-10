# Dockerfile for the Modelibr Asset Processor Service

# Build ARG: set ENABLE_BLENDER=true to install Blender CLI (~500MB).
# Required only for .blend mesh analysis. Maya/3ds Max users can leave this off.
ARG ENABLE_BLENDER=false

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
    # Canvas runtime dependencies (needed for compiled native module)
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
  && rm -rf /var/lib/apt/lists/*

# =============================================================================
# BUILD STAGE - Install Node dependencies
# =============================================================================
FROM node:20-bookworm-slim AS builder

# Install build dependencies, CA certificates, and canvas native dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget git \
    # Python and build tools for node-gyp
    python3 build-essential \
    # Canvas native dependencies
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and .npmrc
COPY package*.json .npmrc ./

# Install dependencies with proper SSL configuration
RUN npm config set strict-ssl false && \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    SKIP_MODEL_DOWNLOAD=true PUPPETEER_SKIP_DOWNLOAD=true NODE_TLS_REJECT_UNAUTHORIZED=0 npm ci --omit=dev || \
    SKIP_MODEL_DOWNLOAD=true PUPPETEER_SKIP_DOWNLOAD=true NODE_TLS_REJECT_UNAUTHORIZED=0 npm install --production

# =============================================================================
# RUNTIME STAGE - Combine chromium base with app code
# =============================================================================
FROM chromium-base AS runtime

# Re-declare the ARG so it's available in this stage
ARG ENABLE_BLENDER=false

# Conditionally install Blender CLI (~500MB) for .blend mesh analysis.
# Skipped entirely when ENABLE_BLENDER=false (default) — zero image size cost.
RUN if [ "$ENABLE_BLENDER" = "true" ]; then \
      echo ">>> Installing Blender CLI..." && \
      apt-get update && apt-get install -y --no-install-recommends blender && \
      rm -rf /var/lib/apt/lists/* && \
      echo ">>> Blender installed: $(blender --version | head -1)"; \
    else \
      echo ">>> Blender NOT installed (ENABLE_BLENDER=$ENABLE_BLENDER)"; \
    fi

# Persist as an env var so the app can check at runtime
ENV BLENDER_ENABLED=$ENABLE_BLENDER

WORKDIR /app

# Set NODE_ENV
ENV NODE_ENV=production

# Tell Puppeteer to use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

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
