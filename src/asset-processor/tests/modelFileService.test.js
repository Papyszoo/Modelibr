import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'

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

/**
 * Real streams, real files, real directories.
 *
 * The existing staging tests mock `writeStreamToFile` because what they care
 * about is which paths the service decides to stage. These care about the
 * opposite - what is left on disk when the write itself goes wrong - and a
 * mocked helper cannot leave a half-written file behind, which is precisely the
 * thing that was leaking.
 */
describe('ModelFileService partial-write cleanup', () => {
  let service
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelibr-partial-'))
    service = new ModelFileService()
    service.tempDir = tempDir
  })

  /** A readable that emits one chunk and then genuinely fails. */
  function failingStream(chunk, message = 'connection reset') {
    const stream = new Readable({ read() {} })
    process.nextTick(() => {
      stream.push(chunk)
      stream.destroy(new Error(message))
    })
    return stream
  }

  /** A readable that delivers its payload and ends cleanly. */
  function goodStream(chunk) {
    const stream = new Readable({ read() {} })
    process.nextTick(() => {
      stream.push(chunk)
      stream.push(null)
    })
    return stream
  }

  it('removes the partial file when the source stream fails mid-write', async () => {
    const target = path.join(tempDir, 'partial.glb')

    await expect(
      service.writeStreamToFile(failingStream(Buffer.alloc(1024)), target)
    ).rejects.toThrow(/Stream error/)

    // A truncated .glb left here is a plausible-looking model file that nothing
    // will ever come back for.
    expect(fs.existsSync(target)).toBe(false)
  })

  it('removes the partial file when the destination cannot be written', async () => {
    // A path whose parent is a FILE: createWriteStream accepts it and the write
    // stream errors, which is the other half of the same failure.
    const blocker = path.join(tempDir, 'blocker')
    fs.writeFileSync(blocker, 'not a directory')

    await expect(
      service.writeStreamToFile(
        goodStream(Buffer.alloc(16)),
        path.join(blocker, 'x.glb')
      )
    ).rejects.toThrow(/Failed to write file/)

    expect(fs.readFileSync(blocker, 'utf8')).toBe('not a directory')
  })

  it('leaves the file in place when the write succeeds', async () => {
    const target = path.join(tempDir, 'whole.glb')

    await service.writeStreamToFile(goodStream(Buffer.from('glTF')), target)

    expect(fs.readFileSync(target, 'utf8')).toBe('glTF')
  })

  it('removes the downloaded primary when inspecting it afterwards fails', async () => {
    // The post-write step - a stat that throws because the file went away or the
    // directory became unreadable. The caller gets an error, not a path, so this
    // function is the last one that knows where the file is.
    const response = {
      headers: { 'content-disposition': 'filename="chair.obj"' },
      data: null,
    }
    let written = null
    vi.spyOn(service, 'writeStreamToFile').mockImplementation(async (_, to) => {
      written = to
      fs.writeFileSync(to, 'v 0 0 0\n')
    })
    vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    await expect(service.processFileResponse(response, 7, 1)).rejects.toThrow(
      /ENOENT/
    )

    vi.restoreAllMocks()
    expect(written).not.toBeNull()
    expect(fs.existsSync(written)).toBe(false)
  })
})

