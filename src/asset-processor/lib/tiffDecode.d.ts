/**
 * Type declarations for the shared TIFF decoder. Implementation in
 * `./tiffDecode.js` is plain UMD; this shim lets TS-aware callers (the
 * frontend) import it without `// @ts-expect-error`.
 */

export interface DecodedTiff {
  width: number
  height: number
  rgba: Uint8Array
}

export interface DecodeTiffOptions {
  /**
   * The utif2 namespace. Optional in the browser when window.UTIF is set by
   * the UMD <script>; required when called from a module bundler context.
   */
  UTIF?: unknown
}

export function decodeTiff(
  buffer: ArrayBuffer,
  options?: DecodeTiffOptions
): DecodedTiff
