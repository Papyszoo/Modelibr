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

describe('BackupsSection capability warning', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.listBackups.mockResolvedValue({ backups: [] })
    api.getBackupStorageInfo.mockResolvedValue(storage)
  })

  it('says backups are unavailable and disables creating one when tooling is missing', async () => {
    api.getBackupCapabilities.mockResolvedValue({
      available: false,
      reason:
        "'/runtime/postgres/bin/pg_dump' is configured but does not exist.",
    })

    renderWithProviders(<BackupsSection />)

    await waitFor(() => {
      expect(
        screen.getByText(/Backups are unavailable in this build/i)
      ).toBeVisible()
    })

    // The reason from the API is surfaced, not swallowed.
    expect(screen.getByText(/is configured but does not exist/i)).toBeVisible()
    // And the user is told what to do instead of being left to guess.
    expect(screen.getByText(/copy the data folder/i)).toBeVisible()
    // A button that can only fail is not offered.
    expect(screen.getByRole('button', { name: 'Create backup' })).toBeDisabled()
  })

  it('leaves backups usable when the tooling is present', async () => {
    api.getBackupCapabilities.mockResolvedValue({
      available: true,
      reason: null,
    })
    api.getBackupSizeEstimate.mockResolvedValue({
      databaseBytes: 10,
      uploadsBytes: 20,
      thumbnailsBytes: 30,
    })

    renderWithProviders(<BackupsSection />)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Create backup' })
      ).toBeEnabled()
    })
    expect(
      screen.queryByText(/Backups are unavailable in this build/i)
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create backup' }))
    await waitFor(() => {
      expect(api.getBackupSizeEstimate).toHaveBeenCalled()
    })
  })
})
