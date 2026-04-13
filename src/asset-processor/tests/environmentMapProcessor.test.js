import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFinishEnvironmentMapJob = vi.fn()
const mockLogJobStarted = vi.fn()
const mockLogJobCompleted = vi.fn()
const mockLogJobFailed = vi.fn()
const mockLogFrameRenderingStarted = vi.fn()
const mockLogFrameRenderingCompleted = vi.fn()
const mockLogEncodingStarted = vi.fn()
const mockLogEncodingCompleted = vi.fn()
const mockLogThumbnailUploadStarted = vi.fn()
const mockLogThumbnailUploadCompleted = vi.fn()

const mockGetEnvironmentMap = vi.fn()
const mockSelectVariant = vi.fn()
const mockDownloadVariantSource = vi.fn()
const mockCleanupSource = vi.fn()

const mockUploadMultipleThumbnails = vi.fn()

const mockLoadEnvironmentPreview = vi.fn()
const mockCalculateOptimalCameraDistance = vi.fn()
const mockRenderFrame = vi.fn()

const mockRenderer = {
  loadEnvironmentPreview: mockLoadEnvironmentPreview,
  calculateOptimalCameraDistance: mockCalculateOptimalCameraDistance,
  renderFrame: mockRenderFrame,
}

const mockAcquire = vi.fn()
const mockRelease = vi.fn()
const mockPoolInitialize = vi.fn()
const mockPoolDispose = vi.fn()

const mockEncodeFrames = vi.fn()
const mockCleanupOldFiles = vi.fn()

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
  withJobContext: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock('../jobApiClient.js', () => ({
  JobApiClient: vi.fn(function () {
    this.markJobCompleted = vi.fn()
    this.markJobFailed = vi.fn()
    this.finishEnvironmentMapJob = mockFinishEnvironmentMapJob
  }),
}))

vi.mock('../jobEventService.js', () => ({
  JobEventService: vi.fn(function () {
    this.logJobStarted = mockLogJobStarted
    this.logJobCompleted = mockLogJobCompleted
    this.logJobFailed = mockLogJobFailed
    this.logFrameRenderingStarted = mockLogFrameRenderingStarted
    this.logFrameRenderingCompleted = mockLogFrameRenderingCompleted
    this.logEncodingStarted = mockLogEncodingStarted
    this.logEncodingCompleted = mockLogEncodingCompleted
    this.logThumbnailUploadStarted = mockLogThumbnailUploadStarted
    this.logThumbnailUploadCompleted = mockLogThumbnailUploadCompleted
  }),
}))

vi.mock('../environmentMapFileService.js', () => ({
  EnvironmentMapFileService: vi.fn(function () {
    this.getEnvironmentMap = mockGetEnvironmentMap
    this.selectVariant = mockSelectVariant
    this.downloadVariantSource = mockDownloadVariantSource
    this.cleanupSource = mockCleanupSource
  }),
}))

vi.mock('../environmentMapApiService.js', () => ({
  EnvironmentMapApiService: vi.fn(function () {
    this.uploadMultipleThumbnails = mockUploadMultipleThumbnails
  }),
}))

vi.mock('../rendererPool.js', () => ({
  RendererPool: vi.fn(function () {
    this.initialize = mockPoolInitialize
    this.acquire = mockAcquire
    this.release = mockRelease
    this.dispose = mockPoolDispose
  }),
}))

vi.mock('../frameEncoderService.js', () => ({
  FrameEncoderService: vi.fn(function () {
    this.encodeFrames = mockEncodeFrames
    this.cleanupOldFiles = mockCleanupOldFiles
  }),
}))

vi.mock('../config.js', () => ({
  config: {
    rendering: {
      outputWidth: 256,
      outputHeight: 256,
    },
    orbit: {
      enabled: true,
      startAngle: 0,
      endAngle: 360,
      angleStep: 120,
    },
    encoding: {
      enabled: true,
    },
    environmentMaps: {
      cameraDistanceMultiplier: 0.8,
      cameraHeight: 12,
    },
  },
}))

