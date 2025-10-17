/**
 * Test script for Hugging Face image tagger
 * 
 * This script tests the new HuggingFaceTagger implementation
 * Run with: node test-huggingface-tagger.js
 */

import { HuggingFaceTagger } from './imageTagger/huggingfaceTagger.js'
import fs from 'fs/promises'
import sharp from 'sharp'

async function testTagger() {
  console.log('=== Testing Hugging Face Image Tagger ===\n')

  // Create a simple test image (a blue square)
  const testImageBuffer = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 3,
      background: { r: 50, g: 100, b: 200 }
    }
  })
    .png()
    .toBuffer()

  console.log('Created test image: 256x256 blue square')
  console.log('Test image size:', testImageBuffer.length, 'bytes\n')

  // Create tagger instance
  const tagger = new HuggingFaceTagger()

  console.log('Initializing tagger...')
  await tagger.initialize()
  console.log('Tagger initialized\n')

  // Test image description
  console.log('Describing image (this may take 20-30 seconds on first request)...')
  const startTime = Date.now()

  try {
    const predictions = await tagger.describeImage(testImageBuffer, 5)
    const elapsed = Date.now() - startTime

    console.log('\n=== Results ===')
    console.log('Inference time:', elapsed, 'ms')
    console.log('Predictions:', JSON.stringify(predictions, null, 2))

    if (predictions.length === 0) {
      console.log('\nNote: Empty predictions may indicate the model is loading.')
      console.log('Try running the test again in 20-30 seconds.')
    } else {
      console.log('\n=== Success! ===')
      console.log('Tags extracted:', predictions.map(p => p.className).join(', '))
    }

    // Test cleanup
    await tagger.dispose()
    console.log('\nTagger disposed successfully')

  } catch (error) {
    console.error('\n=== Error ===')
    console.error('Failed to describe image:', error.message)
    console.error('Details:', error.response?.data || error)
  }
}

// Run the test
testTagger().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
