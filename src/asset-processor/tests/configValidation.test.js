import { describe, it, expect, beforeEach } from 'vitest'
import { config, validateConfig, getBlenderPath } from '../config.js'

// Save original values to restore between tests
const originalRendering = { ...config.rendering }
const originalOrbit = { ...config.orbit }
const originalEnvironmentMaps = { ...config.environmentMaps }
const originalModelProcessing = { ...config.modelProcessing }
const originalEncoding = { ...config.encoding }
const originalThumbnailStorage = { ...config.thumbnailStorage }
const originalBlender = { ...config.blender }

beforeEach(() => {
  Object.assign(config.rendering, originalRendering)
  Object.assign(config.orbit, originalOrbit)
  Object.assign(config.environmentMaps, originalEnvironmentMaps)
  Object.assign(config.modelProcessing, originalModelProcessing)
  Object.assign(config.encoding, originalEncoding)
  Object.assign(config.thumbnailStorage, originalThumbnailStorage)
  Object.assign(config.blender, originalBlender)
})

describe('validateConfig', () => {
  it('passes with default config values', () => {
    expect(validateConfig()).toBe(true)
  })

  // --- Rendering rules ---

  it('rejects RENDER_WIDTH below 64', () => {
    config.rendering.outputWidth = 32
    expect(() => validateConfig()).toThrow(
      'RENDER_WIDTH must be between 64 and 2048'
    )
  })

  it('rejects RENDER_WIDTH above 2048', () => {
    config.rendering.outputWidth = 4096
    expect(() => validateConfig()).toThrow(
      'RENDER_WIDTH must be between 64 and 2048'
    )
  })

  it('rejects RENDER_HEIGHT below 64', () => {
    config.rendering.outputHeight = 10
    expect(() => validateConfig()).toThrow(
      'RENDER_HEIGHT must be between 64 and 2048'
    )
  })

  it('rejects RENDER_HEIGHT above 2048', () => {
    config.rendering.outputHeight = 3000
    expect(() => validateConfig()).toThrow(
      'RENDER_HEIGHT must be between 64 and 2048'
    )
  })

  it('rejects invalid RENDER_FORMAT', () => {
    config.rendering.outputFormat = 'bmp'
    expect(() => validateConfig()).toThrow(
      'RENDER_FORMAT must be one of: png, jpg, jpeg, webp'
    )
  })

  it('accepts all valid RENDER_FORMAT values', () => {
    for (const fmt of ['png', 'jpg', 'jpeg', 'webp']) {
      config.rendering.outputFormat = fmt
      expect(validateConfig()).toBe(true)
    }
  })

  it('rejects CAMERA_DISTANCE of 0', () => {
    config.rendering.cameraDistance = 0
    expect(() => validateConfig()).toThrow(
      'CAMERA_DISTANCE must be greater than 0'
    )
  })

  it('rejects negative CAMERA_DISTANCE', () => {
    config.rendering.cameraDistance = -1
    expect(() => validateConfig()).toThrow(
      'CAMERA_DISTANCE must be greater than 0'
    )
  })

  // --- Orbit rules ---

  it('rejects ORBIT_ANGLE_STEP of 0', () => {
    config.orbit.angleStep = 0
    expect(() => validateConfig()).toThrow(
      'ORBIT_ANGLE_STEP must be between 0 and 90'
    )
  })

  it('rejects ORBIT_ANGLE_STEP above 90', () => {
    config.orbit.angleStep = 91
    expect(() => validateConfig()).toThrow(
      'ORBIT_ANGLE_STEP must be between 0 and 90'
    )
  })

  it('rejects negative ORBIT_START_ANGLE', () => {
    config.orbit.startAngle = -1
    expect(() => validateConfig()).toThrow(
      'ORBIT_START_ANGLE must be between 0 and 359'
    )
  })

  it('rejects ORBIT_START_ANGLE of 360', () => {
    config.orbit.startAngle = 360
    expect(() => validateConfig()).toThrow(
      'ORBIT_START_ANGLE must be between 0 and 359'
    )
  })

  it('rejects ORBIT_END_ANGLE equal to start angle', () => {
    config.orbit.startAngle = 90
    config.orbit.endAngle = 90
    expect(() => validateConfig()).toThrow(
      'ORBIT_END_ANGLE must be greater than start angle'
    )
  })

  it('rejects ORBIT_END_ANGLE less than start angle', () => {
    config.orbit.startAngle = 180
    config.orbit.endAngle = 90
    expect(() => validateConfig()).toThrow(
      'ORBIT_END_ANGLE must be greater than start angle'
    )
  })

  it('rejects ORBIT_END_ANGLE above 360', () => {
    config.orbit.startAngle = 0
    config.orbit.endAngle = 361
    expect(() => validateConfig()).toThrow(
      'ORBIT_END_ANGLE must be greater than start angle'
    )
  })

  // --- Model processing rules ---

  it('rejects MAX_POLYGON_COUNT below 1000', () => {
    config.modelProcessing.maxPolygonCount = 999
    expect(() => validateConfig()).toThrow(
      'MAX_POLYGON_COUNT must be at least 1000'
    )
  })

  it('accepts MAX_POLYGON_COUNT of exactly 1000', () => {
    config.modelProcessing.maxPolygonCount = 1000
    expect(validateConfig()).toBe(true)
  })

  it('rejects NORMALIZED_SCALE of 0', () => {
    config.modelProcessing.normalizedScale = 0
    expect(() => validateConfig()).toThrow(
      'NORMALIZED_SCALE must be greater than 0'
    )
  })

  it('rejects negative NORMALIZED_SCALE', () => {
    config.modelProcessing.normalizedScale = -0.5
    expect(() => validateConfig()).toThrow(
      'NORMALIZED_SCALE must be greater than 0'
    )
  })

  // --- Encoding rules ---

  it('rejects ENCODING_FRAMERATE of 0', () => {
    config.encoding.framerate = 0
    expect(() => validateConfig()).toThrow(
      'ENCODING_FRAMERATE must be between 0 and 60'
    )
  })

  it('rejects ENCODING_FRAMERATE above 60', () => {
    config.encoding.framerate = 61
    expect(() => validateConfig()).toThrow(
      'ENCODING_FRAMERATE must be between 0 and 60'
    )
  })

  it('rejects WEBP_QUALITY below 0', () => {
    config.encoding.webpQuality = -1
    expect(() => validateConfig()).toThrow(
      'WEBP_QUALITY must be between 0 and 100'
    )
  })

  it('rejects WEBP_QUALITY above 100', () => {
    config.encoding.webpQuality = 101
    expect(() => validateConfig()).toThrow(
      'WEBP_QUALITY must be between 0 and 100'
    )
  })

  it('rejects JPEG_QUALITY below 0', () => {
    config.encoding.jpegQuality = -1
    expect(() => validateConfig()).toThrow(
      'JPEG_QUALITY must be between 0 and 100'
    )
  })

  it('rejects JPEG_QUALITY above 100', () => {
    config.encoding.jpegQuality = 101
    expect(() => validateConfig()).toThrow(
      'JPEG_QUALITY must be between 0 and 100'
    )
  })

  // --- Thumbnail storage rules ---

  it('rejects empty THUMBNAIL_STORAGE_PATH when storage is enabled', () => {
    config.thumbnailStorage.enabled = true
    config.thumbnailStorage.basePath = ''
    expect(() => validateConfig()).toThrow(
      'THUMBNAIL_STORAGE_PATH must be specified'
    )
  })

  it('allows empty THUMBNAIL_STORAGE_PATH when storage is disabled', () => {
    config.thumbnailStorage.enabled = false
    config.thumbnailStorage.basePath = ''
    expect(validateConfig()).toBe(true)
  })

  // --- Multiple errors ---

  it('collects all errors into a single throw', () => {
    config.rendering.outputWidth = 1
    config.rendering.outputHeight = 1
    config.rendering.cameraDistance = 0
    expect(() => validateConfig()).toThrow(
      /RENDER_WIDTH.*\n.*RENDER_HEIGHT.*\n.*CAMERA_DISTANCE/
    )
  })
})

describe('getBlenderPath', () => {
  it('returns "blender" for the default value', () => {
    config.blender.path = 'blender'
    expect(getBlenderPath()).toBe('blender')
  })

  it('resolves a valid absolute path', () => {
    config.blender.path = '/usr/bin/blender'
    expect(getBlenderPath()).toBe('/usr/bin/blender')
  })

  it('rejects paths with shell metacharacters', () => {
    config.blender.path = '/usr/bin/blender; rm -rf /'
    expect(() => getBlenderPath()).toThrow(
      'Invalid Blender path: contains disallowed characters'
    )
  })

  it('rejects paths with backticks', () => {
    config.blender.path = '/usr/bin/`whoami`'
    expect(() => getBlenderPath()).toThrow(
      'Invalid Blender path: contains disallowed characters'
    )
  })

  it('rejects paths with $() substitution', () => {
    config.blender.path = '/usr/bin/$(id)'
    expect(() => getBlenderPath()).toThrow(
      'Invalid Blender path: contains disallowed characters'
    )
  })
})
