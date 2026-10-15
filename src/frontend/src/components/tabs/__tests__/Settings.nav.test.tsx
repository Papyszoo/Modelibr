import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Settings } from '@/components/tabs/Settings'
import * as settingsApi from '@/features/settings/api/settingsApi'
import { useUIPreferencesStore } from '@/stores/uiPreferencesStore'
import { renderWithProviders } from '@/test/renderWithProviders'

// useTheme imports PrimeReact theme CSS with a `?url` suffix, which the Jest
// CSS mapper does not match - stub the hook so the component renders.
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: jest.fn() }),
}))
// Jest cannot parse a bare `import.meta.env`; the env helper is mocked.
jest.mock('@/lib/env', () => ({
  isDemoMode: () => false,
}))

jest.mock('@/features/settings/api/settingsApi')
jest.mock('@/features/settings/api/nativeRuntimeApi', () => ({
  getNativeRuntime: jest.fn(() => Promise.reject(new Error('not native'))),
  updateNativeRuntime: jest.fn(),
}))
jest.mock('@/features/models/api/queries', () => ({
  useModelsQuery: () => ({ data: undefined }),
}))
// Section bodies are not under test here; stub the heavy ones so the nav can
// be exercised in isolation.
jest.mock('@/features/settings/McpAgentsSection', () => ({
  McpAgentsSection: () => <div data-testid="stub-mcp" />,
}))
jest.mock('@/features/settings/BackupsSection', () => ({
  BackupsSection: () => <div data-testid="stub-backups" />,
}))
jest.mock('@/features/settings/NativeDesktopSection', () => ({
  NativeDesktopSection: () => <div data-testid="stub-desktop" />,
}))
jest.mock('@/features/scripts/components/ScriptTemplatesSection', () => ({
  ScriptTemplatesSection: () => <div data-testid="stub-script-templates" />,
}))

const settings = settingsApi as jest.Mocked<typeof settingsApi>

/** A complete GET /settings payload; tests override the fields they exercise. */
function settingsSnapshot(): Awaited<
  ReturnType<typeof settingsApi.getSettings>
> {
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
  }
}

describe('Settings section nav', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useUIPreferencesStore.setState({ settingsSection: 'appearance' })
    settings.getSettings.mockResolvedValue(settingsSnapshot())
    // Background effects fetch these on mount; automocked functions would
    // resolve `undefined` and crash the `.then` chains.
    settings.getBlenderVersions.mockResolvedValue({
      versions: [],
      isOffline: true,
    })
    settings.getBlenderStatus.mockResolvedValue({
      state: 'none',
      installedVersion: null,
      installedPath: null,
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      error: null,
    })
    settings.getWebDavUrls.mockResolvedValue({ urls: [] })
  })

  it('shows one section at a time and switches content when a nav item is selected', async () => {
    // Regression: the page used to stack every section in a single scrolling
    // column. Selecting a nav item must swap the content pane to exactly that
    // section and move the active highlight.
    renderWithProviders(<Settings />)

    const fileUploadNav = await screen.findByTestId('settings-nav-fileUpload')
    expect(screen.getByTestId('settings-nav-appearance')).toHaveClass(
      'is-active'
    )
    expect(
      screen.getByRole('heading', { name: 'Appearance' })
    ).toBeInTheDocument()

    await userEvent.click(fileUploadNav)

    await waitFor(() => {
      expect(fileUploadNav).toHaveClass('is-active')
    })
    expect(screen.getByTestId('settings-nav-appearance')).not.toHaveClass(
      'is-active'
    )
    expect(
      screen.getByRole('heading', { name: 'File Upload' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Appearance' })
    ).not.toBeInTheDocument()
  })

  it('reopens on the remembered section and persists new selections', async () => {
    // Regression: a section selection that was not persisted would reset to
    // the first section on every mount, losing the user's place.
    useUIPreferencesStore.setState({ settingsSection: 'mcpAgents' })

    const first = renderWithProviders(<Settings />)

    const mcpNav = await screen.findByTestId('settings-nav-mcpAgents')
    expect(mcpNav).toHaveClass('is-active')
    expect(await screen.findByTestId('stub-mcp')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('settings-nav-backup'))
    await waitFor(() => {
      expect(useUIPreferencesStore.getState().settingsSection).toBe('backup')
    })

    // A fresh mount (new tab, reload) must open on the remembered section.
    first.unmount()
    renderWithProviders(<Settings />)

    expect(await screen.findByTestId('stub-backups')).toBeInTheDocument()
    expect(screen.getByTestId('settings-nav-backup')).toHaveClass('is-active')
  })
})
