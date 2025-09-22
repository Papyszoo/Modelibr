# Dockerfile for the thumbnail worker service

FROM node:20-bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 build-essential ca-certificates wget git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
ENV NODE_ENV=production

RUN npm ci --omit=dev && npm cache clean --force
COPY . .

RUN useradd -u 1001 worker && chown -R worker:worker /app
USER worker

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["npm", "start"]