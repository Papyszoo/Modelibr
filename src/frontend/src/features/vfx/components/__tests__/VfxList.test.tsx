import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import * as vfxApi from '../../api/vfxApi'
import { DEFAULT_VFX_DEFINITION } from '../../lib/vfxDefaults'
import { VfxList } from '../VfxList'

jest.mock('../../api/vfxApi')

const vfx = vfxApi as jest.Mocked<typeof vfxApi>

function summary(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Effect ${id}`,
    description: null,
    duration: 3,
    componentCount: 3,
    componentTypes: ['particles', 'light', 'sound'],
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function detail(id: number, name = 'New effect') {
  return {
    id,
    name,
    description: null,
    definition: DEFAULT_VFX_DEFINITION,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('VfxList', () => {
  let onOpenVfxEditorTab: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    onOpenVfxEditorTab = jest.fn()
    vfx.getVfxList.mockResolvedValue([summary(1), summary(2)] as never)
    vfx.createVfx.mockResolvedValue(detail(42) as never)
    vfx.deleteVfx.mockResolvedValue(undefined as never)
  })

  function renderList() {
    return renderWithProviders(<VfxList />, {
      tabId: 'vfxList',
      onOpenVfxEditorTab,
    })
  }

  it('renders one tile per effect with its duration and component types', async () => {
    renderList()

    expect(await screen.findByTestId('vfx-list')).toBeInTheDocument()
    expect(screen.getAllByTestId('vfx-tile')).toHaveLength(2)
    // Duration is formatted from the definition, not echoed from the fixture's
    // raw number - a tile that dropped it would leave the type icons alone.
    expect(screen.getAllByText('3.00 s')).toHaveLength(2)
    // The component types come from the summary and drive the icons.
    expect(screen.getAllByLabelText('Particles')).toHaveLength(2)
    expect(screen.getAllByLabelText('Light')).toHaveLength(2)
    expect(screen.getAllByLabelText('Sound')).toHaveLength(2)
  })

  // Regression: tiles showed the sparkles placeholder forever because nothing read
  // the thumbnail the worker renders. A rendered effect must show its picture, an
  // unrendered one must keep the placeholder, and a picture that fails to load
  // must fall back instead of leaving a broken-image icon.
  it('shows the animated thumbnail when rendered and the placeholder while pending', async () => {
    vfx.getVfxList.mockResolvedValue([
      summary(1, { thumbnailUrl: '/vfx/1/thumbnail/file?v=abc' }),
      summary(2, { thumbnailUrl: null }),
    ] as never)

    renderList()
    const tiles = await screen.findAllByTestId('vfx-tile')

    const image = within(tiles[0]).getByTestId('vfx-tile-thumbnail')
    expect(image).toHaveAttribute(
      'src',
      expect.stringMatching(/\/vfx\/1\/thumbnail\/file\?v=abc$/)
    )
    expect(
      within(tiles[1]).queryByTestId('vfx-tile-thumbnail')
    ).not.toBeInTheDocument()
    expect(tiles[1].querySelector('.pi-sparkles')).toBeInTheDocument()
  })

  it('falls back to the placeholder when the thumbnail cannot be loaded', async () => {
    vfx.getVfxList.mockResolvedValue([
      summary(1, { thumbnailUrl: '/vfx/1/thumbnail/file?v=abc' }),
    ] as never)

    renderList()
    const tile = (await screen.findAllByTestId('vfx-tile'))[0]

    fireEvent.error(within(tile).getByTestId('vfx-tile-thumbnail'))

    expect(
      within(tile).queryByTestId('vfx-tile-thumbnail')
    ).not.toBeInTheDocument()
    expect(tile.querySelector('.pi-sparkles')).toBeInTheDocument()
  })

  it('shows the empty state when there are no effects', async () => {
    vfx.getVfxList.mockResolvedValue([] as never)

    renderList()

    expect(
      await screen.findByText('No effects yet. Create one to start.')
    ).toBeInTheDocument()
  })

  it('creates an effect from the defaults and opens its editor tab', async () => {
    renderList()
    await screen.findByTestId('vfx-list')

    await userEvent.click(screen.getByTestId('vfx-create'))

    await waitFor(() =>
      expect(vfx.createVfx).toHaveBeenCalledWith(
        {
          name: 'New effect',
          definition: DEFAULT_VFX_DEFINITION,
        },
        expect.anything()
      )
    )
    // The tab is opened with the created id as a string, and its name.
    await waitFor(() =>
      expect(onOpenVfxEditorTab).toHaveBeenCalledWith('42', 'New effect')
    )
  })

  it('opens an existing effect when its tile is clicked', async () => {
    renderList()
    await screen.findByTestId('vfx-list')

    await userEvent.click(screen.getAllByTestId('vfx-tile')[0])

    expect(onOpenVfxEditorTab).toHaveBeenCalledWith('1', 'Effect 1')
  })

  it('asks before deleting and only removes on confirm', async () => {
    renderList()
    await screen.findByTestId('vfx-list')

    fireEvent.contextMenu(screen.getAllByTestId('vfx-tile')[0])
    // The dialog opens, but nothing is deleted until the user says so.
    expect(vfx.deleteVfx).not.toHaveBeenCalled()

    await userEvent.click(await screen.findByTestId('vfx-delete'))

    await waitFor(() =>
      expect(vfx.deleteVfx).toHaveBeenCalledWith(1, expect.anything())
    )
  })
})
