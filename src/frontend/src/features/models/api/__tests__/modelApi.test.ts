import { client } from '@/lib/apiBase'

import {
  getModelCategoryCounts,
  getModels,
  getModelsPaginated,
  setDefaultTextureSet,
  updateModelTags,
  uploadModelGroup,
  uploadModelZip,
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

  it('sends uncategorized=true and drops categoryId for the Unassigned bucket', async () => {
    // The Unassigned sidebar bucket scopes server-side via `uncategorized`;
    // a stray categoryId alongside it would let the backend ignore the flag.
    await getModelsPaginated({
      page: 1,
      pageSize: 50,
      uncategorized: true,
      categoryIds: [5],
    })
    const url = lastGetUrl()
    expect(url).toContain('uncategorized=true')
    expect(url).not.toContain('categoryId=')
  })

  it('sends a single categoryId (real bucket) without the uncategorized flag', async () => {
    await getModelsPaginated({ page: 1, pageSize: 50, categoryIds: [5] })
    const url = lastGetUrl()
    expect(url).toContain('categoryId=5')
    expect(url).not.toContain('uncategorized')
  })
})

describe('getModelCategoryCounts', () => {
  it('reads the counts endpoint and unwraps the response body', async () => {
    // Regression: the sidebar badges read true totals from this endpoint, not
    // loaded-page scans — the URL and unwrapping must stay stable.
    mockGet.mockResolvedValue({
      data: {
        categories: [{ categoryId: 5, count: 3 }],
        uncategorizedCount: 2,
        totalCount: 5,
      },
    })
    const result = await getModelCategoryCounts()
    expect(lastGetUrl()).toBe('/model-categories/counts')
    expect(result.uncategorizedCount).toBe(2)
    expect(result.totalCount).toBe(5)
    expect(result.categories).toEqual([{ categoryId: 5, count: 3 }])
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

describe('multi-file / zip import request construction', () => {
  const lastPostArgs = () => mockPost.mock.calls.at(-1) as [string, FormData]

  it('uploadModelGroup posts primary + parallel files[]/paths[] the backend binds by name', async () => {
    // Regression: the backend reads `primary`, `files`, and a parallel `paths`
    // array; renaming any field (or desyncing files↔paths order) silently drops
    // every auxiliary so a multi-file glTF loses its .bin/textures.
    const primary = new File(['g'], 'FlightHelmet.gltf')
    const bin = new File(['b'], 'FlightHelmet.bin')
    const tex = new File(['t'], 'wood.png')

    await uploadModelGroup(primary, [
      { file: bin, relativePath: 'FlightHelmet.bin' },
      { file: tex, relativePath: 'textures/wood.png' },
    ])

    const [url, form] = lastPostArgs()
    expect(url).toBe('/models/multifile')
    expect((form.get('primary') as File).name).toBe('FlightHelmet.gltf')
    expect(form.getAll('files').map(f => (f as File).name)).toEqual([
      'FlightHelmet.bin',
      'wood.png',
    ])
    expect(form.getAll('paths')).toEqual([
      'FlightHelmet.bin',
      'textures/wood.png',
    ])
  })

  it('uploadModelGroup appends batchId as a query param', async () => {
    await uploadModelGroup(new File(['g'], 'a.gltf'), [], {
      batchId: 'batch-7',
    })
    expect(lastPostArgs()[0]).toBe('/models/multifile?batchId=batch-7')
  })

  it('uploadModelZip posts the archive under `file` to /models/zip', async () => {
    // Regression: the zip endpoint binds an IFormFile named `file`; a wrong field
    // name makes every zip import 400.
    const zip = new File(['z'], 'assets.zip', { type: 'application/zip' })
    await uploadModelZip(zip)

    const [url, form] = lastPostArgs()
    expect(url).toBe('/models/zip')
    expect((form.get('file') as File).name).toBe('assets.zip')
  })
})
