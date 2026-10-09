import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { client } from '@/lib/apiBase'
import {
  type ContainerAdapter,
  type ContainerDto,
} from '@/shared/types/ContainerTypes'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ContainerVfxTab } from '../ContainerVfxTab'

const mockGet = client.get as jest.Mock

const effect = (
  id: number,
  name: string,
  thumbnailUrl: string | null = null
) => ({
  id,
  name,
  thumbnailUrl,
  description: null,
  duration: 1.5,
  componentCount: 2,
  componentTypes: ['particles', 'light'],
  updatedAt: '2026-10-01T00:00:00Z',
})

const container = {
  id: 7,
  name: 'Sample project',
  vfx: [{ id: 1, name: 'Spark burst' }],
  vfxCount: 1,
} as unknown as ContainerDto

describe('ContainerVfxTab', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockImplementation((url: string) =>
      url === '/vfx'
        ? Promise.resolve({
            data: [effect(1, 'Spark burst'), effect(2, 'Dust puff')],
          })
        : Promise.reject(new Error(`unexpected GET ${url}`))
    )
  })

  // Regression: the project's effect tiles stayed on the placeholder because the
  // member list carries no thumbnail - it has to be looked up in the library list.
  it('shows the library thumbnail for a member and keeps the placeholder for one without', async () => {
    mockGet.mockImplementation((url: string) =>
      url === '/vfx'
        ? Promise.resolve({
            data: [
              effect(1, 'Spark burst', '/vfx/1/thumbnail/file?v=abc'),
              effect(2, 'Dust puff'),
            ],
          })
        : Promise.reject(new Error(`unexpected GET ${url}`))
    )
    const twoMembers = {
      ...container,
      vfx: [
        { id: 1, name: 'Spark burst' },
        { id: 2, name: 'Dust puff' },
      ],
      vfxCount: 2,
    } as unknown as ContainerDto

    renderWithProviders(
      <ContainerVfxTab
        adapter={
          {
            type: 'project',
            containerId: 7,
            label: 'Project',
          } as ContainerAdapter
        }
        container={twoMembers}
        refetchContainer={jest.fn()}
        showToast={jest.fn()}
      />,
      { tabId: 'project-7' }
    )

    const image = await screen.findByTestId('vfx-tile-thumbnail')
    expect(image).toHaveAttribute(
      'src',
      expect.stringMatching(/\/vfx\/1\/thumbnail\/file\?v=abc$/)
    )
    // Only the first member has one; the second still shows the placeholder.
    expect(screen.getAllByTestId('vfx-tile-thumbnail')).toHaveLength(1)
  })

  // The picker must offer only effects the project does not already hold, and
  // the add must go through the project link and then refresh the project.
  it('adds a library effect the project does not hold yet', async () => {
    const addVfx = jest.fn().mockResolvedValue(undefined)
    const refetchContainer = jest.fn().mockResolvedValue(undefined)
    const adapter = {
      type: 'project',
      containerId: 7,
      label: 'Project',
      addVfx,
      removeVfx: jest.fn(),
    } as unknown as ContainerAdapter

    renderWithProviders(
      <ContainerVfxTab
        adapter={adapter}
        container={container}
        refetchContainer={refetchContainer}
        showToast={jest.fn()}
      />,
      { tabId: 'project-7' }
    )

    expect(screen.getByText('Spark burst')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Add Effect' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByText('Dust puff')).toBeVisible()
    )
    expect(within(dialog).queryByText('Spark burst')).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByText('Dust puff'))
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Add Selected (1)' })
    )

    await waitFor(() => expect(addVfx).toHaveBeenCalledWith(7, 2))
    await waitFor(() => expect(refetchContainer).toHaveBeenCalled())
  })
})
