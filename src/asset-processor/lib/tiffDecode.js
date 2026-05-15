/**
 * Shared TIFF → RGBA8 decoder, used by both the frontend (ES module import)
 * and the Puppeteer render-template scene (classic <script> tag, exposes
 * window.modelibrTiff).
 *
 * Keeping a single source of truth ensures the in-browser viewer and the
 * server-side thumbnail renderer interpret the same TIFF identically.
 *
 * Why plain JS UMD: the Puppeteer page can't `import` from npm in classic
 * script mode (utif2 ships as CJS+UMD too), and writing this as ESM only
 * would force a second copy. UMD here means: CommonJS export for Node /
 * frontend bundlers, `window.modelibrTiff` for the Puppeteer page.
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.modelibrTiff = factory()
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  /**
   * Decode a TIFF buffer to raw RGBA8 pixels via utif2.
   *
   * @param {ArrayBuffer} buffer
   * @param {object} [options]
   * @param {*} [options.UTIF] - The utif2 namespace. If omitted, looks up
   *   globalThis.UTIF / self.UTIF (the UMD global set by utif2's UTIF.js).
   * @returns {{ width: number, height: number, rgba: Uint8Array }}
   * @throws if UTIF is unavailable or the buffer has no image directories.
   */
  function decodeTiff(buffer, options) {
    var UTIF =
      (options && options.UTIF) ||
      (typeof globalThis !== 'undefined' && globalThis.UTIF) ||
      (typeof self !== 'undefined' && self.UTIF)
    if (!UTIF) {
      throw new Error(
        'UTIF (utif2) is not available — pass it via options.UTIF or load utif2 globally'
      )
    }
    var ifds = UTIF.decode(buffer)
    if (!ifds || ifds.length === 0) {
      throw new Error('TIFF contains no image directories')
    }
    var ifd = ifds[0]
    UTIF.decodeImage(buffer, ifd)
    return {
      width: ifd.width,
      height: ifd.height,
      rgba: UTIF.toRGBA8(ifd),
    }
  }

  return { decodeTiff: decodeTiff }
})
