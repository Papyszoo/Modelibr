# Dockerfile for the thumbnail worker service using Puppeteer

# Build stage - install dependencies
FROM node:20-bookworm-slim AS builder

# Install build dependencies and CA certificates
# python3, make, g++ are required for building native node modules like @tensorflow/tfjs-node
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates wget git \
    python3 make g++ \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and .npmrc
COPY package*.json .npmrc ./

# Install dependencies with proper SSL configuration
# The allowlist proxy uses a self-signed certificate, so we need to disable strict SSL
# Also, .npmrc tells Puppeteer to skip Chromium download
RUN npm config set strict-ssl false && \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm cache clean --force && \
    PUPPETEER_SKIP_DOWNLOAD=true NODE_TLS_REJECT_UNAUTHORIZED=0 npm install --production

# Runtime stage - only copy what's needed
FROM node:20-bookworm-slim AS runtime

# Install runtime dependencies for Puppeteer and TensorFlow
# Puppeteer requires these dependencies for headless Chrome
# TensorFlow.js-node requires C++ runtime libraries
# Based on https://pptr.dev/troubleshooting#chrome-doesnt-launch-on-linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    gnupg \
    # C++ runtime libraries for TensorFlow.js native bindings
    libstdc++6 \
    # Dependencies for Chromium
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
# Create Downloads directory as recommended by Puppeteer docs
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
