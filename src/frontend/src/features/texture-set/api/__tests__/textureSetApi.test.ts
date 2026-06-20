import { client } from '@/lib/apiBase'

import {
  associateTextureSetWithModelVersion,
  changeTextureChannel,
  changeTextureType,
  getTextureSetsPaginated,
} from '../textureSetApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock
const lastGetUrl = () => mockGet.mock.calls.at(-1)?.[0] as string

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: { textureSets: [], totalCount: 0 } })
  mockPost.mockResolvedValue({ data: {} })
  mockPut.mockResolvedValue({ data: {} })
})

describe('getTextureSetsPaginated query serialization', () => {
  it('serializes pack/project/category/textureTypes and kind', async () => {
    await getTextureSetsPaginated({
      page: 1,
      pageSize: 30,
      packIds: [2],
      projectIds: [3],
      categoryIds: [4],
      textureTypes: [1, 2],
      kind: 0,
    })
    const url = lastGetUrl()
    expect(url).toContain('packIds=2')
    expect(url).toContain('projectIds=3')
    expect(url).toContain('categoryIds=4')
    expect(url).toContain('textureTypes=1')
    expect(url).toContain('textureTypes=2')
    // kind=0 is a real value (Material) and must survive the undefined check.
    expect(url).toContain('kind=0')
  })

  it('keeps a 0 minResolution (null-check, not truthiness) and trims search', async () => {
    await getTextureSetsPaginated({
      page: 1,
      pageSize: 30,
      minResolution: 0,
      searchName: '  brick  ',
    })
    const url = lastGetUrl()
    expect(url).toContain('minResolution=0')
    expect(url).toContain('searchName=brick')
  })
})

describe('texture mutation payloads', () => {
  it('changeTextureType PUTs the new type to the texture sub-resource', async () => {
    await changeTextureType(5, 11, 3)
    expect(mockPut).toHaveBeenCalledWith('/texture-sets/5/textures/11/type', {
      textureType: 3,
    })
  })

  it('changeTextureChannel PUTs the source channel', async () => {
    await changeTextureChannel(5, 11, 2)
    expect(mockPut).toHaveBeenCalledWith(
      '/texture-sets/5/textures/11/channel',
      {
        sourceChannel: 2,
      }
    )
  })
})

describe('model-version association', () => {
  it('sends empty material/variant names (they represent "Default", not "omit")', async () => {
    // Contract: an empty string is a meaningful value here, so it must appear
    // in the query string; only `undefined` should be dropped.
    await associateTextureSetWithModelVersion(5, 99, '', '')
    const url = mockPost.mock.calls.at(-1)?.[0] as string
    expect(url).toBe(
      '/texture-sets/5/model-versions/99?materialName=&variantName='
    )
  })

  it('omits the query string entirely when names are undefined', async () => {
    await associateTextureSetWithModelVersion(5, 99)
    expect(mockPost).toHaveBeenCalledWith('/texture-sets/5/model-versions/99')
  })
})
