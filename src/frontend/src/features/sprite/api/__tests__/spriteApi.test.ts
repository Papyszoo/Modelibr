import { client } from '@/lib/apiBase'

import { getSpritesPaginated, updateSprite } from '../spriteApi'

const mockGet = client.get as jest.Mock
const mockPut = client.put as jest.Mock
const lastGetUrl = () => mockGet.mock.calls.at(-1)?.[0] as string

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { sprites: [], totalCount: 0 } })
  mockPut.mockResolvedValue({ data: {} })
})

describe('getSpritesPaginated query serialization', () => {
  it('serializes pack/project/category filters and trims search', async () => {
    await getSpritesPaginated({
      page: 1,
      pageSize: 40,
      packIds: [2, 3],
      projectIds: [9],
      categoryIds: [4],
      searchName: '  hero  ',
    })
    const url = lastGetUrl()
    expect(url).toContain('packIds=2')
    expect(url).toContain('packIds=3')
    expect(url).toContain('projectIds=9')
    expect(url).toContain('categoryIds=4')
    expect(url).toContain('searchName=hero')
  })

  it('omits filters that were not supplied', async () => {
    await getSpritesPaginated({ page: 1, pageSize: 40 })
    const url = lastGetUrl()
    expect(url).not.toContain('packIds')
    expect(url).not.toContain('searchName')
  })
})

describe('updateSprite payload contract', () => {
  it('sends only provided keys (omitting category leaves it intact)', async () => {
    await updateSprite(8, { name: 'renamed' })
    expect(mockPut).toHaveBeenCalledWith('/sprites/8', { name: 'renamed' })
    const payload = mockPut.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect('categoryId' in payload).toBe(false)
  })

  it('forwards categoryId null to clear the category', async () => {
    await updateSprite(8, { categoryId: null })
    expect(mockPut).toHaveBeenCalledWith('/sprites/8', { categoryId: null })
  })
})
