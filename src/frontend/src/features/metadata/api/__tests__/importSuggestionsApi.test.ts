import { client } from '@/lib/apiBase'

import { getImportSuggestions, reviewImportSuggestions } from '../metadataApi'

const get = client.get as jest.Mock
const post = client.post as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getImportSuggestions', () => {
  it('sends paging as query params, not as a path', async () => {
    get.mockResolvedValue({
      data: { total: 0, page: 2, pageSize: 25, items: [] },
    })

    await getImportSuggestions(2, 25)

    expect(get).toHaveBeenCalledWith('/metadata/import-suggestions', {
      params: { page: 2, pageSize: 25 },
    })
  })

  it('propagates a failure instead of reporting an empty queue', async () => {
    // A swallowed error here would hide the banner rather than show a problem,
    // and the user would never learn the automation ran at all.
    get.mockRejectedValue(new Error('boom'))

    await expect(getImportSuggestions()).rejects.toThrow('boom')
  })
})

describe('reviewImportSuggestions', () => {
  it('omits ids entirely when settling the whole queue', async () => {
    post.mockResolvedValue({
      data: { reviewed: 3, categoriesCleared: 0, tagsRemoved: 0, remaining: 0 },
    })

    await reviewImportSuggestions(true)

    // `modelIds: undefined` is what the server reads as "everything waiting".
    // An empty array would be read as "nothing", and a "keep all" would settle
    // nothing while reporting success.
    expect(post).toHaveBeenCalledWith('/metadata/import-suggestions/review', {
      accept: true,
      modelIds: undefined,
    })
  })

  it('sends the ids when only some rows were picked', async () => {
    post.mockResolvedValue({
      data: { reviewed: 2, categoriesCleared: 2, tagsRemoved: 3, remaining: 8 },
    })

    const result = await reviewImportSuggestions(false, [4, 9])

    expect(post).toHaveBeenCalledWith('/metadata/import-suggestions/review', {
      accept: false,
      modelIds: [4, 9],
    })
    expect(result.remaining).toBe(8)
  })
})
