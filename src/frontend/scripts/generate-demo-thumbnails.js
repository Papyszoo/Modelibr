#!/usr/bin/env node

/**
 * Generates static placeholder thumbnail assets for the demo.
 *
 * Model thumbnails are now generated at runtime in the browser via
 * Three.js (GLTFLoader / FBXLoader) and cached in IndexedDB, so we no
 * longer pre-generate solid-color squares for individual models here.
 *
 * Only the texture-set global-material placeholder is generated here
 * because that is still served as a static asset fallback.
 *
 * Usage: node scripts/generate-demo-thumbnails.js
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEMO_ASSETS = path.resolve(__dirname, '..', 'public/demo-assets')
const THUMBNAILS_DIR = path.resolve(DEMO_ASSETS, 'thumbnails')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Creates a minimal valid PNG file with a solid color.
 */
function createColorPng(r, g, b, size = 64) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData.writeUInt8(8, 8)
  ihdrData.writeUInt8(2, 9) // RGB
  ihdrData.writeUInt8(0, 10)
  ihdrData.writeUInt8(0, 11)
  ihdrData.writeUInt8(0, 12)
  const ihdr = createChunk('IHDR', ihdrData)

  const rowSize = 1 + size * 3
  const rawData = Buffer.alloc(rowSize * size)
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize
    rawData[offset] = 0
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3
      rawData[px] = r
      rawData[px + 1] = g
      rawData[px + 2] = b
    }
  }

  const deflated = zlib.deflateSync(rawData)
  const idat = createChunk('IDAT', deflated)
  const iend = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdr, idat, iend])
}

function createChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBuffer, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Main
ensureDir(THUMBNAILS_DIR)

console.log('Generating demo thumbnails...')

// Global material texture-set placeholder (still used as a static fallback
// while the user hasn't uploaded an albedo texture for a new texture set)
const globalPng = createColorPng(139, 119, 101, 64) // Earthy brown
fs.writeFileSync(path.join(THUMBNAILS_DIR, 'global-material.png'), globalPng)
console.log('  Generated: thumbnails/global-material.png')

console.log('\nDone. Model thumbnails are generated at runtime via Three.js.')
