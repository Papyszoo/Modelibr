import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as backupsApi from '@/features/settings/api/backupsApi'
import * as settingsApi from '@/features/settings/api/settingsApi'
import { renderWithProviders } from '@/test/renderWithProviders'

import { BackupsSection } from '../BackupsSection'

jest.mock('@/features/settings/api/backupsApi')
jest.mock('@/features/settings/api/settingsApi')

const api = backupsApi as jest.Mocked<typeof backupsApi>
const settings = settingsApi as jest.Mocked<typeof settingsApi>

/** A complete GET /settings payload; tests override the fields they exercise. */
function settingsSnapshot(
  overrides: Partial<Awaited<ReturnType<typeof settingsApi.getSettings>>> = {}
): Awaited<ReturnType<typeof settingsApi.getSettings>> {
  return {
    maxFileSizeBytes: 1073741824,
    maxThumbnailSizeBytes: 10485760,
    thumbnailFrameCount: 30,
    thumbnailSize: 256,
    generateThumbnailOnUpload: true,
    generateAnimatedThumbnail: true,
    textureProxySize: 512,
    blenderPath: 'blender',
    blenderEnabled: false,
    duplicateNamePolicy: 'Allow',
    autoAssignOnImport: true,
    cleanRecycledFilesAfterDays: 0,
    preMigrationBackupEnabled: true,
    preMigrationBackupRetention: 3,
    skipDuplicateThumbnails: false,
    mcpEnabled: true,
    mcpWriteEnabled: false,
    mcpDestructiveEnabled: false,
    thumbnailBackground: 'transparent',
    blenderOperationTimeoutMinutes: 15,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

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
    settings.getSettings.mockResolvedValue(settingsSnapshot())
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

  it('saves the pre-migration backup toggle through the settings endpoint', async () => {
    settings.getSettings.mockResolvedValue(settingsSnapshot())
    settings.updateSetting.mockResolvedValue({
      key: 'PreMigrationBackupEnabled',
      value: 'false',
      updatedAt: '2026-01-01T00:00:00Z',
    })

    renderWithProviders(<BackupsSection />)

    const toggle = await screen.findByRole('checkbox', {
      name: /Back up before updates/,
    })
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).toBeChecked()

    await userEvent.click(toggle)

    await waitFor(() => {
      expect(settings.updateSetting).toHaveBeenCalledWith(
        'PreMigrationBackupEnabled',
        'false'
      )
    })
  })

  it('commits the recycled-file retention on blur', async () => {
    settings.getSettings.mockResolvedValue(
      settingsSnapshot({ cleanRecycledFilesAfterDays: 0 })
    )
    settings.updateSetting.mockResolvedValue({
      key: 'CleanRecycledFilesAfterDays',
      value: '30',
      updatedAt: '2026-01-01T00:00:00Z',
    })

    renderWithProviders(<BackupsSection />)

    const input = await screen.findByLabelText('Keep recycled files for (days)')
    await waitFor(() => expect(input).toBeEnabled())
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    await userEvent.tab()

    await waitFor(() => {
      expect(settings.updateSetting).toHaveBeenCalledWith(
        'CleanRecycledFilesAfterDays',
        '30'
      )
    })
  })
})
