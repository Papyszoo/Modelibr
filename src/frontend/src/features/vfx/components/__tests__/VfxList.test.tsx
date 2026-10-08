import { fireEvent, screen, waitFor } from '@testing-library/react'
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
