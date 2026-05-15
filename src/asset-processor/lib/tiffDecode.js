/**
 * Shared TIFF → RGBA8 decoder, used by both the frontend (ES module import)
 * and the Puppeteer render-template scene (`<script type="module">`, exposes
 * window.modelibrTiff as a side-effect).
 *
 * Keeping a single source of truth ensures the in-browser viewer and the
 * server-side thumbnail renderer interpret the same TIFF identically.
 */

/**
 * Decode a TIFF buffer to raw RGBA8 pixels via utif2.
 *
 * @param {ArrayBuffer} buffer
 * @param {{ UTIF?: object }} [options] - The utif2 namespace. If omitted,
 *   looks up globalThis.UTIF / self.UTIF (the global set by utif2's UMD
 *   script in the Puppeteer page).
 * @returns {{ width: number, height: number, rgba: Uint8Array }}
 * @throws if UTIF is unavailable or the buffer has no image directories.
 */
export function decodeTiff(buffer, options) {
  const UTIF =
    (options && options.UTIF) ||
    (typeof globalThis !== 'undefined' && globalThis.UTIF)
  if (!UTIF) {
    throw new Error(
      'UTIF (utif2) is not available — pass it via options.UTIF or load utif2 globally'
    )
  }
  const ifds = UTIF.decode(buffer)
  if (!ifds || ifds.length === 0) {
    throw new Error('TIFF contains no image directories')
  }
  const ifd = ifds[0]
  UTIF.decodeImage(buffer, ifd)
  return {
    width: ifd.width,
    height: ifd.height,
    rgba: UTIF.toRGBA8(ifd),
  }
}

// Side-effect: expose on window for the Puppeteer scene (which loads this
// file via `<script type="module">` and references window.modelibrTiff from
// page.evaluate code that runs as a classic script).
if (typeof globalThis !== 'undefined' && typeof window !== 'undefined') {
  window.modelibrTiff = { decodeTiff }
}
