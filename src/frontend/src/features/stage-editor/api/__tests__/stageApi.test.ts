import { client } from '@/lib/apiBase'

import { createStage, getStageById, updateStage } from '../stageApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: {} })
  mockPost.mockResolvedValue({ data: {} })
  mockPut.mockResolvedValue({ data: {} })
})

describe('stage api', () => {
  it('creates a stage with name + configuration JSON', async () => {
    await createStage('My Stage', '{"a":1}')
    expect(mockPost).toHaveBeenCalledWith('/stages', {
      name: 'My Stage',
      configurationJson: '{"a":1}',
    })
  })

  it('updates only the configuration JSON (name is immutable on update)', async () => {
    await updateStage(3, '{"b":2}')
    expect(mockPut).toHaveBeenCalledWith('/stages/3', {
      configurationJson: '{"b":2}',
    })
    const payload = mockPut.mock.calls.at(-1)?.[1] as Record<string, unknown>
    expect('name' in payload).toBe(false)
  })

  it('fetches one stage by id', async () => {
    await getStageById(3)
    expect(mockGet).toHaveBeenCalledWith('/stages/3')
  })
})
