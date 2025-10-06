# Dockerfile for the thumbnail worker service

FROM node:20-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 build-essential ca-certificates wget git \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    libvips-dev \
    libxi-dev libglu1-mesa-dev libglew-dev pkg-config xvfb xauth \
  && ln -s /usr/bin/python3 /usr/bin/python \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
# Note: Remove node_modules from .dockerignore to copy pre-installed dependencies
COPY package*.json ./
COPY node_modules ./node_modules

# Set NODE_ENV
ENV NODE_ENV=production

# Copy application code
COPY . .

RUN useradd -u 1001 worker && chown -R worker:worker /app
USER worker

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["xvfb-run", "-a", "-s", "-screen 0 1280x1024x24", "node", "index.js"]