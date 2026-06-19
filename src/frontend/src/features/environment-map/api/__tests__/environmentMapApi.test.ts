import { client } from '@/lib/apiBase'

import {
  getAllEnvironmentMaps,
  getEnvironmentMapsPaginated,
  setEnvironmentMapCustomThumbnail,
  updateEnvironmentMapMetadata,
} from '../environmentMapApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock
const lastGetUrl = () => mockGet.mock.calls.at(-1)?.[0] as string

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { environmentMaps: [], totalCount: 0 } })
  mockPost.mockResolvedValue({ data: {} })
  mockPut.mockResolvedValue({ data: {} })
})

describe('environment map list serialization', () => {
  it('paginated: serializes page/size + pack/project/category + trimmed search', async () => {
    await getEnvironmentMapsPaginated({
      page: 2,
      pageSize: 24,
      packIds: [1],
      projectIds: [2],
      categoryIds: [3],
      searchName: '  studio  ',
    })
    const url = lastGetUrl()
    expect(url).toContain('page=2')
    expect(url).toContain('pageSize=24')
    expect(url).toContain('packIds=1')
    expect(url).toContain('projectIds=2')
    expect(url).toContain('categoryIds=3')
    expect(url).toContain('searchName=studio')
  })

  it('non-paginated: scopes by packIds and unwraps environmentMaps', async () => {
    mockGet.mockResolvedValue({
      data: { environmentMaps: [{ id: 1 }] },
    })
    const maps = await getAllEnvironmentMaps({ packIds: [7] })
    expect(lastGetUrl()).toBe('/environment-maps?packIds=7')
    expect(maps).toEqual([{ id: 1 }])
  })

  it('non-paginated: hits the bare endpoint with no scoping', async () => {
    mockGet.mockResolvedValue({ data: { environmentMaps: [] } })
    await getAllEnvironmentMaps()
    expect(lastGetUrl()).toBe('/environment-maps')
  })
})

describe('environment map mutations', () => {
  it('updateEnvironmentMapMetadata posts tags + categoryId', async () => {
    await updateEnvironmentMapMetadata(4, { tags: ['hdr'], categoryId: 2 })
    expect(mockPost).toHaveBeenCalledWith('/environment-maps/4/metadata', {
      tags: ['hdr'],
      categoryId: 2,
    })
  })

  it('setEnvironmentMapCustomThumbnail forwards null to clear', async () => {
    await setEnvironmentMapCustomThumbnail(4, null)
    expect(mockPut).toHaveBeenCalledWith('/environment-maps/4/thumbnail', {
      fileId: null,
    })
  })
})
