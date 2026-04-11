import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import { config } from '../config.js'
import { EnvironmentMapStorageService } from '../environmentMapStorageService.js'

const originalUploadRootPath = config.environmentMaps.uploadRootPath
const tempDirs = []

afterEach(() => {
  config.environmentMaps.uploadRootPath = originalUploadRootPath

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('EnvironmentMapStorageService', () => {
  it('creates the upload root and preview directories before copying files', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'modelibr-envmap-storage-')
    )
    tempDirs.push(tempDir)

    const uploadRootPath = path.join(tempDir, 'uploads-root')
    const encodedDir = path.join(tempDir, 'encoded')
    fs.mkdirSync(encodedDir, { recursive: true })

    const webpPath = path.join(encodedDir, 'thumbnail.webp')
    const pngPath = path.join(encodedDir, 'thumbnail.png')
    fs.writeFileSync(webpPath, 'webp')
    fs.writeFileSync(pngPath, 'png')

    config.environmentMaps.uploadRootPath = uploadRootPath

    const service = new EnvironmentMapStorageService()
    const result = await service.storeThumbnail(1, 2, {
      webpPath,
      pngPath,
    })

    expect(
      fs.existsSync(path.join(uploadRootPath, 'previews', 'environment-maps', '1'))
    ).toBe(true)
    expect(
      fs.readFileSync(
        path.join(uploadRootPath, 'previews', 'environment-maps', '1', '2.webp'),
        'utf8'
      )
    ).toBe('webp')
    expect(
      fs.readFileSync(
        path.join(uploadRootPath, 'previews', 'environment-maps', '1', '2.png'),
        'utf8'
      )
    ).toBe('png')
    expect(result.thumbnailPath).toBe('previews/environment-maps/1/2.webp')
    expect(result.previewPngPath).toBe('previews/environment-maps/1/2.png')
  })
})
