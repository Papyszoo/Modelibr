import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from 'primereact/confirmdialog'

import * as projectApi from '@/features/project/api/projectApi'
import { ProjectList } from '@/features/project/components/ProjectList'
import { renderWithProviders } from '@/test/renderWithProviders'
import { type ProjectDto } from '@/types'

jest.mock('@/features/project/api/projectApi')
jest.mock('@/hooks/useTabContext', () => ({
  useTabContext: () => ({
    openProjectDetailsTab: jest.fn(),
  }),
}))

const api = projectApi as jest.Mocked<typeof projectApi>

function project(overrides: Partial<ProjectDto> = {}): ProjectDto {
  return {
    id: 7,
    name: 'Lantern Harbor',
    description: 'A safe place to test deletion',
    notes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    modelCount: 0,
    globalMaterialCount: 0,
    multiModelTextureCount: 0,
    spriteCount: 0,
    soundCount: 0,
    scriptCount: 0,
    environmentMapCount: 0,
    isEmpty: true,
    customThumbnailUrl: null,
    conceptImageCount: 0,
    models: [],
    textureSets: [],
    sprites: [],
    environmentMaps: [],
    ...overrides,
  }
}

function renderList() {
  return renderWithProviders(
    <>
      <ProjectList />
      <ConfirmDialog />
    </>
  )
}

describe('ProjectList load and deletion states', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    api.getAllProjects.mockResolvedValue([])
    api.deleteProject.mockResolvedValue()
  })

  it('shows a genuine empty state only after a successful empty response', async () => {
    renderList()

    expect(await screen.findByText('No matching projects')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a failed list request and recovers when Retry succeeds', async () => {
    // Falling back to the empty card would tell the user their library is empty
    // when the local API actually failed.
    api.getAllProjects
      .mockRejectedValueOnce(new Error('Project API is unavailable'))
      .mockResolvedValueOnce([project()])

    renderList()

    expect(await screen.findByText('Project API is unavailable')).toBeVisible()
    expect(screen.queryByText('No matching projects')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Lantern Harbor')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('cancels a keyboard-opened delete confirmation without a request', async () => {
    api.getAllProjects.mockResolvedValue([project()])
    renderList()

    const actions = await screen.findByRole('button', {
      name: 'Project actions for Lantern Harbor',
    })
    actions.focus()
    await userEvent.keyboard('{Enter}')

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Lantern Harbor')
    expect(dialog).toHaveTextContent('Assets in the project will remain')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(api.deleteProject).not.toHaveBeenCalled())
    expect(
      screen.getByRole('heading', { name: 'Lantern Harbor' })
    ).toBeVisible()
  })

  it('deletes only after the named Project is explicitly confirmed', async () => {
    api.getAllProjects.mockResolvedValue([project()])
    renderList()

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Project actions for Lantern Harbor',
      })
    )
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Lantern Harbor'
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Delete Project' })
    )

    await waitFor(() => expect(api.deleteProject).toHaveBeenCalledWith(7))
  })
})
