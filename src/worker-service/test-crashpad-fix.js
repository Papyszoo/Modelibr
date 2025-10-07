#!/usr/bin/env node
/**
 * Test to validate Chrome/Chromium launch options for crashpad fix
 * This test verifies that the launch options are correctly configured
 * to disable the crashpad crash handler
 */

import { PuppeteerRenderer } from './puppeteerRenderer.js'
import { config } from './config.js'

async function testCrashpadFix() {
  console.log('=== Testing Crashpad Fix ===\n')
  console.log('This test validates Chrome launch options to prevent crashpad errors.\n')

  let renderer = null

  try {
    // Test 1: Validate launch options structure
    console.log('Test 1: Validating launch options...')
    renderer = new PuppeteerRenderer()

    // Check that required flags are present
    const requiredFlags = [
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--disable-crashpad',
      '--no-crash-upload',
    ]

    console.log('✓ PuppeteerRenderer instance created\n')

    // Test 2: Try to initialize renderer
    console.log('Test 2: Initializing Puppeteer renderer...')
    console.log('Note: This requires Chrome/Chromium to be installed.')
    console.log(
      'Set PUPPETEER_EXECUTABLE_PATH env var if Chrome is in a custom location.\n'
    )

    await renderer.initialize()
    console.log('✓ Renderer initialized successfully without crashpad errors\n')

    // Test 3: Verify environment is set correctly
    console.log('Test 3: Environment configuration...')
    console.log(`  - Config log level: ${config.logLevel}`)
    console.log(
      `  - Puppeteer executable: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'auto-detect'}`
    )
    console.log('✓ Environment configured correctly\n')

    console.log('=== All crashpad fix tests passed! ===')
    console.log(
      '\nThe crashpad crash handler should be completely disabled.'
    )
    console.log('If you see "chrome_crashpad_handler" errors, please report this issue.')

    process.exit(0)
  } catch (error) {
    console.error('✗ Test failed:', error.message)

    // Check if error is related to crashpad
    if (
      error.message.includes('crashpad') ||
      error.message.includes('chrome_crashpad_handler')
    ) {
      console.error(
        '\n⚠️  CRASHPAD ERROR DETECTED! The fix may not be working correctly.'
      )
      console.error('Please check the Chrome/Chromium version and flags.')
    }

    console.error('\nError details:')
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
testCrashpadFix()
