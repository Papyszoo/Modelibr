import { describe, it, expect } from 'vitest'
import {
  encodePartSegment,
  resolveSiblingSegments,
  joinPartPath,
  PART_PATH_VERSION,
} from '../lib/partPath.js'

describe('encodePartSegment', () => {
  it('leaves ordinary names untouched', () => {
    expect(encodePartSegment('Doorknob_Brass')).toBe('Doorknob_Brass')
  })

  it('percent-encodes the four structural characters', () => {
    expect(encodePartSegment('a/b')).toBe('a%2Fb')
    expect(encodePartSegment('50%')).toBe('50%25')
    expect(encodePartSegment('Arr[0]')).toBe('Arr%5B0%5D')
  })

  it('trims surrounding whitespace', () => {
    expect(encodePartSegment('  Chair  ')).toBe('Chair')
  })
})

describe('resolveSiblingSegments', () => {
  it('adds no ordinal when names are unique', () => {
    expect(resolveSiblingSegments(['Seat', 'Back', 'Leg'])).toEqual([
      'Seat',
      'Back',
      'Leg',
    ])
  })

  it('disambiguates duplicate siblings in stable order', () => {
    expect(resolveSiblingSegments(['Leg', 'Leg', 'Leg', 'Leg'])).toEqual([
      'Leg[0]',
      'Leg[1]',
      'Leg[2]',
      'Leg[3]',
    ])
  })

  it('only ordinal-tags the colliding names, not the unique one', () => {
    expect(resolveSiblingSegments(['Leg', 'Seat', 'Leg'])).toEqual([
      'Leg[0]',
      'Seat',
      'Leg[1]',
    ])
  })

  it('gives blank names an ordinal so the path stays parseable', () => {
    expect(resolveSiblingSegments(['', '', 'Seat'])).toEqual([
      '[0]',
      '[1]',
      'Seat',
    ])
  })

  it('keeps reserved-char names unambiguous (a literal % is itself encoded)', () => {
    // "a/b" → "a%2Fb"; "a%2Fb" → "a%252Fb" (its % becomes %25), so they do NOT
    // collide — the encoding is reversible, which is the whole point.
    expect(resolveSiblingSegments(['a/b', 'a%2Fb'])).toEqual([
      'a%2Fb',
      'a%252Fb',
    ])
  })
})

describe('joinPartPath', () => {
  it('roots a first-level segment', () => {
    expect(joinPartPath('/', 'Chair')).toBe('/Chair')
    expect(joinPartPath('', 'Chair')).toBe('/Chair')
  })

  it('appends deeper segments', () => {
    expect(joinPartPath('/Chair', 'Leg[0]')).toBe('/Chair/Leg[0]')
  })
})

it('exposes a version constant', () => {
  expect(PART_PATH_VERSION).toBe(1)
})
