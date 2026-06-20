import { client } from '@/lib/apiBase'

import { getBatchUploadHistory } from '../historyApi'

const mockGet = client.get as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('history api', () => {
  it('fetches batch upload history and unwraps the response body', async () => {
    const uploads = [{ id: 1, batchId: 'b1', fileName: 'a.glb' }]
    mockGet.mockResolvedValue({ data: { uploads } })

    const result = await getBatchUploadHistory()
    expect(mockGet).toHaveBeenCalledWith('/batch-uploads/history')
    expect(result.uploads).toBe(uploads)
  })
})