const { EnvironmentMapProcessor } = await import(
  '../processors/environmentMapProcessor.js'
)

describe('EnvironmentMapProcessor', () => {
  const environmentMap = {
    id: 77,
    previewVariantId: 501,
    variants: [{ id: 501 }],
  }
  const selectedVariant = {
    id: 501,
    projectionType: 'equirectangular',
    panoramicFile: { fileId: 901, fileName: 'studio.hdr' },
  }
  const source = {
    projectionType: 'equirectangular',
    panoramic: {
      fileId: 901,
      fileName: 'studio.hdr',
      filePath: '/mock/studio.hdr',
    },
  }
  const job = {
    id: 123,
    environmentMapId: 77,
    assetType: 'EnvironmentMap',
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockAcquire.mockResolvedValue(mockRenderer)
    mockLoadEnvironmentPreview.mockResolvedValue(16384)
    mockCalculateOptimalCameraDistance.mockResolvedValue(5)
    mockRenderFrame
      .mockResolvedValueOnce({ pixels: Buffer.from('a'), size: 1 })
      .mockResolvedValueOnce({ pixels: Buffer.from('b'), size: 1 })
      .mockResolvedValueOnce({ pixels: Buffer.from('c'), size: 1 })
    mockGetEnvironmentMap.mockResolvedValue(environmentMap)
    mockSelectVariant.mockReturnValue(selectedVariant)
    mockDownloadVariantSource.mockResolvedValue(source)
    mockEncodeFrames.mockResolvedValue({
      webpPath: '/mock/thumb.webp',
      pngPath: '/mock/thumb.png',
      posterPath: '/mock/poster.jpg',
    })
    mockUploadMultipleThumbnails.mockResolvedValue({
      allSuccessful: true,
      uploads: [
        {
          type: 'webp',
          success: true,
          data: {
            thumbnailPath:
              '/var/lib/modelibr/uploads/previews/environment-maps/77/501.webp',
            sizeBytes: 2048,
          },
        },
      ],
    })
  })

  it('renders, uploads, and finishes an environment map job', async () => {
    const processor = new EnvironmentMapProcessor()

    const result = await processor.process(job, {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })

    expect(mockGetEnvironmentMap).toHaveBeenCalledWith(77)
    expect(mockSelectVariant).toHaveBeenCalledWith(environmentMap, undefined)
    expect(mockDownloadVariantSource).toHaveBeenCalledWith(selectedVariant)
    expect(mockLoadEnvironmentPreview).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        cameraDistanceMultiplier: 0.8,
      })
    )
    expect(mockRenderFrame).toHaveBeenCalledTimes(3)
    expect(mockUploadMultipleThumbnails).toHaveBeenCalledWith(77, 501, {
      webpPath: '/mock/thumb.webp',
      pngPath: '/mock/poster.jpg',
    })
    expect(result).toEqual({
      thumbnailPath:
        '/var/lib/modelibr/uploads/previews/environment-maps/77/501.webp',
      sizeBytes: 2048,
      width: 256,
      height: 256,
    })
    expect(mockRelease).toHaveBeenCalledWith(mockRenderer)
    expect(mockCleanupSource).toHaveBeenCalledWith(source)
  })

  it('uses environment-map-specific finish endpoint', async () => {
    const processor = new EnvironmentMapProcessor()

    await processor.markCompleted(job, {
      thumbnailPath:
        '/var/lib/modelibr/uploads/previews/environment-maps/77/501.webp',
      sizeBytes: 2048,
      width: 256,
      height: 256,
    })

    expect(mockFinishEnvironmentMapJob).toHaveBeenCalledWith(123, true, {
      thumbnailPath:
        '/var/lib/modelibr/uploads/previews/environment-maps/77/501.webp',
      sizeBytes: 2048,
      width: 256,
      height: 256,
    })
  })

  it('prefers a variant id from the job when provided', async () => {
    const processor = new EnvironmentMapProcessor()

    await processor.process(
      { ...job, environmentMapVariantId: 999 },
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    )

    expect(mockSelectVariant).toHaveBeenCalledWith(environmentMap, 999)
  })
})
