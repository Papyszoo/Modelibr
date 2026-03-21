#!/usr/bin/env node

/**
 * Generates thumbnail PNG images for demo model assets (.glb, .fbx)
 * and a placeholder for global material thumbnails.
 *
 * Uses a simple color-coded approach per model type since we can't
 * easily run a full 3D render pipeline in a build script.
 * For production-quality thumbnails, run the asset-processor instead.
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
 * This generates a 64x64 uncompressed PNG (IHDR + single IDAT + IEND).
 * Keeps the build dependency-free (no sharp/canvas needed).
 */
function createColorPng(r, g, b, size = 64) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR chunk
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0) // width
  ihdrData.writeUInt32BE(size, 4) // height
  ihdrData.writeUInt8(8, 8) // bit depth
  ihdrData.writeUInt8(2, 9) // color type (RGB)
  ihdrData.writeUInt8(0, 10) // compression
  ihdrData.writeUInt8(0, 11) // filter
  ihdrData.writeUInt8(0, 12) // interlace
  const ihdr = createChunk('IHDR', ihdrData)

  // IDAT — build raw scanlines, then deflate
  // Each row: filter byte (0 = None) + RGB pixels
  const rowSize = 1 + size * 3
  const rawData = Buffer.alloc(rowSize * size)
  for (let y = 0; y < size; y++) {
    const offset = y * rowSize
    rawData[offset] = 0 // filter byte
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3
      rawData[px] = r
      rawData[px + 1] = g
      rawData[px + 2] = b
    }
  }

  const deflated = zlib.deflateSync(rawData)
  const idat = createChunk('IDAT', deflated)

  // IEND
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

// Color palette for each model type
const modelThumbnails = [
  { name: 'test-cube', r: 70, g: 130, b: 180 }, // Steel blue
  { name: 'test-cone', r: 210, g: 105, b: 30 }, // Chocolate
  { name: 'test-cylinder', r: 60, g: 179, b: 113 }, // Medium sea green
  { name: 'test-icosphere', r: 186, g: 85, b: 211 }, // Medium orchid
  { name: 'test-torus', r: 220, g: 20, b: 60 }, // Crimson
]

// Main
ensureDir(THUMBNAILS_DIR)

console.log('Generating demo thumbnails...')

for (const { name, r, g, b } of modelThumbnails) {
  const png = createColorPng(r, g, b, 64)
  const outPath = path.join(THUMBNAILS_DIR, `${name}.png`)
  fs.writeFileSync(outPath, png)
  console.log(`  Generated: thumbnails/${name}.png`)
}

// Global material thumbnail
const globalPng = createColorPng(139, 119, 101, 64) // Earthy brown
fs.writeFileSync(path.join(THUMBNAILS_DIR, 'global-material.png'), globalPng)
console.log('  Generated: thumbnails/global-material.png')

console.log(`\nGenerated ${modelThumbnails.length + 1} thumbnails.`)
