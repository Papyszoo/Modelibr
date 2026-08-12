import { describe, it, expect, beforeEach, vi } from 'vitest'

import { ModelFileService } from '../modelFileService.js'

// Silence the service's logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}))

// A minimal async-iterable stream of one buffer, matching how axios stream
// responses are consumed by streamToBuffer.
function bufferStream(buffer) {
  return (async function* () {
    yield buffer
  })()
}

function dataUrl(mime, text) {
  return `data:${mime};base64,${Buffer.from(text).toString('base64')}`
}

describe('ModelFileService.fetchAuxiliaryResourceMap', () => {
  let service

  beforeEach(() => {
    service = new ModelFileService()
  })

  it('returns null when the version id is missing', async () => {
    expect(await service.fetchAuxiliaryResourceMap(1, null)).toBeNull()
  })

  it('returns null when the version has no auxiliaries', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({ auxiliaries: [] }),
    }
    expect(await service.fetchAuxiliaryResourceMap(1, 2)).toBeNull()
  })

  it('builds a { relativePath: dataUrl } map with the correct MIME per file', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({
        auxiliaries: [
          {
            fileId: 10,
            relativePath: 'scene.bin',
            originalFileName: 'scene.bin',
          },
          {
            fileId: 11,
            relativePath: 'textures/wood.png',
            originalFileName: 'wood.png',
          },
        ],
      }),
      getFile: vi.fn().mockImplementation(async fileId => ({
        data: bufferStream(Buffer.from(fileId === 10 ? 'BIN' : 'PNG')),
      })),
    }

    const map = await service.fetchAuxiliaryResourceMap(1, 2)

    expect(map['scene.bin']).toBe(dataUrl('application/octet-stream', 'BIN'))
    expect(map['textures/wood.png']).toBe(dataUrl('image/png', 'PNG'))
  })

  it('returns null (never throws) when the auxiliary list fetch fails', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockRejectedValue(new Error('boom')),
    }
    expect(await service.fetchAuxiliaryResourceMap(1, 2)).toBeNull()
  })

  it('skips a failed download but keeps the resolvable references', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({
        auxiliaries: [
          {
            fileId: 10,
            relativePath: 'scene.bin',
            originalFileName: 'scene.bin',
          },
          {
            fileId: 11,
            relativePath: 'textures/wood.png',
            originalFileName: 'wood.png',
          },
        ],
      }),
      getFile: vi.fn().mockImplementation(async fileId => {
        if (fileId === 11) throw new Error('download failed')
        return { data: bufferStream(Buffer.from('BIN')) }
      }),
    }

    const map = await service.fetchAuxiliaryResourceMap(1, 2)

    expect(Object.keys(map)).toEqual(['scene.bin'])
  })
})
