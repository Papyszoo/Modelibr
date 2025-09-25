// Simple test demonstrating ThumbnailApiService usage
// Run with: node test-api-service.js

import fs from 'fs'
import { ThumbnailApiService } from './thumbnailApiService.js'
import { config } from './config.js'

// Mock configuration for testing
config.apiBaseUrl = 'http://localhost:5009'

async function testThumbnailApiService() {
  console.log('🧪 Testing ThumbnailApiService')
  console.log('================================')

  const apiService = new ThumbnailApiService()

  // Test 1: API Connection Test
  console.log('\n📡 Test 1: API Connection Test')
  try {
    const isConnected = await apiService.testConnection()
    console.log(
      `   Result: ${isConnected ? '✅ Connected' : '❌ Not Connected'}`
    )
  } catch (error) {
    console.log(`   Result: ❌ Error - ${error.message}`)
  }

  // Test 2: Single Thumbnail Upload (simulated)
  console.log('\n📤 Test 2: Single Thumbnail Upload (simulated)')

  // Create a test thumbnail file
  const testThumbnailPath = '/tmp/test-thumbnail.png'
  const testImageData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAHGbKd2+AAAAABJRU5ErkJggg==',
    'base64'
  )

  try {
    fs.writeFileSync(testThumbnailPath, testImageData)
    console.log(`   ✅ Created test thumbnail: ${testThumbnailPath}`)

    // Simulate upload (would normally require a running API and valid model ID)
    const mockModelId = 1
    console.log(`   📋 Would upload to model ID: ${mockModelId}`)
    console.log(`   📋 File size: ${testImageData.length} bytes`)
    console.log(
      `   📋 API endpoint: ${config.apiBaseUrl}/models/${mockModelId}/thumbnail/upload`
    )

    // Clean up
    fs.unlinkSync(testThumbnailPath)
    console.log(`   🧹 Cleaned up test file`)
  } catch (error) {
    console.log(`   ❌ Error creating test file: ${error.message}`)
  }

  // Test 3: Multiple Thumbnail Upload Structure
  console.log('\n📤 Test 3: Multiple Thumbnail Upload Structure')

  const mockThumbnailPaths = {
    webpPath: '/tmp/test.webp',
    posterPath: '/tmp/test.jpg',
  }

  console.log(`   📋 WebP path: ${mockThumbnailPaths.webpPath}`)
  console.log(`   📋 Poster path: ${mockThumbnailPaths.posterPath}`)
  console.log(`   📋 Upload priority: WebP first, poster as fallback`)

  // Test 4: Error Handling
  console.log('\n🚫 Test 4: Error Handling')

  try {
    // Test with non-existent file
    const result = await apiService.uploadThumbnail(
      999,
      '/non/existent/file.png'
    )
    console.log(`   Result: ${result.success ? '✅ Success' : '❌ Failed'}`)
    if (!result.success) {
      console.log(`   Error: ${result.error}`)
    }
  } catch (error) {
    console.log(`   ❌ Exception: ${error.message}`)
  }

  console.log('\n🎉 Test completed!')
  console.log('\nTo test with real API:')
  console.log('1. Start the backend API (dotnet run)')
  console.log('2. Upload a model to get a model ID')
  console.log('3. Use that model ID with uploadThumbnail()')
}

// Run the test
testThumbnailApiService().catch(console.error)
