import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from 'primereact/confirmdialog'

import * as packApi from '@/features/pack/api/packApi'
import { PackList } from '@/features/pack/components/PackList'
import { renderWithProviders } from '@/test/renderWithProviders'
import { type PackDto } from '@/types'

jest.mock('@/features/pack/api/packApi')
jest.mock('@/hooks/useTabContext', () => ({
  useTabContext: () => ({
    openPackDetailsTab: jest.fn(),
  }),
}))

const api = packApi as jest.Mocked<typeof packApi>

function pack(overrides: Partial<PackDto> = {}): PackDto {
  return {
    id: 3,
    name: 'Forest Kit',
    description: 'Trees and rocks',
    licenseType: 'CC0',
    url: null,
    customThumbnailUrl: null,
    modelCount: 0,
    globalMaterialCount: 0,
    multiModelTextureCount: 0,
    spriteCount: 0,
    soundCount: 0,
    environmentMapCount: 0,
    ...overrides,
  } as PackDto
}

function renderList() {
  return renderWithProviders(
    <>
      <PackList />
      <ConfirmDialog />
    </>
  )
}

describe('PackList card actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.getAllPacks.mockResolvedValue([pack()])
    api.deletePack.mockResolvedValue()
  })

  // Regression: the card's trash button deleted a pack on a single click, with
  // no confirmation and no right-click menu.
  it('right-click opens the shared menu instead of deleting', async () => {
    renderList()
    const card = await screen.findByText('Forest Kit')

    fireEvent.contextMenu(card)

    expect(await screen.findByText('Open')).toBeInTheDocument()
    expect(api.deletePack).not.toHaveBeenCalled()
  })

  it('deletes only after the named pack is confirmed', async () => {
    renderList()
    const card = await screen.findByText('Forest Kit')

    fireEvent.contextMenu(card)
    await userEvent.click(await screen.findByText('Delete'))

    expect(await screen.findByRole('dialog')).toHaveTextContent('Forest Kit')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Pack' }))

    await waitFor(() => expect(api.deletePack).toHaveBeenCalledWith(3))
  })
})
