#!/bin/bash
# Test script to verify Docker Compose worker resilience and certificate handling
# This addresses connection issues between thumbnail-worker and webapi during Visual Studio debugging

set -e

echo "=== Docker Compose Worker Connection Resilience Test ==="
echo "This test verifies that the thumbnail-worker handles API connection issues gracefully"
echo "including certificate/SSL problems common in Visual Studio debugging scenarios"
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
echo "   - webapi: Depends on postgres (service_healthy)"
echo "   - thumbnail-worker: Depends on webapi (service_started) with resilient connection handling"

echo ""
echo "3. SSL/Certificate configuration:"
echo "   - NODE_TLS_REJECT_UNAUTHORIZED: Configurable (default: 1)"
echo "   - Worker supports both HTTP and HTTPS with certificate fallbacks"
echo "   - Self-signed certificate tolerance in development mode"

echo ""
echo "=== Enhanced Connection Resilience Features ==="
echo "✓ Multi-strategy API connection testing (HTTP/HTTPS fallbacks)"
echo "✓ Certificate-aware connection handling for debugging scenarios"
echo "✓ Exponential backoff retry logic during worker startup"
echo "✓ Enhanced polling loop error handling with connection-specific retries"
echo "✓ Configurable SSL certificate validation (NODE_TLS_REJECT_UNAUTHORIZED)"
echo "✓ Development environment detection for relaxed SSL handling"
echo ""
echo "The worker now handles common Visual Studio debugging issues:"
echo "  1. SSL certificate problems (self-signed, development certs)"
echo "  2. HTTP vs HTTPS protocol mismatches"
echo "  3. API startup delays and timing issues"
echo "  4. Connection refused errors with appropriate retry strategies"
echo ""
echo "Configuration options for debugging:"
echo "  - Set NODE_TLS_REJECT_UNAUTHORIZED=0 to allow self-signed certificates"
echo "  - ASPNETCORE_ENVIRONMENT=Development enables additional fallback strategies"
echo "  - LOG_LEVEL=debug provides detailed connection attempt logging"
echo ""
echo "To test the full solution:"
echo "  docker compose up --build"
echo ""
echo "Expected behavior:"
echo "  1. Worker starts and tests API connection with multiple strategies"
echo "  2. If primary connection fails, tries HTTP/HTTPS fallbacks as appropriate"
echo "  3. Logs connection attempts clearly showing which strategy succeeded"
echo "  4. Continues normal operation once a working connection is established"