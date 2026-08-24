import fs from 'fs'
import os from 'os'
import path from 'path'

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

describe('ModelFileService.fetchModelFileWithAuxiliaries', () => {
  let service
  let staged

  beforeEach(() => {
    service = new ModelFileService()
    staged = []

    // The primary lands on disk through fetchModelFile, which has its own retry
    // and its own tests; here it is a fixture - but a REAL file, because the
    // staging copy is exactly the step being exercised.
    const primary = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'modelibr-primary-')),
      '7_1.obj'
    )
    fs.writeFileSync(primary, 'v 0 0 0\n')
    vi.spyOn(service, 'fetchModelFile').mockResolvedValue({
      filePath: primary,
      fileType: 'obj',
      originalFileName: 'chair.obj',
    })

    // Filesystem effects are recorded rather than performed - the point of these
    // tests is which files the service decides to stage, and what it does when it
    // cannot, not that Node can copy a file.
    vi.spyOn(service, 'writeStreamToFile').mockImplementation(async (_, to) => {
      staged.push(to)
    })
    vi.spyOn(service, 'cleanupFile').mockResolvedValue(undefined)
    vi.spyOn(service, 'cleanupDirectory').mockResolvedValue(undefined)
    // No real sleeping between retries.
    vi.spyOn(service, 'sleep').mockResolvedValue(undefined)
  })

  it('stages every advertised auxiliary next to the primary', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({
        auxiliaries: [
          { fileId: 10, relativePath: 'chair.mtl' },
          { fileId: 11, relativePath: 'textures/wood.png' },
        ],
      }),
      getFile: vi.fn().mockResolvedValue({ data: 'stream' }),
    }

    const result = await service.fetchModelFileWithAuxiliaries(7, 1)

    expect(result.auxiliaryCount).toBe(2)
    // The primary keeps its original name: an .obj references its .mtl BY NAME.
    expect(result.filePath.endsWith('/chair.obj')).toBe(true)
    expect(staged).toHaveLength(2)
    expect(staged[0].endsWith('/chair.mtl')).toBe(true)
    expect(staged[1].endsWith('/textures/wood.png')).toBe(true)
  })

  it('is primary-only when the model legitimately has no auxiliary files', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({ auxiliaries: [] }),
      getFile: vi.fn(),
    }

    const result = await service.fetchModelFileWithAuxiliaries(7, 1)

    expect(result.auxiliaryCount).toBe(0)
    expect(service.jobService.getFile).not.toHaveBeenCalled()
  })

  it('is primary-only when there is no version to ask about', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn(),
      getFile: vi.fn(),
    }

    const result = await service.fetchModelFileWithAuxiliaries(7, null)

    expect(result.auxiliaryCount).toBe(0)
    expect(service.jobService.getVersionAuxiliaryFiles).not.toHaveBeenCalled()
  })

  it('fails when the auxiliary manifest cannot be fetched', async () => {
    // Swallowed, an unreadable manifest is indistinguishable from an empty one -
    // and those two mean opposite things.
    service.jobService = {
      getVersionAuxiliaryFiles: vi
        .fn()
        .mockRejectedValue(new Error('500 Internal Server Error')),
      getFile: vi.fn(),
    }

    await expect(service.fetchModelFileWithAuxiliaries(7, 1)).rejects.toThrow(
      '500 Internal Server Error'
    )
    // Retried first - a transient 500 should not fail an operation on one attempt.
    expect(service.jobService.getVersionAuxiliaryFiles).toHaveBeenCalledTimes(3)
  })

  it('fails when an advertised auxiliary cannot be downloaded', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({
        auxiliaries: [{ fileId: 10, relativePath: 'chair.mtl' }],
      }),
      getFile: vi.fn().mockRejectedValue(new Error('connection reset')),
    }

    await expect(service.fetchModelFileWithAuxiliaries(7, 1)).rejects.toThrow(
      /chair\.mtl/
    )
  })

  it('fails when the API answers an auxiliary download with no body', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({
        auxiliaries: [{ fileId: 10, relativePath: 'chair.mtl' }],
      }),
      getFile: vi.fn().mockResolvedValue({ data: null }),
    }

    await expect(service.fetchModelFileWithAuxiliaries(7, 1)).rejects.toThrow(
      /chair\.mtl/
    )
  })

  it.each([['../escape.mtl'], ['textures/../../escape.png'], ['/etc/passwd']])(
    'refuses an auxiliary whose path escapes the staging directory: %s',
    async relativePath => {
      // Refused, not skipped. A path that tried to escape is not a sibling to
      // quietly do without - it is one somebody built wrong, and the operation
      // would run on a partial model.
      service.jobService = {
        getVersionAuxiliaryFiles: vi
          .fn()
          .mockResolvedValue({ auxiliaries: [{ fileId: 10, relativePath }] }),
        getFile: vi.fn(),
      }

      await expect(service.fetchModelFileWithAuxiliaries(7, 1)).rejects.toThrow(
        /outside the staging directory/
      )
      expect(service.jobService.getFile).not.toHaveBeenCalled()
    }
  )

  it('removes the downloaded primary and the work directory on every failure', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({
        auxiliaries: [{ fileId: 10, relativePath: 'chair.mtl' }],
      }),
      getFile: vi.fn().mockRejectedValue(new Error('connection reset')),
    }

    await expect(service.fetchModelFileWithAuxiliaries(7, 1)).rejects.toThrow()

    // Once per attempt, for both - the caller never saw a staging object and has
    // nothing to clean up with, so this is the only place it can happen.
    expect(service.cleanupFile).toHaveBeenCalledTimes(3)
    expect(service.cleanupDirectory).toHaveBeenCalledTimes(3)
    for (const call of service.cleanupDirectory.mock.calls) {
      expect(call[0]).toMatch(/model-7-/)
    }
  })

  it('cleans up the work directory when the manifest fails before anything is downloaded', async () => {
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockRejectedValue(new Error('nope')),
      getFile: vi.fn(),
    }

    await expect(service.fetchModelFileWithAuxiliaries(7, 1)).rejects.toThrow()

    expect(service.cleanupDirectory).toHaveBeenCalled()
    expect(service.cleanupDirectory.mock.calls[0][0]).toMatch(/model-7-/)
  })

  it('succeeds on a retry after a transient download failure', async () => {
    let attempts = 0
    service.jobService = {
      getVersionAuxiliaryFiles: vi.fn().mockResolvedValue({
        auxiliaries: [{ fileId: 10, relativePath: 'chair.mtl' }],
      }),
      getFile: vi.fn().mockImplementation(async () => {
        attempts++
        if (attempts === 1) throw new Error('connection reset')
        return { data: 'stream' }
      }),
    }

    const result = await service.fetchModelFileWithAuxiliaries(7, 1)

    expect(result.auxiliaryCount).toBe(1)
    expect(attempts).toBe(2)
  })
})
