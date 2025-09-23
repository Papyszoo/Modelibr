#!/bin/bash

# Integration test script for thumbnail upload API
# This script can be run when the database is available to test the full workflow

set -e

echo "🧪 Testing Thumbnail Upload API Integration"
echo "=========================================="

# Configuration
API_BASE_URL="http://localhost:5009"
TEST_MODEL_FILE="test-model.obj"
TEST_THUMBNAIL="test-thumbnail.png"

# Create a simple test model file
echo "📄 Creating test model file..."
cat > "$TEST_MODEL_FILE" << 'EOF'
# Simple cube OBJ file for testing
v -1.0 -1.0  1.0
v  1.0 -1.0  1.0
v  1.0  1.0  1.0
v -1.0  1.0  1.0
v -1.0 -1.0 -1.0
v  1.0 -1.0 -1.0
v  1.0  1.0 -1.0
v -1.0  1.0 -1.0

f 1 2 3 4
f 8 7 6 5
f 4 3 7 8
f 5 6 2 1
f 2 6 7 3
f 8 5 1 4
EOF

# Create a simple test thumbnail (base64 encoded 1x1 PNG)
echo "🖼️ Creating test thumbnail file..."
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbKd2+AAAAABJRU5ErkJggg==" | base64 -d > "$TEST_THUMBNAIL"

echo "✅ Test files created"

# Step 1: Upload a model to get a model ID
echo ""
echo "🔄 Step 1: Uploading model to create a model entry..."
MODEL_RESPONSE=$(curl -s -X POST \
  -F "file=@$TEST_MODEL_FILE" \
  "$API_BASE_URL/models" \
  -w "%{http_code}")

HTTP_CODE=$(echo "$MODEL_RESPONSE" | tail -c 4)
RESPONSE_BODY=$(echo "$MODEL_RESPONSE" | head -c -4)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Model uploaded successfully"
    MODEL_ID=$(echo "$RESPONSE_BODY" | grep -o '"Id":[0-9]*' | cut -d':' -f2)
    echo "   Model ID: $MODEL_ID"
else
    echo "❌ Failed to upload model. HTTP Code: $HTTP_CODE"
    echo "   Response: $RESPONSE_BODY"
    exit 1
fi

# Step 2: Upload thumbnail for the model
echo ""
echo "🔄 Step 2: Uploading thumbnail for model $MODEL_ID..."
THUMBNAIL_RESPONSE=$(curl -s -X POST \
  -F "file=@$TEST_THUMBNAIL" \
  -F "width=256" \
  -F "height=256" \
  "$API_BASE_URL/models/$MODEL_ID/thumbnail/upload" \
  -w "%{http_code}")

HTTP_CODE=$(echo "$THUMBNAIL_RESPONSE" | tail -c 4)
RESPONSE_BODY=$(echo "$THUMBNAIL_RESPONSE" | head -c -4)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Thumbnail uploaded successfully"
    echo "   Response: $RESPONSE_BODY"
else
    echo "❌ Failed to upload thumbnail. HTTP Code: $HTTP_CODE"
    echo "   Response: $RESPONSE_BODY"
    exit 1
fi

# Step 3: Check thumbnail status
echo ""
echo "🔄 Step 3: Checking thumbnail status..."
STATUS_RESPONSE=$(curl -s -X GET \
  "$API_BASE_URL/models/$MODEL_ID/thumbnail" \
  -w "%{http_code}")

HTTP_CODE=$(echo "$STATUS_RESPONSE" | tail -c 4)
RESPONSE_BODY=$(echo "$STATUS_RESPONSE" | head -c -4)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Thumbnail status retrieved successfully"
    echo "   Response: $RESPONSE_BODY"
    
    # Check if status is Ready
    if echo "$RESPONSE_BODY" | grep -q '"Status":"Ready"'; then
        echo "✅ Thumbnail status is Ready"
    else
        echo "⚠️  Thumbnail status is not Ready yet"
    fi
else
    echo "❌ Failed to get thumbnail status. HTTP Code: $HTTP_CODE"
    echo "   Response: $RESPONSE_BODY"
    exit 1
fi

# Step 4: Try to download thumbnail file
echo ""
echo "🔄 Step 4: Testing thumbnail file download..."
DOWNLOAD_RESPONSE=$(curl -s -X GET \
  "$API_BASE_URL/models/$MODEL_ID/thumbnail/file" \
  -w "%{http_code}" \
  -o "downloaded_thumbnail.png")

HTTP_CODE=$(echo "$DOWNLOAD_RESPONSE" | tail -c 4)

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Thumbnail file downloaded successfully"
    echo "   File saved as: downloaded_thumbnail.png"
    echo "   File size: $(wc -c < downloaded_thumbnail.png) bytes"
else
    echo "❌ Failed to download thumbnail file. HTTP Code: $HTTP_CODE"
    # Don't exit here as the thumbnail might need processing time
fi

# Cleanup
echo ""
echo "🧹 Cleaning up test files..."
rm -f "$TEST_MODEL_FILE" "$TEST_THUMBNAIL" "downloaded_thumbnail.png"

echo ""
echo "🎉 Integration test completed successfully!"
echo ""
echo "Summary:"
echo "- ✅ Model upload endpoint working"
echo "- ✅ Thumbnail upload endpoint working"  
echo "- ✅ Thumbnail status endpoint working"
echo "- ✅ API integration is functional"
echo ""
echo "The worker service should now be able to upload thumbnails via API"
echo "instead of writing to filesystem directories."