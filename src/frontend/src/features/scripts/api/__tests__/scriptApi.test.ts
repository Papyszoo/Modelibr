import { client } from '@/lib/apiBase'

import {
  createScript,
  getAllScripts,
  getScriptsPaginated,
  updateScript,
} from '../scriptApi'

// `@/lib/apiBase` is globally mocked in setupTests.ts with jest.fn() methods.
const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock

/** The URL string the api layer passed to client.get on its most recent call. */
function lastGetUrl(): string {
  return mockGet.mock.calls.at(-1)?.[0] as string
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { scripts: [], totalCount: 0 } })
  mockPost.mockResolvedValue({ data: {} })
  mockPut.mockResolvedValue({ data: {} })
})

describe('getScriptsPaginated query serialization', () => {
  // Regression: packIds/projectIds were declared on the options type but never
  // appended to the query string, so a brand-new pack/project showed *every*
  // script (the server filter was never applied). TypeScript can't catch a
  // param that's accepted-but-dropped — only an assertion on the sent URL can.
  it('serializes packIds and projectIds (multi-value)', async () => {
    await getScriptsPaginated({
      page: 1,
      pageSize: 50,
      packIds: [3, 4],
      projectIds: [7],
    })

    const url = lastGetUrl()
    expect(url).toContain('packIds=3')
    expect(url).toContain('packIds=4')
    expect(url).toContain('projectIds=7')
  })

  it('serializes categoryIds, searchName and language', async () => {
    await getScriptsPaginated({
      page: 2,
      pageSize: 25,
      categoryIds: [11],
      searchName: '  player  ',
      language: 'csharp',
    })

    const url = lastGetUrl()
    expect(url).toContain('page=2')
    expect(url).toContain('pageSize=25')
    expect(url).toContain('categoryIds=11')
    // searchName is trimmed before sending.
    expect(url).toContain('searchName=player')
    expect(url).toContain('language=csharp')
  })

  it('omits optional filters when not provided', async () => {
    await getScriptsPaginated({ page: 1, pageSize: 50 })

    const url = lastGetUrl()
    expect(url).not.toContain('packIds')
    expect(url).not.toContain('projectIds')
    expect(url).not.toContain('searchName')
    expect(url).not.toContain('language')
  })
})

describe('getAllScripts query serialization', () => {
  it('appends categoryIds, searchName and language', async () => {
    await getAllScripts({
      categoryIds: [1, 2],
      searchName: 'hud',
      language: 'lua',
    })

    const url = lastGetUrl()
    expect(url).toContain('categoryIds=1')
    expect(url).toContain('categoryIds=2')
    expect(url).toContain('searchName=hud')
    expect(url).toContain('language=lua')
  })

  it('requests the bare endpoint when no options are given', async () => {
    await getAllScripts()
    expect(lastGetUrl()).toBe('/scripts')
  })
})

describe('updateScript payload contract', () => {
  // Regression: a name-only save was overwriting categoryId with undefined,
  // un-categorizing the script. The contract is "omit a key to leave it
  // intact"; these tests lock that the api layer forwards exactly what it's
  // given without inventing keys.
  it('sends only the provided keys (omitting category leaves it intact)', async () => {
    await updateScript(5, { name: 'renamed' })

    expect(mockPut).toHaveBeenCalledWith('/scripts/5', { name: 'renamed' })
    const payload = mockPut.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect('categoryId' in payload).toBe(false)
  })

  it('forwards categoryId when explicitly set (including null to clear)', async () => {
    await updateScript(5, { name: 'renamed', categoryId: null })
    expect(mockPut).toHaveBeenCalledWith('/scripts/5', {
      name: 'renamed',
      categoryId: null,
    })
  })
})

describe('createScript payload', () => {
  it('defaults content/category/description to empty/null', async () => {
    await createScript({ name: 'boot', language: 'lua' })

    expect(mockPost).toHaveBeenCalledWith('/scripts', {
      name: 'boot',
      language: 'lua',
      content: '',
      categoryId: null,
      description: null,
    })
  })
})
