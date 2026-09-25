import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as projectStudioApi from '@/features/project/api/projectStudioApi'
import * as projectStudioQueries from '@/features/project/api/projectStudioQueries'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectStudioSection } from '../ProjectStudioSection'

jest.mock('@/features/project/api/projectStudioApi')
jest.mock('@/features/project/api/projectStudioQueries')

const api = projectStudioApi as jest.Mocked<typeof projectStudioApi>
const queries = projectStudioQueries as jest.Mocked<typeof projectStudioQueries>

const query = <T,>(data: T) => ({
  data,
  error: null,
  isLoading: false,
  refetch: jest.fn(),
})

describe('ProjectStudioSection flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queries.useProjectLevelsQuery.mockReturnValue(
      query([{ id: 3, name: 'Forest Crossing' }]) as never
    )
    queries.useProjectCharactersQuery.mockReturnValue(query([]) as never)
    queries.useProductionNotesQuery.mockReturnValue(query([]) as never)
    queries.useProjectReferencesQuery.mockReturnValue(
      query([{ id: 9, title: 'Misty forest', fileName: 'forest.png' }]) as never
    )
    api.createProjectLevel.mockResolvedValue({ id: 4 } as never)
    api.createProductionNote.mockResolvedValue({ id: 5 } as never)
  })

  it('creates a level and a reference-targeted pinned idea', async () => {
    const onChanged = jest.fn()
    renderWithProviders(
      <ProjectStudioSection projectId={7} onChanged={onChanged} />
    )

    expect(screen.getByText('Forest Crossing')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Add level' }))
    await userEvent.type(screen.getByLabelText('New level'), 'Ruined Keep')
    await userEvent.click(screen.getByRole('button', { name: 'Create level' }))
    await waitFor(() =>
      expect(api.createProjectLevel).toHaveBeenCalledWith(7, {
        name: 'Ruined Keep',
        productionStatus: 'planned',
      })
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await userEvent.type(screen.getByLabelText('New note or idea'), 'Fog idea')
    await userEvent.type(
      screen.getByLabelText('Note body'),
      'Keep the horizon unreadable.'
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Note target'),
      'reference:9'
    )
    await userEvent.click(screen.getByLabelText('Pin as idea'))
    await userEvent.click(screen.getByRole('button', { name: 'Create note' }))

    await waitFor(() =>
      expect(api.createProductionNote).toHaveBeenCalledWith(7, {
        title: 'Fog idea',
        body: 'Keep the horizon unreadable.',
        isPinned: true,
        referenceImageId: 9,
      })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})
