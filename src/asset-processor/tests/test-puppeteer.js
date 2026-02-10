#!/usr/bin/env node
/**
 * Simple test script for PuppeteerRenderer
 * Tests basic initialization and rendering without API dependencies
 */

import { PuppeteerRenderer } from '../puppeteerRenderer.js'
import fs from 'fs'
import path from 'path'

async function testRenderer() {
  let renderer = null

  try {
    console.log('=== Puppeteer Renderer Test ===\n')

    // Test 1: Initialize renderer
    console.log('Test 1: Initializing Puppeteer renderer...')
    console.log('Note: This test requires Chrome/Chromium to be installed.')
    console.log('Set PUPPETEER_EXECUTABLE_PATH env var to specify location.\n')

    renderer = new PuppeteerRenderer()
    await renderer.initialize()
    console.log('✓ Renderer initialized successfully\n')

    // Test 2: Verify render template loaded
    console.log('Test 2: Checking render template...')
    const templatePath = path.join(process.cwd(), 'render-template.html')
    if (!fs.existsSync(templatePath)) {
      throw new Error('Render template not found!')
    }
    console.log('✓ Render template exists\n')

    // Test 3: Test camera distance calculation (without model)
    console.log('Test 3: Testing camera distance calculation...')
    const distance = await renderer.calculateOptimalCameraDistance()
    console.log(`✓ Camera distance calculated: ${distance}\n`)

    // Test 4: Get memory stats for empty frames array
    console.log('Test 4: Testing memory stats...')
    const stats = renderer.getMemoryStats([])
    console.log(`✓ Memory stats: ${JSON.stringify(stats, null, 2)}\n`)

    console.log('=== All tests passed! ===')
    process.exit(0)
  } catch (error) {
    console.error('✗ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    if (renderer) {
      await renderer.dispose()
      console.log('\nRenderer disposed')
    }
  }
}

// Run tests
testRenderer()
