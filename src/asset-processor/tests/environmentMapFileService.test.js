import fs from 'fs'
import { Readable } from 'stream'

import { describe, it, expect, vi } from 'vitest'

import { EnvironmentMapFileService } from '../environmentMapFileService.js'

// Silence the service's logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

describe('EnvironmentMapFileService._downloadFile', () => {
  it('recreates the temp directory after the periodic sweep removed it', async () => {
    const service = new EnvironmentMapFileService()
    fs.rmSync(service.tempDir, { recursive: true, force: true })
    expect(fs.existsSync(service.tempDir)).toBe(false)

    service.jobService = {
      getFile: vi.fn().mockResolvedValue({
        data: Readable.from([Buffer.from('hdr-bytes')]),
      }),
    }

    const file = await service._downloadFile(42, 'sky.hdr')

    expect(fs.existsSync(file.filePath)).toBe(true)
  })
})
