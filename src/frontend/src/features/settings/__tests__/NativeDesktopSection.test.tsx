import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as nativeRuntimeApi from '@/features/settings/api/nativeRuntimeApi'
import { renderWithProviders } from '@/test/renderWithProviders'

import { NativeDesktopSection } from '../NativeDesktopSection'

jest.mock('@/features/settings/api/nativeRuntimeApi')

const api = nativeRuntimeApi as jest.Mocked<typeof nativeRuntimeApi>

const runtime: nativeRuntimeApi.NativeRuntimeSnapshot = {
  appPort: 3010,
  internalApiPort: 38080,
  postgresPort: 35432,
  workerProcessCount: 2,
  maxConcurrentJobsPerWorker: 3,
  enableHardwareAcceleration: false,
  dataDirectory: '',
  allowNetworkAccess: false,
  startOnLogin: false,
  autoDownloadUpdates: false,
}

describe('NativeDesktopSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.getNativeRuntime.mockResolvedValue(runtime)
    api.updateNativeRuntime.mockResolvedValue({
      restartRequired: false,
      config: runtime,
    })
  })

  it('shows the desktop options from the runtime snapshot', async () => {
    renderWithProviders(<NativeDesktopSection />)

    const startOnLogin = await screen.findByRole('checkbox', {
      name: /Start on login/,
    })
    expect(startOnLogin).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: /Download updates automatically/ })
    ).not.toBeChecked()
  })

  it('persists a toggle change through the native runtime endpoint', async () => {
    // This is the whole contract with the Electron host: the patch goes to the
    // loopback-only runtime endpoint, which applies it to the login item and the
    // updater - not to any backend setting.
    renderWithProviders(<NativeDesktopSection />)

    const startOnLogin = await screen.findByRole('checkbox', {
      name: /Start on login/,
    })
    await userEvent.click(startOnLogin)

    await waitFor(() => {
      // react-query v5 hands the mutation context as a second argument.
      expect(api.updateNativeRuntime).toHaveBeenCalledWith(
        { startOnLogin: true },
        expect.anything()
      )
    })
  })

  it('explains when the native host did not answer', async () => {
    api.getNativeRuntime.mockRejectedValue(new Error('Request failed (404)'))

    renderWithProviders(<NativeDesktopSection />)

    expect(
      await screen.findByText(/Desktop options are unavailable/)
    ).toBeInTheDocument()
  })
})
