/**
 * Generates an id string, preferring a real UUID v4.
 *
 * `crypto.randomUUID()` is only defined in a secure context, so over plain
 * `http://<lan-ip>` (a desktop client reaching a host with network access on)
 * it is undefined and every caller crashed. `crypto.getRandomValues()` is
 * available in insecure contexts too, so fall back to building the v4 string
 * from it; the last resort keeps the UI working in a fully locked-down runtime.
 */
export function generateId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }

  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    // Version (4) and variant bits, per RFC 4122 section 4.4.
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, byte =>
      byte.toString(16).padStart(2, '0')
    ).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
      16,
      20
    )}-${hex.slice(20)}`
  }

  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
}
