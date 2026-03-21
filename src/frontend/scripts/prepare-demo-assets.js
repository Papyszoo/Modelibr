#!/usr/bin/env node

/**
 * Prepares demo assets by copying E2E test assets into the frontend's
 * public/demo-assets directory and generating model thumbnails.
 *
 * Usage: node scripts/prepare-demo-assets.js
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = path.resolve(__dirname, '..')
const E2E_ASSETS = path.resolve(FRONTEND_ROOT, '../../tests/e2e/assets')
const DEMO_ASSETS = path.resolve(FRONTEND_ROOT, 'public/demo-assets')

// Asset files we want in the demo (skip .blend files — not renderable in browser)
const ALLOWED_EXTENSIONS = new Set([
  '.glb',
  '.fbx',
  '.png',
  '.jpg',
  '.jpeg',
  '.exr',
  '.wav',
  '.mp3',
  '.mtl',
  '.obj',
])

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function copyAssets(srcDir, destDir, relativePath = '') {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  let copied = 0

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)

    if (entry.isDirectory()) {
      ensureDir(destPath)
      copied += copyAssets(
        srcPath,
        destPath,
        path.join(relativePath, entry.name)
      )
    } else {
      const ext = path.extname(entry.name).toLowerCase()
      if (ALLOWED_EXTENSIONS.has(ext)) {
        fs.copyFileSync(srcPath, destPath)
        console.log(`  Copied: ${path.join(relativePath, entry.name)}`)
        copied++
      }
    }
  }

  return copied
}

// Main
console.log('Preparing demo assets...')
console.log(`  Source: ${E2E_ASSETS}`)
console.log(`  Destination: ${DEMO_ASSETS}`)

// Clean and recreate
if (fs.existsSync(DEMO_ASSETS)) {
  fs.rmSync(DEMO_ASSETS, { recursive: true })
}
ensureDir(DEMO_ASSETS)
ensureDir(path.join(DEMO_ASSETS, 'thumbnails'))

const count = copyAssets(E2E_ASSETS, DEMO_ASSETS)
console.log(`\nCopied ${count} asset files.`)
console.log('Demo assets prepared successfully!')
