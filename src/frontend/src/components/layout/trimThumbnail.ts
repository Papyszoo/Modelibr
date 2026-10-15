/** Output edge in px: a 2x render of the 32px tile thumbnail. */
const TRIM_SIZE = 64

/**
 * Bounding box of the visible (non-transparent) pixels of an RGBA buffer, or
 * null when nothing is visible.
 */
export function visibleBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { left: number; top: number; right: number; bottom: number } | null {
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 }
}

/**
 * The model's own pixels, centred in a square: a render frames the model with
 * wide transparent padding (and an odd model off-centre), which at tab size
 * left a small, shifted speck. Null when the pixels cannot be read (a
 * cross-origin image, or no canvas), and the caller shows the image as is.
 */
export function trimToModel(img: HTMLImageElement): string | null {
  try {
    const { naturalWidth: w, naturalHeight: h } = img
    const source = document.createElement('canvas')
    source.width = w
    source.height = h
    const sourceCtx = source.getContext('2d')
    if (!sourceCtx || !w || !h) return null
    sourceCtx.drawImage(img, 0, 0)
    const box = visibleBounds(sourceCtx.getImageData(0, 0, w, h).data, w, h)
    if (!box) return null

    // No margin: the model reaches the frame, so the tile's rounded clip shapes
    // its corners instead of a transparent border.
    const side = Math.max(box.right - box.left, box.bottom - box.top)
    const cx = (box.left + box.right) / 2
    const cy = (box.top + box.bottom) / 2
    const out = document.createElement('canvas')
    out.width = TRIM_SIZE
    out.height = TRIM_SIZE
    const outCtx = out.getContext('2d')
    if (!outCtx) return null
    outCtx.drawImage(
      img,
      cx - side / 2,
      cy - side / 2,
      side,
      side,
      0,
      0,
      TRIM_SIZE,
      TRIM_SIZE
    )
    return out.toDataURL()
  } catch {
    return null
  }
}
