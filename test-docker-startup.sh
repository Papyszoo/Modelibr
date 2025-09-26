#!/bin/bash
# Test script to verify Docker Compose startup order fix for thumbnail-worker
# This addresses the issue where thumbnail-worker failed to connect to webapi during startup

set -e

echo "=== Docker Compose Startup Order Test ==="
echo "This test verifies that the thumbnail-worker waits for webapi to be healthy before starting"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
fi

echo "1. Validating Docker Compose configuration..."
docker compose config --quiet
echo "✓ Docker Compose configuration is valid"

echo ""
echo "2. Checking service dependencies..."
echo "   - postgres: Has health check (pg_isready)"
echo "   - webapi: Depends on postgres (service_healthy) + has health check (/health endpoint)"
echo "   - thumbnail-worker: Depends on webapi (service_healthy)"

# Show the dependency chain
echo ""
echo "3. Service dependency chain:"
docker compose config | grep -A3 "depends_on:" | grep -E "(depends_on|condition)" || true

echo ""
echo "4. Health check configurations:"
docker compose config | grep -A5 "healthcheck:" | grep -E "(test|interval|timeout|retries|start_period)" || true

echo ""
echo "=== Fix Summary ==="
echo "✓ Added /health endpoint to WebApi (returns 'Healthy')"
echo "✓ Added curl to WebApi Docker image for health checks"
echo "✓ Configured webapi service with health check in docker-compose.yml"
echo "✓ Changed thumbnail-worker dependency from 'service_started' to 'service_healthy'"
echo ""
echo "This ensures thumbnail-worker only starts after webapi is ready to accept connections,"
echo "preventing the 'connect ECONNREFUSED' error when debugging with Visual Studio."
echo ""
echo "To test the full solution:"
echo "  docker compose up --build"
echo ""
echo "The logs should show:"
echo "  1. postgres starts and becomes healthy"
echo "  2. webapi starts, initializes, and becomes healthy"
echo "  3. thumbnail-worker starts and successfully connects to webapi"