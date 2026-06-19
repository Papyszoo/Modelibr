import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import { RecycledFilesList } from '../RecycledFilesList'

const mockGet = client.get as jest.Mock
const mockPost = client.post as jest.Mock

const emptyBin = {
  models: [],
  modelVersions: [],
  files: [],
  textureSets: [],
  textures: [],
  sprites: [],
  sounds: [],
  scripts: [],
  environmentMaps: [],
  environmentMapVariants: [],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockPost.mockResolvedValue({ data: {} })
})

describe('RecycledFilesList — scripts in the bin', () => {
  // Regression: recycled scripts were returned by the API but the bin UI had no
  // Scripts section, so they were invisible and unrecoverable. This drives the
  // real component against the recycled endpoint and the restore endpoint.
  it('renders a recycled script and restores it via the script endpoint', async () => {
    mockGet.mockResolvedValue({
      data: {
        ...emptyBin,
        scripts: [
          {
            id: 7,
            name: 'player_controller',
            fileId: 99,
            language: 'lua',
            deletedAt: '2026-06-18T00:00:00Z',
          },
        ],
      },
    })

    renderWithProviders(<RecycledFilesList />)

    // The script appears under a dedicated Scripts section.
    expect(await screen.findByText('player_controller')).toBeInTheDocument()
    const section = document.querySelector(
      '[data-section="scripts"]'
    ) as HTMLElement
    expect(section).not.toBeNull()
    expect(within(section).getByText(/Scripts \(1\)/)).toBeInTheDocument()

    // Restore (the success button) calls POST /recycled/script/7/restore.
    const restoreBtn = section.querySelector('.p-button-success') as HTMLElement
    await userEvent.click(restoreBtn)

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/recycled/script/7/restore')
    )
  })
})
