import {
  formatDecimal,
  normalizeDecimalText,
  parseDecimalInput,
} from '../number'

/*
  The locale bug this guards against: a native number input in a comma-decimal
  locale (pl, de, ...) drops a typed "." so "1.5" becomes "15"; in a
  dot-decimal locale it drops a typed "," the same way. Parsing must therefore
  accept both separators in EVERY locale, not read the browser's.
*/
describe('parseDecimalInput', () => {
  it('reads both separators in a period locale (en)', () => {
    expect(parseDecimalInput('1.5')).toBe(1.5)
    expect(parseDecimalInput('1,5')).toBe(1.5)
  })

  it('reads both separators in a comma locale (pl)', () => {
    // The raw text the field hands over is the same regardless of locale; the
    // parser - not the browser - decides what a separator means.
    expect(parseDecimalInput('1,5')).toBe(1.5)
    expect(parseDecimalInput('1.5')).toBe(1.5)
    expect(parseDecimalInput('2,25')).toBe(2.25)
  })

  it('ignores grouping whitespace', () => {
    expect(parseDecimalInput('1 234,5')).toBe(1234.5)
    expect(parseDecimalInput('1\u00a0234.5')).toBe(1234.5)
  })

  it('uses the rightmost separator when both appear', () => {
    expect(parseDecimalInput('1,234.56')).toBe(1234.56)
    expect(parseDecimalInput('1.234,56')).toBe(1234.56)
  })

  it('returns undefined for empty or unparseable input', () => {
    expect(parseDecimalInput('')).toBeUndefined()
    expect(parseDecimalInput('   ')).toBeUndefined()
    expect(parseDecimalInput('abc')).toBeUndefined()
    expect(parseDecimalInput(null)).toBeUndefined()
    expect(parseDecimalInput(undefined)).toBeUndefined()
  })

  it('passes finite numbers through and rejects NaN/Infinity', () => {
    expect(parseDecimalInput(3)).toBe(3)
    expect(parseDecimalInput(Number.NaN)).toBeUndefined()
    expect(parseDecimalInput(Number.POSITIVE_INFINITY)).toBeUndefined()
  })
})

describe('normalizeDecimalText / formatDecimal', () => {
  it('normalizes to a "." decimal', () => {
    expect(normalizeDecimalText('1,5')).toBe('1.5')
    expect(normalizeDecimalText('1.234,56')).toBe('1234.56')
  })

  it('formats without float noise', () => {
    expect(formatDecimal(0.1 + 0.2)).toBe('0.3')
    expect(formatDecimal(3)).toBe('3')
  })
})
