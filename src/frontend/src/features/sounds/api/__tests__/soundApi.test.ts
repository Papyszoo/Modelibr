import { client } from '@/lib/apiBase'

import { getAllSounds, getSoundsPaginated, updateSound } from '../soundApi'

const mockGet = client.get as jest.Mock
const mockPut = client.put as jest.Mock

const lastGetUrl = () => mockGet.mock.calls.at(-1)?.[0] as string

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { sounds: [], totalCount: 0 } })
  mockPut.mockResolvedValue({ data: {} })
})

describe('getSoundsPaginated query serialization', () => {
  it('serializes pack/project/category filters and the duration range', async () => {
    await getSoundsPaginated({
      page: 1,
      pageSize: 50,
      packIds: [2],
      projectIds: [3],
      categoryIds: [4],
      minDuration: 1.5,
      maxDuration: 30,
    })
    const url = lastGetUrl()
    expect(url).toContain('packIds=2')
    expect(url).toContain('projectIds=3')
    expect(url).toContain('categoryIds=4')
    expect(url).toContain('minDuration=1.5')
    expect(url).toContain('maxDuration=30')
  })

  it('keeps a 0 duration bound (null-check, not truthiness)', async () => {
    // minDuration is guarded with `!= null`, so a legitimate 0 must survive —
    // a truthy check here would drop "from 0 seconds".
    await getSoundsPaginated({ page: 1, pageSize: 50, minDuration: 0 })
    expect(lastGetUrl()).toContain('minDuration=0')
  })

  it('trims search and omits unset filters', async () => {
    await getSoundsPaginated({ page: 1, pageSize: 50, searchName: '  hit  ' })
    const url = lastGetUrl()
    expect(url).toContain('searchName=hit')
    expect(url).not.toContain('minDuration')
    expect(url).not.toContain('packIds')
  })
})

describe('getAllSounds', () => {
  it('hits the bare endpoint when no filters are passed', async () => {
    await getAllSounds()
    expect(lastGetUrl()).toBe('/sounds')
  })
})

describe('updateSound payload contract', () => {
  it('sends only the keys provided (omitting category leaves it intact)', async () => {
    await updateSound(8, { name: 'renamed' })
    expect(mockPut).toHaveBeenCalledWith('/sounds/8', { name: 'renamed' })
    const payload = mockPut.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect('categoryId' in payload).toBe(false)
  })

  it('forwards categoryId null to clear the category', async () => {
    await updateSound(8, { categoryId: null })
    expect(mockPut).toHaveBeenCalledWith('/sounds/8', { categoryId: null })
  })
})
