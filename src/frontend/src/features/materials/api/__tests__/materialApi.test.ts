import { client } from '@/lib/apiBase'

import { getAllMaterials, getMaterialLibrary } from '../materialApi'

const mockGet = client.get as jest.Mock

const lastGetUrl = () => mockGet.mock.calls.at(-1)?.[0] as string

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { materials: [] } })
})

describe('getAllMaterials', () => {
  // The PBR page must read the parameter-materials endpoint, not the merged
  // one. Pointing it at /materials/library would silently fold Universal
  // texture sets into a page that is supposed to be parameters only - the
  // exact thing the two-separate-pages decision rules out.
  it('reads /materials, never the merged library surface', async () => {
    await getAllMaterials()
    const url = lastGetUrl()
    expect(url).toBe('/materials')
    expect(url).not.toContain('library')
  })

  it('serializes search and repeats categoryIds per value', async () => {
    await getAllMaterials({ search: 'brass', categoryIds: [4, 7] })
    const url = lastGetUrl()
    expect(url).toContain('searchName=brass')
    // Repeated key, not a comma list - the endpoint binds int[] from
    // repeated `categoryIds` params.
    expect(url).toContain('categoryIds=4')
    expect(url).toContain('categoryIds=7')
  })

  it('omits the query string entirely when nothing is filtered', async () => {
    // A bare "?" or "?searchName=" would make the server treat an empty
    // search as a filter rather than as "no filter".
    await getAllMaterials({ search: '' })
    expect(lastGetUrl()).toBe('/materials')
  })

  it('unwraps the materials array from the response envelope', async () => {
    mockGet.mockResolvedValue({
      data: { materials: [{ id: 1, name: 'Brushed Brass' }] },
    })
    const result = await getAllMaterials()
    expect(result.materials).toHaveLength(1)
    expect(result.materials[0]?.name).toBe('Brushed Brass')
  })

  it('propagates a failed request rather than returning an empty list', async () => {
    // Swallowing this would render "No PBR materials yet" on a server error,
    // which reads as "your library is empty" - the worst possible lie here.
    mockGet.mockRejectedValue(new Error('boom'))
    await expect(getAllMaterials()).rejects.toThrow('boom')
  })
})

describe('getMaterialLibrary stays distinct', () => {
  // Guards the split from the other direction: the merged surface is what the
  // slot picker uses, and it must keep its own path and requiresUvs filter.
  it('reads /materials/library and passes requiresUvs through', async () => {
    mockGet.mockResolvedValue({ data: { entries: [], totalCount: 0 } })
    await getMaterialLibrary({ requiresUvs: false })
    const url = lastGetUrl()
    expect(url).toContain('/materials/library')
    expect(url).toContain('requiresUvs=false')
  })
})
