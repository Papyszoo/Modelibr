#!/bin/bash
set -e

# API Base URL (mapped in docker-compose)
API_URL="http://localhost:8090"

echo "Populating data..."

# Upload Model
echo "Uploading 3D Model..."
curl -v -X POST "${API_URL}/models" \
  -H "msg: hello" \
  -F "file=@tests/e2e/assets/test-cube.glb"

echo -e "\n\nUploading Texture Set (Albedo)..."
# TextureType 1 = Albedo
curl -v -X POST "${API_URL}/texture-sets/with-file?name=TestTexture&textureType=1" \
  -F "file=@tests/e2e/assets/blue_color.png"

echo -e "\n\nData population complete."
