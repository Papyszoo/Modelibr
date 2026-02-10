#!/usr/bin/env node
/**
 * Test script to verify scene cleanup between model loads
 * This test ensures that previous models are removed from the scene
 * before loading new models, preventing accumulation across thumbnail jobs.
 */

import { PuppeteerRenderer } from '../puppeteerRenderer.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testSceneCleanup() {
  let renderer = null

  try {
    console.log('=== Scene Cleanup Test ===\n')

    // Initialize renderer
    console.log('Step 1: Initializing Puppeteer renderer...')
    renderer = new PuppeteerRenderer()
    await renderer.initialize()
    console.log('✓ Renderer initialized successfully\n')

    // Test model path (using the sample cube from docs)
    const modelPath = path.join(__dirname, '../../docs/sample-cube.obj')
    console.log(`Using test model: ${modelPath}\n`)

    // Test 1: Load first model and verify scene state
    console.log('Test 1: Loading first model...')
    await renderer.loadModel(modelPath, 'obj')

    const sceneState1 = await renderer.page.evaluate(() => {
      return {
        hasModel: window.modelRenderer.model !== null,
        isReady: window.modelRenderer.isReady,
        sceneChildrenCount: window.modelRenderer.scene.children.length,
      }
    })

    console.log('Scene state after first load:', sceneState1)

    if (!sceneState1.hasModel || !sceneState1.isReady) {
      throw new Error('First model failed to load properly')
    }
    console.log('✓ First model loaded successfully\n')

    // Test 2: Load second model (should trigger scene cleanup)
    console.log('Test 2: Loading second model (should auto-clear first)...')
    await renderer.loadModel(modelPath, 'obj')

    const sceneState2 = await renderer.page.evaluate(() => {
      return {
        hasModel: window.modelRenderer.model !== null,
        isReady: window.modelRenderer.isReady,
        sceneChildrenCount: window.modelRenderer.scene.children.length,
      }
    })

    console.log('Scene state after second load:', sceneState2)

    if (!sceneState2.hasModel || !sceneState2.isReady) {
      throw new Error('Second model failed to load properly')
    }

    // Verify scene children count is the same (model was replaced, not accumulated)
    if (sceneState2.sceneChildrenCount > sceneState1.sceneChildrenCount) {
      throw new Error(
        `Scene accumulation detected! First load: ${sceneState1.sceneChildrenCount} children, ` +
          `Second load: ${sceneState2.sceneChildrenCount} children`
      )
    }
    console.log('✓ Second model loaded successfully without accumulation\n')

    // Test 3: Verify clearScene function works directly
    console.log('Test 3: Testing direct clearScene call...')
    const cleared = await renderer.page.evaluate(() => {
      return window.clearScene()
    })

    if (!cleared) {
      throw new Error('clearScene() returned false')
    }

    const sceneState3 = await renderer.page.evaluate(() => {
      return {
        hasModel: window.modelRenderer.model !== null,
        isReady: window.modelRenderer.isReady,
      }
    })

    console.log('Scene state after direct clear:', sceneState3)

    if (sceneState3.hasModel || sceneState3.isReady) {
      throw new Error('Scene was not properly cleared')
    }
    console.log('✓ Scene cleared successfully\n')

    // Test 4: Load third model to ensure scene can be reused
    console.log('Test 4: Loading third model after manual clear...')
    await renderer.loadModel(modelPath, 'obj')

    const sceneState4 = await renderer.page.evaluate(() => {
      return {
        hasModel: window.modelRenderer.model !== null,
        isReady: window.modelRenderer.isReady,
        sceneChildrenCount: window.modelRenderer.scene.children.length,
      }
    })

    console.log('Scene state after third load:', sceneState4)

    if (!sceneState4.hasModel || !sceneState4.isReady) {
      throw new Error('Third model failed to load properly')
    }
    console.log('✓ Third model loaded successfully\n')

    console.log('=== All scene cleanup tests passed! ===')
    console.log('\nSummary:')
    console.log(
      '- Models are properly removed from scene before loading new ones'
    )
    console.log('- Scene can be manually cleared with clearScene()')
    console.log('- Scene can be reused after clearing')
    console.log('- No model accumulation detected across multiple loads')

    process.exit(0)
  } catch (error) {
    console.error('\n✗ Test failed:', error.message)
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
testSceneCleanup()
