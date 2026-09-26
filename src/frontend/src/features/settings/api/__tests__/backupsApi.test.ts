import { client } from '@/lib/apiBase'

import {
  createBackup,
  deleteBackup,
  getBackupCapabilities,
  getBackupDownloadUrl,
  stageRestore,
} from '../backupsApi'

const mockPost = client.post as jest.Mock
const mockDelete = client.delete as jest.Mock
const mockGet = client.get as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockPost.mockResolvedValue({ data: {} })
  mockDelete.mockResolvedValue({ data: {} })
  mockGet.mockResolvedValue({ data: {} })
})

describe('backups api', () => {
  it('reads whether this build can actually produce a backup', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        available: false,
        reason: "'/rt/postgres/bin/pg_dump' is configured but does not exist.",
      },
    })
    const caps = await getBackupCapabilities()
    expect(mockGet).toHaveBeenCalledWith('/backups/capabilities')
    expect(caps.available).toBe(false)
    expect(caps.reason).toContain('pg_dump')
  })

  it('creates a backup with the includeThumbnails flag', async () => {
    await createBackup(true)
    expect(mockPost).toHaveBeenCalledWith('/backups', {
      includeThumbnails: true,
    })
  })

  it('URL-encodes the file name when deleting (names contain spaces/timestamps)', async () => {
    await deleteBackup('backup 2026-06-19.zip')
    expect(mockDelete).toHaveBeenCalledWith('/backups/backup%202026-06-19.zip')
  })

  it('stages a restore via POST on the encoded file path', async () => {
    await stageRestore('backup 1.zip')
    expect(mockPost).toHaveBeenCalledWith('/backups/backup%201.zip/restore')
  })

  it('builds an absolute download URL against the api base', async () => {
    // baseURL is mocked to http://localhost:8080 in setupTests.
    expect(getBackupDownloadUrl('backup 1.zip')).toBe(
      'http://localhost:8080/backups/backup%201.zip'
    )
  })
})
