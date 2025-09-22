# Dockerfile for the thumbnail worker service

FROM node:20-alpine AS base

# Install FFmpeg for video/image processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S worker && \
    adduser -S worker -u 1001 -G worker

# Change ownership of the app directory
RUN chown -R worker:worker /app

USER worker

# Expose health check port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the worker service
CMD ["npm", "start"]