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
const COMMITTED_DEMO_ASSETS = path.resolve(FRONTEND_ROOT, 'public/demo-assets')

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

function getAssetSourceDir() {
  if (fs.existsSync(E2E_ASSETS)) {
    return E2E_ASSETS
  }

  if (fs.existsSync(COMMITTED_DEMO_ASSETS)) {
    return COMMITTED_DEMO_ASSETS
  }

  throw new Error(
    `No demo asset source found. Looked for ${E2E_ASSETS} and ${COMMITTED_DEMO_ASSETS}.`
  )
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
const sourceDir = getAssetSourceDir()

console.log('Preparing demo assets...')
console.log(`  Source: ${sourceDir}`)
console.log(`  Destination: ${DEMO_ASSETS}`)

if (sourceDir === DEMO_ASSETS) {
  console.log(
    '  Using committed demo assets already present in public/demo-assets'
  )
  ensureDir(path.join(DEMO_ASSETS, 'thumbnails'))
  console.log('Demo assets prepared successfully!')
  process.exit(0)
}

// Clean and recreate
if (fs.existsSync(DEMO_ASSETS)) {
  fs.rmSync(DEMO_ASSETS, { recursive: true })
}
ensureDir(DEMO_ASSETS)
ensureDir(path.join(DEMO_ASSETS, 'thumbnails'))

const count = copyAssets(sourceDir, DEMO_ASSETS)
console.log(`\nCopied ${count} asset files.`)
console.log('Demo assets prepared successfully!')
