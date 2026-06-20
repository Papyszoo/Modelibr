import { client } from '@/lib/apiBase'

import { installBlender, probeWebDavUrl, updateSetting } from '../settingsApi'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock
const mockPut = client.put as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGet.mockResolvedValue({ data: {} })
  mockPost.mockResolvedValue({ data: {} })
  mockPut.mockResolvedValue({ data: {} })
})

describe('settings api', () => {
  it('URL-encodes the setting key on a single-key update', async () => {
    await updateSetting('duplicate/name policy', 'Allow')
    expect(mockPut).toHaveBeenCalledWith(
      '/settings/duplicate%2Fname%20policy',
      { value: 'Allow' }
    )
  })

  it('passes the probe url as a query param (not interpolated into the path)', async () => {
    await probeWebDavUrl('https://host:443/dav')
    expect(mockGet).toHaveBeenCalledWith('/settings/webdav/probe', {
      params: { url: 'https://host:443/dav' },
    })
  })

  it('installs a specific Blender version', async () => {
    await installBlender('4.2')
    expect(mockPost).toHaveBeenCalledWith('/settings/blender/install', {
      version: '4.2',
    })
  })
})
