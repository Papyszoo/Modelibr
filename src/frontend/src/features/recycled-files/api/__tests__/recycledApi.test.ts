import { client } from '@/lib/apiBase'

import {
  getAllRecycledFiles,
  getDeletePreview,
  permanentlyDeleteEntity,
  restoreEntity,
} from '../recycledApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockDelete = client.delete as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: {} })
  mockPost.mockResolvedValue({ data: {} })
  mockDelete.mockResolvedValue({ data: {} })
})

describe('recycle-bin endpoints', () => {
  // entityType is interpolated into the path; the restore/preview/permanent
  // verbs differ, and getting the verb wrong silently no-ops a destructive or
  // recovery action. These lock method + URL per operation.
  it('restores via POST /recycled/{type}/{id}/restore', async () => {
    await restoreEntity('script', 7)
    expect(mockPost).toHaveBeenCalledWith('/recycled/script/7/restore')
  })

  it('previews a permanent delete via GET /recycled/{type}/{id}/preview', async () => {
    await getDeletePreview('model', 12)
    expect(mockGet).toHaveBeenCalledWith('/recycled/model/12/preview')
  })

  it('permanently deletes via DELETE /recycled/{type}/{id}/permanent', async () => {
    await permanentlyDeleteEntity('textureSet', 5)
    expect(mockDelete).toHaveBeenCalledWith('/recycled/textureSet/5/permanent')
  })

  it('lists everything in the bin via GET /recycled', async () => {
    await getAllRecycledFiles()
    expect(mockGet).toHaveBeenCalledWith('/recycled')
  })
})
