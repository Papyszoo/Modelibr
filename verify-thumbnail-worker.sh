#!/bin/bash
# Verification script for thumbnail worker WebGL setup
# This script checks if the thumbnail-worker container is properly configured

set -e

echo "=========================================="
echo "Modelibr Thumbnail Worker Verification"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if container is running
echo "1. Checking if thumbnail-worker container exists..."
if docker ps -a --format '{{.Names}}' | grep -q "thumbnail-worker"; then
    echo -e "${GREEN}✓ Container exists${NC}"
    
    if docker ps --format '{{.Names}}' | grep -q "thumbnail-worker"; then
        echo -e "${GREEN}✓ Container is running${NC}"
        CONTAINER_RUNNING=true
    else
        echo -e "${YELLOW}⚠ Container exists but is not running${NC}"
        echo "  Start it with: docker compose up -d thumbnail-worker"
        CONTAINER_RUNNING=false
    fi
else
    # Check if image exists
    if docker images --format '{{.Repository}}' | grep -q "thumbnail-worker"; then
        echo -e "${YELLOW}⚠ Container does not exist but image exists${NC}"
        echo "  Create it with: docker compose up -d thumbnail-worker"
        CONTAINER_RUNNING=false
    else
        echo -e "${RED}✗ Container and image do not exist${NC}"
        echo "  Build it with: docker compose build thumbnail-worker"
        exit 1
    fi
fi

echo ""

# Check container image
echo "2. Checking container image age..."
IMAGE_ID=$(docker inspect thumbnail-worker --format='{{.Image}}' 2>/dev/null || echo "")
if [ -n "$IMAGE_ID" ]; then
    IMAGE_CREATED=$(docker inspect "$IMAGE_ID" --format='{{.Created}}' | cut -d'T' -f1)
    echo "   Image created: $IMAGE_CREATED"
    echo -e "${YELLOW}   If this is old, rebuild with: docker compose build --no-cache thumbnail-worker${NC}"
else
    echo -e "${YELLOW}⚠ Could not determine image age${NC}"
fi

echo ""

# Check Mesa libraries
echo "3. Checking if Mesa OpenGL libraries are installed..."
if docker run --rm --entrypoint=/bin/sh thumbnail-worker -c "dpkg -l | grep -q libgl1 && dpkg -l | grep -q mesa-utils" 2>/dev/null; then
    echo -e "${GREEN}✓ Mesa libraries (libgl1, mesa-utils) are installed${NC}"
    # Show versions
    docker run --rm --entrypoint=/bin/sh thumbnail-worker -c "dpkg -l | grep -E '(libgl1|mesa-utils)' | awk '{print \"   \" \$2 \" \" \$3}'"
else
    echo -e "${RED}✗ Mesa libraries are NOT installed${NC}"
    echo "  Rebuild the container: docker compose build --no-cache thumbnail-worker"
    exit 1
fi

echo ""

# Check Xvfb
echo "4. Checking if Xvfb is installed..."
if docker run --rm --entrypoint=/bin/sh thumbnail-worker -c "dpkg -l | grep -q xvfb" 2>/dev/null; then
    echo -e "${GREEN}✓ Xvfb is installed${NC}"
    docker run --rm --entrypoint=/bin/sh thumbnail-worker -c "dpkg -l | grep xvfb | awk '{print \"   \" \$2 \" \" \$3}'"
else
    echo -e "${RED}✗ Xvfb is NOT installed${NC}"
    echo "  Rebuild the container: docker compose build --no-cache thumbnail-worker"
    exit 1
fi

echo ""

# Test WebGL context creation
echo "5. Testing WebGL context creation..."
WEBGL_OUTPUT=$(docker run --rm --entrypoint=/bin/sh thumbnail-worker -c "DISPLAY=:99 Xvfb :99 -screen 0 1280x1024x24 & sleep 2 && DISPLAY=:99 node test-webgl-simple.js" 2>&1)

if echo "$WEBGL_OUTPUT" | grep -q "GL context created successfully"; then
    echo -e "${GREEN}✓ WebGL context creation successful${NC}"
    echo "$WEBGL_OUTPUT" | grep "GL context created successfully" | sed 's/^/   /'
else
    echo -e "${RED}✗ WebGL context creation FAILED${NC}"
    echo "Output:"
    echo "$WEBGL_OUTPUT" | sed 's/^/   /'
    echo ""
    echo "See docs/worker/VERIFICATION.md for troubleshooting steps"
    exit 1
fi

echo ""

# Check container startup (if running)
if [ "$CONTAINER_RUNNING" = true ]; then
    echo "6. Checking container logs for Xvfb startup..."
    if docker logs thumbnail-worker 2>&1 | grep -q "Xvfb started successfully"; then
        echo -e "${GREEN}✓ Xvfb started successfully in running container${NC}"
    else
        echo -e "${YELLOW}⚠ Could not find 'Xvfb started successfully' in logs${NC}"
        echo "  Last 10 log lines:"
        docker logs thumbnail-worker --tail=10 2>&1 | sed 's/^/   /'
    fi
fi

echo ""
echo "=========================================="
echo -e "${GREEN}All checks passed!${NC}"
echo "=========================================="
echo ""
echo "Your thumbnail-worker is properly configured for WebGL rendering."
echo ""
echo "If you experience issues:"
echo "  1. Check full documentation: docs/worker/VERIFICATION.md"
echo "  2. View container logs: docker compose logs thumbnail-worker"
echo "  3. Test manually: docker compose exec thumbnail-worker node test-webgl-simple.js"
echo ""
