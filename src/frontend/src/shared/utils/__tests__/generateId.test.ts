import { generateId } from '@/shared/utils/generateId'

// Regression: over plain http://<lan-ip> (not a secure context)
// crypto.randomUUID is undefined, so getWindowId() threw on first load and the
// UI never started. The helper must still produce an id there.
describe('generateId', () => {
  const originalRandomUUID = crypto.randomUUID

  function setRandomUUID(value: unknown) {
    Object.defineProperty(crypto, 'randomUUID', {
      value,
      configurable: true,
      writable: true,
    })
  }

  afterEach(() => {
    setRandomUUID(originalRandomUUID)
  })

  it('prefers crypto.randomUUID when the browser provides it', () => {
    const expected = '11111111-1111-4111-8111-111111111111'
    const randomUUID = jest.fn(() => expected)
    setRandomUUID(randomUUID)

    expect(generateId()).toBe(expected)
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('builds a valid v4 id from getRandomValues when randomUUID is undefined', () => {
    setRandomUUID(undefined)

    const id = generateId()
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it('returns a fresh id on every call', () => {
    setRandomUUID(undefined)

    const ids = new Set(Array.from({ length: 50 }, () => generateId()))
    expect(ids.size).toBe(50)
  })
})
