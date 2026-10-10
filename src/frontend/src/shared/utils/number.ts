/**
 * Locale-independent numeric parsing for the whole app.
 *
 * A native `<input type="number">` accepts only the browser locale's decimal
 * separator and silently drops the other one: in a comma-decimal locale
 * (pl/de/...), typing `1.5` becomes `15`. Every numeric field therefore parses
 * its raw text through `parseDecimalInput`, which accepts both `.` and `,` as
 * the decimal separator regardless of locale.
 */

/** Whitespace grouping characters used across locales (narrow/regular nbsp, thin space, apostrophe). */
const GROUPING_CHARS = /[\s\u00a0\u202f\u2009']/g

/**
 * Normalizes a typed number to the canonical `.`-decimal string. Grouping
 * whitespace is stripped; when both separators are present the rightmost one is
 * the decimal separator and the other is grouping.
 */
export function normalizeDecimalText(text: string): string {
  let normalized = text.replace(GROUPING_CHARS, '')
  const lastDot = normalized.lastIndexOf('.')
  const lastComma = normalized.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    normalized =
      lastComma > lastDot
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '')
  } else if (lastComma >= 0) {
    normalized = normalized.replace(/,/g, '.')
  }
  return normalized
}

/**
 * Parses user input (or an already-numeric value) into a finite number.
 * Returns `undefined` for empty or unparseable text.
 */
export function parseDecimalInput(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const text = value.trim()
  if (!text) return undefined

  const parsed = Number(normalizeDecimalText(text))
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Canonical `"."`-decimal text for a numeric input value. */
export function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return ''
  // Trim float noise (0.1 + 0.2) without forcing trailing zeros.
  return String(Number(value.toFixed(6)))
}
