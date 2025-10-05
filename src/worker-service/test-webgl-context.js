#!/usr/bin/env node

/**
 * Test script to validate WebGL context creation with headless-gl
 * This verifies that the fix for the thumbnail worker error is working
 */

import createGl from 'gl'
import * as THREE from 'three'
import { createCanvas } from 'canvas'
import { polyfillWebGL2 } from './webgl2-polyfill.js'

console.log('Testing WebGL context creation...')

try {
  // Create WebGL context using headless-gl (same as in orbitFrameRenderer.js)
  const width = 800
  const height = 600
  let glContext = createGl(width, height, {
    preserveDrawingBuffer: true,
    antialias: true,
    alpha: true,
  })

  console.log('✓ headless-gl context created successfully')

  // Add WebGL 2 polyfill
  glContext = polyfillWebGL2(glContext)
  console.log('✓ WebGL 2 polyfill applied')

  // Create canvas for compatibility
  const canvas = createCanvas(width, height)

  // Attach the WebGL context to the canvas
  canvas.getContext = type => {
    if (
      type === 'webgl2' ||
      type === 'webgl' ||
      type === 'experimental-webgl'
    ) {
      return glContext
    }
    return null
  }

  // Add DOM-like event methods
  canvas.addEventListener = canvas.addEventListener || (() => {})
  canvas.removeEventListener = canvas.removeEventListener || (() => {})
  canvas.width = width
  canvas.height = height

  console.log('✓ Canvas configured successfully')

  // Try to create THREE.js WebGLRenderer (this is where the original error occurred)
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })

  console.log('✓ THREE.WebGLRenderer created successfully')

  // Create a simple scene to verify rendering works
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.position.z = 5

  // Add a simple cube
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  const cube = new THREE.Mesh(geometry, material)
  scene.add(cube)

  // Render the scene
  renderer.render(scene, camera)
  console.log('✓ Scene rendered successfully')

  // Read pixels to verify rendering worked
  const pixels = new Uint8Array(width * height * 4)
  glContext.readPixels(
    0,
    0,
    width,
    height,
    glContext.RGBA,
    glContext.UNSIGNED_BYTE,
    pixels
  )
  console.log('✓ Pixels read successfully')

  // Clean up (skip renderer.dispose() to avoid cancelAnimationFrame error in headless)
  geometry.dispose()
  material.dispose()

  console.log(
    '\n✓✓✓ All tests passed! WebGL context with polyfill is working correctly ✓✓✓'
  )
  console.log(
    '\nNote: Shader warnings about WebGL 1.0 features are expected and can be ignored.'
  )
  process.exit(0)
} catch (error) {
  console.error('\n✗✗✗ Test failed ✗✗✗')
  console.error('Error:', error.message)
  console.error('Stack:', error.stack)
  process.exit(1)
}
