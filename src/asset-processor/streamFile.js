import fs from 'fs'
import { pipeline } from 'stream/promises'

import logger from './logger.js'

/**
 * Writes a readable stream to a file, and leaves nothing behind if it cannot.
 *
 * Four services downloaded files with four hand-rolled copies of this, and every
 * copy had the same shape of bug:
 *
 * - `writeStream.destroy()` followed immediately by `unlinkSync()`. Destroying a
 *   stream is asynchronous - the descriptor is closed on a later tick - so the
 *   unlink raced the close. On Windows that is EBUSY and the partial file stays;
 *   on POSIX it usually works, which is worse, because it means the race only
 *   shows up on somebody else's machine.
 * - Error listeners attached AFTER `stream.pipe(writeStream)`. A source that
 *   fails synchronously on the first read emits before anything is listening,
 *   and an unhandled `error` on a stream takes the process down rather than
 *   rejecting the promise.
 * - The failure that mattered replaced by the failure that happened last. The
 *   caller needs to know the download was reset, not that a cleanup unlink
 *   found no file.
 *
 * `stream/promises.pipeline` fixes the first two by construction: it wires every
 * listener before a byte moves, destroys both ends on any failure, and resolves
 * only once the destination has actually finished. The remaining work is to wait
 * for the file handle to be CLOSED before unlinking, which is what
 * `finished(writeStream)` below does, and to re-raise the original error.
 *
 * @param {import('stream').Readable} stream Source, typically an axios response body.
 * @param {string} filePath Destination path.
 * @param {{ streamErrorPrefix?: string, writeErrorPrefix?: string }} [messages]
 *   How to label a source failure vs a destination failure. Defaults match what
 *   the services threw before this was extracted, because those strings are
 *   asserted on.
 * @returns {Promise<void>}
 */
export async function writeStreamToFile(stream, filePath, messages = {}) {
  const {
    streamErrorPrefix = 'Stream error',
    writeErrorPrefix = 'Failed to write file',
  } = messages

  const writeStream = fs.createWriteStream(filePath)

  // Which end failed decides the message, and pipeline reports the first error
  // from either. Recording the source's own failure as it happens is what keeps
  // "the download was reset" from being reported as "the write failed" - the
  // destination is destroyed as a consequence, so its error arrives too.
  let sourceError = null
  stream.once('error', error => {
    sourceError ??= error
  })

  try {
    await pipeline(stream, writeStream)
  } catch (error) {
    const cause = sourceError ?? error
    const prefix = sourceError ? streamErrorPrefix : writeErrorPrefix

    // Only now, and only after the descriptor is gone. Whatever went wrong, the
    // file this function created is a truncated copy of an asset - and the
    // caller is about to see an error, not a path, so nobody else will ever come
    // back for it. Left behind it is a byte-for-byte plausible model file that a
    // later pass could pick up, and disk that only the periodic sweep reclaims.
    await removeWhenClosed(writeStream, filePath)

    throw new Error(`${prefix}: ${cause.message}`, { cause })
  }
}

/**
 * Waits for a write stream to release its file handle, then removes the file.
 *
 * The wait is the whole point: `destroy()` schedules the close, so unlinking on
 * the next line asks the filesystem to remove a file that is still open. Cleanup
 * failures are logged rather than thrown - the caller is already carrying a real
 * error and must not have it replaced by a housekeeping one.
 *
 * @param {import('fs').WriteStream} writeStream
 * @param {string} filePath
 */
async function removeWhenClosed(writeStream, filePath) {
  try {
    await closed(writeStream)
    await fs.promises.rm(filePath, { force: true })
  } catch (cleanupError) {
    logger.warn('Failed to remove a partially written file', {
      filePath,
      error: cleanupError.message,
    })
  }
}

/**
 * Resolves once a write stream has closed its descriptor, however it got there.
 *
 * `stream.finished()` rejects on the very error that brought us here, and
 * `pipeline` has already destroyed the stream by this point, so the plain
 * `close` event plus the already-closed shortcut is what actually answers the
 * question being asked: is the handle gone yet?
 *
 * @param {import('fs').WriteStream} writeStream
 * @returns {Promise<void>}
 */
function closed(writeStream) {
  if (writeStream.closed) {
    return Promise.resolve()
  }

  return new Promise(resolve => {
    writeStream.once('close', resolve)
    // A destroyed stream that has already emitted 'close' would never resolve
    // above; destroy() on an open one always leads to it.
    writeStream.destroy()
  })
}
