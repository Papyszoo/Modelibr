#!/usr/bin/env node

import { FrameEncoderService } from './frameEncoderService.js';
import { config } from './config.js';
import logger, { withJobContext } from './logger.js';

/**
 * Simple test for frame encoder service
 */
async function testFrameEncoder() {
  const jobLogger = withJobContext('test-job', 'test-model');
  const frameEncoder = new FrameEncoderService();
  
  console.log('Testing Frame Encoder Service...');
  
  try {
    // Create simulated frames for testing
    const frames = [];
    for (let i = 0; i < 8; i++) {
      const angle = i * 45; // 8 frames, 45 degrees apart
      frames.push({
        index: i,
        angle: angle,
        width: config.rendering.outputWidth,
        height: config.rendering.outputHeight,
        pixels: null, // simulated
        size: config.rendering.outputWidth * config.rendering.outputHeight * 4,
        timestamp: Date.now(),
        cameraPosition: {
          x: Math.cos((angle * Math.PI) / 180) * 5,
          y: 0,
          z: Math.sin((angle * Math.PI) / 180) * 5
        },
        simulated: true,
        renderSettings: {
          backgroundColor: config.rendering.backgroundColor,
          antialiasing: config.rendering.enableAntialiasing
        }
      });
    }
    
    console.log(`Created ${frames.length} test frames`);
    
    // Test frame encoding
    const startTime = Date.now();
    const result = await frameEncoder.encodeFrames(frames, jobLogger);
    const duration = Date.now() - startTime;
    
    console.log('Encoding completed successfully!');
    console.log(`Duration: ${duration}ms`);
    console.log(`WebP file: ${result.webpPath}`);
    console.log(`Poster file: ${result.posterPath}`);
    console.log(`Working directory: ${result.workingDir}`);
    
    // Verify files exist
    const fs = await import('fs');
    const webpExists = fs.existsSync(result.webpPath);
    const posterExists = fs.existsSync(result.posterPath);
    
    console.log(`WebP exists: ${webpExists}`);
    console.log(`Poster exists: ${posterExists}`);
    
    if (webpExists) {
      const webpSize = fs.statSync(result.webpPath).size;
      console.log(`WebP size: ${Math.round(webpSize / 1024)}KB`);
    }
    
    if (posterExists) {
      const posterSize = fs.statSync(result.posterPath).size;
      console.log(`Poster size: ${Math.round(posterSize / 1024)}KB`);
    }
    
    // Clean up after test
    await frameEncoder.cleanupEncodingResult(result);
    console.log('Test completed and cleaned up successfully!');
    
    return true;
    
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testFrameEncoder()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Unexpected error:', error);
      process.exit(1);
    });
}

export { testFrameEncoder };