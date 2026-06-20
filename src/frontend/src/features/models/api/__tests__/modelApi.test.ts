import { client } from '@/lib/apiBase'

import {
  getModels,
  getModelsPaginated,
  setDefaultTextureSet,
  updateModelTags,
} from '../modelApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock

const lastGetUrl = () => mockGet.mock.calls.at(-1)?.[0] as string

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { items: [], totalCount: 0 } })
  mockPost.mockResolvedValue({ data: {} })
  mockPut.mockResolvedValue({ data: {} })
})

describe('getModelsPaginated query serialization', () => {
  it('serializes multi-value packIds / projectIds', async () => {
    await getModelsPaginated({
      page: 1,
      pageSize: 20,
      packIds: [3, 4],
      projectIds: [9],
    })
    const url = lastGetUrl()
    expect(url).toContain('packIds=3')
    expect(url).toContain('packIds=4')
    expect(url).toContain('projectIds=9')
  })

  it('serializes categories as `categoryId` and tags as `tag` (singular, per API contract)', async () => {
    // The backend expects the singular repeated keys; a refactor to the plural
    // `categoryIds`/`tags` would silently drop every category/tag filter.
    await getModelsPaginated({
      page: 1,
      pageSize: 20,
      categoryIds: [5, 6],
      tags: ['pbr', 'wip'],
    })
    const url = lastGetUrl()
    expect(url).toContain('categoryId=5')
    expect(url).toContain('categoryId=6')
    expect(url).not.toContain('categoryIds=')
    expect(url).toContain('tag=pbr')
    expect(url).toContain('tag=wip')
    expect(url).not.toMatch(/[?&]tags=/)
  })

  it('serializes the triangle-count range and boolean facets', async () => {
    await getModelsPaginated({
      page: 1,
      pageSize: 20,
      minTriangleCount: 100,
      maxTriangleCount: 5000,
      hasConceptImages: true,
      hasAnimations: false,
    })
    const url = lastGetUrl()
    expect(url).toContain('minTriangleCount=100')
    expect(url).toContain('maxTriangleCount=5000')
    expect(url).toContain('hasConceptImages=true')
    // `false` must still be sent — it's a meaningful "exclude" filter.
    expect(url).toContain('hasAnimations=false')
  })

  it('trims the search term and omits unset filters', async () => {
    await getModelsPaginated({ page: 2, pageSize: 50, searchName: '  car  ' })
    const url = lastGetUrl()
    expect(url).toContain('page=2')
    expect(url).toContain('searchName=car')
    expect(url).not.toContain('packIds')
    expect(url).not.toContain('minTriangleCount')
  })
})

describe('getModels (non-paginated) container scoping', () => {
  it('scopes by a single packId / projectId', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await getModels({ packId: 7 })
    expect(lastGetUrl()).toBe('/models?packId=7')

    await getModels({ projectId: 8 })
    expect(lastGetUrl()).toBe('/models?projectId=8')
  })

  it('requests the bare endpoint with no scoping', async () => {
    mockGet.mockResolvedValue({ data: [] })
    await getModels()
    expect(lastGetUrl()).toBe('/models')
  })
})

describe('write payload contracts', () => {
  it('updateModelTags posts tags, description and categoryId together', async () => {
    await updateModelTags('9', ['pbr'], 'a hero prop', 3)
    expect(mockPost).toHaveBeenCalledWith('/models/9/tags', {
      tags: ['pbr'],
      description: 'a hero prop',
      categoryId: 3,
    })
  })

  it('setDefaultTextureSet uses the PascalCase body the API expects', async () => {
    // The endpoint binds PascalCase properties; camelCase keys would bind to
    // null and silently clear the default texture set.
    await setDefaultTextureSet(4, 11, 99)
    expect(mockPut).toHaveBeenCalledWith('/models/4/default-texture-set', {
      TextureSetId: 11,
      ModelVersionId: 99,
    })
  })

  it('setDefaultTextureSet forwards null to clear the default', async () => {
    await setDefaultTextureSet(4, null)
    expect(mockPut).toHaveBeenCalledWith('/models/4/default-texture-set', {
      TextureSetId: null,
      ModelVersionId: undefined,
    })
  })
})
