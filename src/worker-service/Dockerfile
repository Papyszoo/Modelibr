# Dockerfile for the thumbnail worker service using Puppeteer
# Single-stage build to ensure TensorFlow native bindings work correctly

FROM node:20-bookworm-slim

# Install all dependencies including build tools and runtime libraries
# Build tools: python3, make, g++ for compiling native modules
# Runtime libraries: for running TensorFlow and Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    gnupg \
    git \
    # Build tools for native modules
    python3 \
    make \
    g++ \
    # C++ runtime libraries for TensorFlow.js native bindings  
    libstdc++6 \
    libgomp1 \
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

# Copy package files and .npmrc
COPY package*.json .npmrc ./

# Install dependencies with increased timeout for TensorFlow download
# TensorFlow native bindings will be downloaded and built during npm install
RUN npm config set fetch-timeout 600000 && \
    npm config set fetch-retries 3 && \
    PUPPETEER_SKIP_DOWNLOAD=true npm install --production

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
