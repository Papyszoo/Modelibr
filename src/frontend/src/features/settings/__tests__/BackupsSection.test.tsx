import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as backupsApi from '@/features/settings/api/backupsApi'
import { renderWithProviders } from '@/test/renderWithProviders'

import { BackupsSection } from '../BackupsSection'

jest.mock('@/features/settings/api/backupsApi')

const api = backupsApi as jest.Mocked<typeof backupsApi>

const storage = {
  hostPath: './data/backups',
  containerPath: '/var/lib/modelibr/backups',
  totalUsedBytes: 1024,
}

describe('BackupsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.listBackups.mockResolvedValue({ backups: [] })
    api.getBackupStorageInfo.mockResolvedValue(storage)
  })

  it('offers a working Create backup with no capability probe', async () => {
    // The section used to ask the API whether this build could back up at all, and
    // disable the button when it could not - the desktop build could not, because
    // its PostgreSQL runtime ships no client tools. Backups are now written through
    // the database driver, so the question no longer has an answer that varies by
    // build, and asking it would be a request that can only mislead.
    api.getBackupSizeEstimate.mockResolvedValue({
      databaseBytes: 10,
      uploadsBytes: 20,
      thumbnailsBytes: 30,
    })

    renderWithProviders(<BackupsSection />)

    const create = await screen.findByRole('button', { name: 'Create backup' })
    await waitFor(() => {
      expect(create).toBeEnabled()
    })
    expect(
      screen.queryByText(/Backups are unavailable in this build/i)
    ).not.toBeInTheDocument()

    await userEvent.click(create)
    await waitFor(() => {
      expect(api.getBackupSizeEstimate).toHaveBeenCalled()
    })
  })

  it('disables creating a backup only while one is already running', async () => {
    api.listBackups.mockResolvedValue({
      backups: [
        {
          fileName: 'modelibr-2026-01-01-000000.tar',
          sizeBytes: 10,
          createdAtUtc: '2026-01-01T00:00:00Z',
          status: 'in_progress',
          hostPath: './data/backups/modelibr-2026-01-01-000000.tar',
          containerPath:
            '/var/lib/modelibr/backups/modelibr-2026-01-01-000000.tar',
          includesThumbnails: false,
          error: null,
        },
      ],
    })

    renderWithProviders(<BackupsSection />)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create backup' })
      ).toBeDisabled()
    })
  })
})
