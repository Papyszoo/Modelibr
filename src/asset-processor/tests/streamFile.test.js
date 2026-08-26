import fs from 'fs'
import os from 'os'
import path from 'path'
import { Readable, Writable } from 'stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeStreamToFile } from '../streamFile.js'

/**
 * Real streams, real files.
 *
 * The four download services each carried their own copy of this, and every copy
 * had the same three defects: `destroy()` immediately followed by `unlinkSync()`
 * (destroying a stream is asynchronous, so the unlink raced the close and failed
 * on any platform that refuses to remove an open file), error listeners attached
 * only after `pipe()` had already started moving bytes, and a cleanup failure
 * that could replace the real error on the way out.
 *
 * What is asserted here is the ordering, not just the outcome: the file handle is
 * closed BEFORE the unlink is attempted, the original failure survives, and
 * nothing reaches the process as an unhandled stream error.
 */
describe('writeStreamToFile', () => {
  let tempDir

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelibr-streamfile-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempDir, { recursive: true, force: true })
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

  /** A readable that fails on the very first read, before any data moves. */
  function immediatelyFailingStream(message = 'socket hang up') {
    return new Readable({
      read() {
        this.destroy(new Error(message))
      },
    })
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

  it('leaves the file in place when the write succeeds', async () => {
    const target = path.join(tempDir, 'whole.glb')

    await writeStreamToFile(goodStream(Buffer.from('glTF')), target)

    expect(fs.readFileSync(target, 'utf8')).toBe('glTF')
  })

  it('removes the partial file when the source stream fails mid-write', async () => {
    const target = path.join(tempDir, 'partial.glb')

    await expect(
      writeStreamToFile(failingStream(Buffer.alloc(1024)), target)
    ).rejects.toThrow(/Stream error: connection reset/)

    // A truncated .glb left here is a plausible-looking model file that nothing
    // will ever come back for.
    expect(fs.existsSync(target)).toBe(false)
  })

  it('reports the source failure rather than the write it knocked over', async () => {
    // Destroying the source destroys the destination too, so both ends produce an
    // error. The caller needs the one that explains what happened.
    const target = path.join(tempDir, 'reset.glb')

    await expect(
      writeStreamToFile(failingStream(Buffer.alloc(64), 'ECONNRESET'), target)
    ).rejects.toThrow(/Stream error: ECONNRESET/)
  })

  it('removes the partial file when the destination cannot be written', async () => {
    // A path whose parent is a FILE: createWriteStream accepts it and the write
    // stream errors, which is the other half of the same failure.
    const blocker = path.join(tempDir, 'blocker')
    fs.writeFileSync(blocker, 'not a directory')

    await expect(
      writeStreamToFile(
        goodStream(Buffer.alloc(16)),
        path.join(blocker, 'x.glb')
      )
    ).rejects.toThrow(/Failed to write file/)

    expect(fs.readFileSync(blocker, 'utf8')).toBe('not a directory')
  })

  it('reports a destination that fails partway through, and keeps nothing', async () => {
    // Disk full is the real version of this: the file opens, takes some bytes,
    // and then refuses. Simulated by making the write stream itself fail.
    const target = path.join(tempDir, 'nospc.glb')
    const failingWritable = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('ENOSPC: no space left on device'))
      },
    })
    vi.spyOn(fs, 'createWriteStream').mockImplementation(() => {
      // The path is still created, so the cleanup has something real to remove -
      // otherwise "the file is gone" would be true for the wrong reason.
      fs.writeFileSync(target, 'half a model')
      return failingWritable
    })

    await expect(
      writeStreamToFile(goodStream(Buffer.alloc(16)), target)
    ).rejects.toThrow(/Failed to write file: ENOSPC/)

    vi.restoreAllMocks()
    expect(fs.existsSync(target)).toBe(false)
  })

  it('does not unlink until the destination handle has closed', async () => {
    // The defect this replaces, stated as an ordering: `destroy()` schedules the
    // close, so unlinking on the next line asks the filesystem to remove a file
    // that is still open. On a platform that refuses that, the partial file
    // survived every cleanup attempt.
    const target = path.join(tempDir, 'ordering.glb')
    const order = []

    const realCreate = fs.createWriteStream.bind(fs)
    vi.spyOn(fs, 'createWriteStream').mockImplementation((...args) => {
      const stream = realCreate(...args)
      stream.once('close', () => order.push('closed'))
      return stream
    })
    // Both removal APIs are watched, so this records the ordering whichever one
    // the implementation reaches for - the old `unlinkSync()` on the line after
    // `destroy()` produced ['unlinked', 'closed'], which is the bug.
    const realRm = fs.promises.rm.bind(fs.promises)
    vi.spyOn(fs.promises, 'rm').mockImplementation((...args) => {
      order.push('unlinked')
      return realRm(...args)
    })
    const realUnlinkSync = fs.unlinkSync.bind(fs)
    vi.spyOn(fs, 'unlinkSync').mockImplementation((...args) => {
      order.push('unlinked')
      return realUnlinkSync(...args)
    })

    await expect(
      writeStreamToFile(failingStream(Buffer.alloc(256)), target)
    ).rejects.toThrow(/Stream error/)

    expect(order).toEqual(['closed', 'unlinked'])
  })

  it('rejects rather than throwing an unhandled error at the process', async () => {
    // A source that fails on its FIRST read emits before anything hand-rolled had
    // finished wiring listeners, and an unhandled 'error' on a stream takes the
    // process down instead of rejecting the promise. Any listener registered here
    // that fires is that bug.
    const target = path.join(tempDir, 'immediate.glb')
    const unhandled = []
    const onUnhandled = reason => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    process.on('uncaughtException', onUnhandled)

    try {
      await expect(
        writeStreamToFile(immediatelyFailingStream(), target)
      ).rejects.toThrow(/Stream error: socket hang up/)

      // Give any stray listener a turn to fire before declaring it clean.
      await new Promise(resolve => setImmediate(resolve))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
      process.off('uncaughtException', onUnhandled)
    }

    expect(fs.existsSync(target)).toBe(false)
  })

  it('keeps the original failure when the cleanup itself cannot run', async () => {
    // Housekeeping must never replace the error the caller has to act on.
    const target = path.join(tempDir, 'stuck.glb')
    vi.spyOn(fs.promises, 'rm').mockRejectedValue(
      new Error('EPERM: operation not permitted')
    )

    await expect(
      writeStreamToFile(
        failingStream(Buffer.alloc(32), 'connection reset'),
        target
      )
    ).rejects.toThrow(/Stream error: connection reset/)
  })

  it('carries the underlying error as its cause', async () => {
    // The message is prefixed for the log; the original is kept for anything that
    // wants to look at the code rather than the sentence.
    const target = path.join(tempDir, 'cause.glb')

    const failure = await writeStreamToFile(
      failingStream(Buffer.alloc(8), 'ECONNRESET'),
      target
    ).catch(error => error)

    expect(failure.cause).toBeInstanceOf(Error)
    expect(failure.cause.message).toBe('ECONNRESET')
  })
})
