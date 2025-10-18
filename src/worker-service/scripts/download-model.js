#!/usr/bin/env node
/**
 * Pre-download BLIP model for offline use
 * This script runs during npm install to download the model ahead of time
 * Can be skipped in Docker builds by setting SKIP_MODEL_DOWNLOAD=true
 */

import { pipeline, env } from '@xenova/transformers'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Set cache directory to be inside the project
const cacheDir = path.join(__dirname, '..', '.model-cache')
env.cacheDir = cacheDir

// Skip download if SKIP_MODEL_DOWNLOAD is set (e.g., in Docker builds)
if (process.env.SKIP_MODEL_DOWNLOAD === 'true') {
  console.log('⏭️  Skipping model download (SKIP_MODEL_DOWNLOAD=true)')
  console.log(
    '   Run this script manually or let the model download on first use.'
  )
  process.exit(0)
}

console.log('🔧 Pre-downloading BLIP image captioning model...')
console.log(`   Cache directory: ${cacheDir}`)

// Create cache directory if it doesn't exist
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true })
}

async function downloadModel() {
  try {
    console.log('   Starting download (this may take a few minutes)...')

    // Initialize the pipeline - this will download the model
    const captioner = await pipeline(
      'image-to-text',
      'Xenova/vit-gpt2-image-captioning'
    )

    console.log('✅ Model downloaded successfully!')
    console.log('   The application is now ready for offline use.')

    // Dispose of the pipeline
    await captioner.dispose?.()
  } catch (error) {
    console.error('❌ Failed to download model:', error.message)
    console.error('   The model will be downloaded on first use if this fails.')
    // Don't fail the install if model download fails
    process.exit(0)
  }
}

downloadModel()