describe('ModelFileService.cleanupOldFiles', () => {
  let service
  let tempDir

  const HOUR = 60 * 60 * 1000

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelibr-sweep-'))
    service = new ModelFileService()
    service.tempDir = tempDir
  })

  /** Creates an entry and backdates it so the sweep considers it stale. */
  function aged(relativePath, { directory = false, hoursOld = 3 } = {}) {
    const target = path.join(tempDir, relativePath)
    if (directory) {
      fs.mkdirSync(target, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, 'x')
    }

    const when = new Date(Date.now() - hoursOld * HOUR)
    fs.utimesSync(target, when, when)
    return target
  }

  it('removes stale files', async () => {
    const stale = aged('7_1700000000.glb')

    const summary = await service.cleanupOldFiles(HOUR)

    expect(fs.existsSync(stale)).toBe(false)
    expect(summary).toEqual({ cleanedCount: 1, failedCount: 0 })
  })

  it('removes a stale staging DIRECTORY, which unlink never could', async () => {
    // The leak: a crash between mkdtemp and the operation's own cleanup leaves
    // one of these, and unlinkSync on a directory throws.
    const stale = aged('model-7-abc123', { directory: true })
    fs.writeFileSync(path.join(stale, 'chair.obj'), 'v 0 0 0\n')
    // Writing inside it refreshed the directory's own mtime - backdate again.
    const when = new Date(Date.now() - 3 * HOUR)
    fs.utimesSync(stale, when, when)

    const summary = await service.cleanupOldFiles(HOUR)

    expect(fs.existsSync(stale)).toBe(false)
    expect(summary.cleanedCount).toBe(1)
  })

  it('removes a stale staging directory with nested contents', async () => {
    const stale = aged('model-9-def456', { directory: true })
    fs.mkdirSync(path.join(stale, 'textures', 'pbr'), { recursive: true })
    fs.writeFileSync(path.join(stale, 'textures', 'pbr', 'wood.png'), 'png')
    fs.writeFileSync(path.join(stale, 'chair.mtl'), 'newmtl wood\n')
    // Backdate again: writing inside it refreshed the directory's own mtime.
    const when = new Date(Date.now() - 3 * HOUR)
    fs.utimesSync(stale, when, when)

    const summary = await service.cleanupOldFiles(HOUR)

    expect(fs.existsSync(stale)).toBe(false)
    expect(summary.cleanedCount).toBe(1)
  })

  it('leaves fresh entries alone', async () => {
    const fresh = aged('recent.glb', { hoursOld: 0 })
    const freshDir = aged('model-1-fresh', { directory: true, hoursOld: 0 })

    const summary = await service.cleanupOldFiles(HOUR)

    expect(fs.existsSync(fresh)).toBe(true)
    expect(fs.existsSync(freshDir)).toBe(true)
    expect(summary).toEqual({ cleanedCount: 0, failedCount: 0 })
  })

  it('sweeps a mix of stale files and directories in one pass', async () => {
    const staleFile = aged('old.glb')
    const staleDir = aged('model-3-ghi789', { directory: true })
    const freshFile = aged('new.glb', { hoursOld: 0 })

    const summary = await service.cleanupOldFiles(HOUR)

    expect(fs.existsSync(staleFile)).toBe(false)
    expect(fs.existsSync(staleDir)).toBe(false)
    expect(fs.existsSync(freshFile)).toBe(true)
    expect(summary).toEqual({ cleanedCount: 2, failedCount: 0 })
  })

  it('carries on past an entry it cannot remove, and counts it', async () => {
    // The behaviour the old loop did not have: one bad entry took every entry
    // after it down with it, so a single undeletable directory meant nothing was
    // ever cleaned again.
    const first = aged('a-old.glb')
    const stubborn = aged('b-stubborn', { directory: true })
    const last = aged('c-old.glb')

    const realRm = fs.rmSync
    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (target === stubborn) throw new Error('EACCES: permission denied')
      return realRm(target, options)
    })

    const summary = await service.cleanupOldFiles(HOUR)
    vi.restoreAllMocks()

    expect(fs.existsSync(first)).toBe(false)
    // The one that failed is still there, reported rather than hidden...
    expect(fs.existsSync(stubborn)).toBe(true)
    // ...and the entry AFTER it was still swept.
    expect(fs.existsSync(last)).toBe(false)
    expect(summary).toEqual({ cleanedCount: 2, failedCount: 1 })
  })

  it('carries on past an entry it cannot even read', async () => {
    const stale = aged('readable.glb')
    const realLstat = fs.lstatSync
    vi.spyOn(fs, 'lstatSync').mockImplementation((target, options) => {
      if (String(target).endsWith('unreadable')) {
        throw new Error('EACCES: permission denied')
      }
      return realLstat(target, options)
    })
    fs.writeFileSync(path.join(tempDir, 'unreadable'), 'x')

    const summary = await service.cleanupOldFiles(HOUR)
    vi.restoreAllMocks()

    expect(fs.existsSync(stale)).toBe(false)
    expect(summary).toEqual({ cleanedCount: 1, failedCount: 1 })
  })

  it('is a no-op when the temp directory does not exist', async () => {
    service.tempDir = path.join(tempDir, 'gone')

    expect(await service.cleanupOldFiles(HOUR)).toEqual({
      cleanedCount: 0,
      failedCount: 0,
    })
  })
})
