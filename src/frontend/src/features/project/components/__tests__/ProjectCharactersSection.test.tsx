import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from 'primereact/confirmdialog'

import * as projectStudioApi from '@/features/project/api/projectStudioApi'
import * as projectStudioQueries from '@/features/project/api/projectStudioQueries'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectCharactersSection } from '../ProjectCharactersSection'

jest.mock('@/features/project/api/projectStudioApi')
jest.mock('@/features/project/api/projectStudioQueries')
jest.mock('@/features/project/api/projectApi', () => ({
  getModelsByProject: jest.fn().mockResolvedValue([]),
}))
jest.mock('@/features/models/api/modelApi', () => ({
  uploadFile: jest.fn(),
}))

const api = projectStudioApi as jest.Mocked<typeof projectStudioApi>
const queries = projectStudioQueries as jest.Mocked<typeof projectStudioQueries>

const query = <T,>(data: T) => ({
  data,
  error: null,
  isLoading: false,
  refetch: jest.fn(),
})

const character: projectStudioApi.ProjectCharacterDto = {
  id: 3,
  projectId: 7,
  name: 'Ashen Warden',
  description: 'A firebound guardian.',
  tags: ['enemy', 'boss'],
  images: [],
  models: [],
  abilities: [],
  variants: [],
  imageCount: 0,
  modelCount: 0,
  abilityCount: 0,
  variantCount: 0,
  createdAt: '2026-09-25T00:00:00Z',
  updatedAt: '2026-09-25T00:00:00Z',
}

function renderSection() {
  return renderWithProviders(
    <>
      <ConfirmDialog />
      <ProjectCharactersSection projectId={7} />
    </>
  )
}

describe('ProjectCharactersSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queries.useProjectCharactersQuery.mockReturnValue(
      query([character]) as never
    )
    queries.useProjectLevelsQuery.mockReturnValue(
      query([{ id: 5, name: 'Forest Crossing' }]) as never
    )
    queries.useProductionNotesQuery.mockReturnValue(query([]) as never)
    api.createProjectCharacter.mockResolvedValue(character)
    api.updateProjectCharacter.mockResolvedValue(character)
    api.addCharacterAbility.mockResolvedValue({
      id: 1,
      name: 'Ember lash',
      description: null,
      sortOrder: 0,
    })
  })

  it('keeps the collapsed card summary-first and uses a contextual enemy tab', async () => {
    renderSection()

    expect(screen.getByText('Ashen Warden')).toBeVisible()
    expect(screen.getByText('A firebound guardian.')).toBeVisible()
    expect(screen.getByText('enemy')).toBeVisible()
    expect(screen.getByText('0 abilities')).toBeVisible()

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Ashen Warden' })
    )

    // Identity is the only editor open by default; the rest stay behind tabs.
    expect(screen.getByLabelText('Character name')).toBeVisible()
    expect(
      screen.queryByLabelText('New ability for Ashen Warden')
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Enemy notes' }))
    expect(screen.getByText('Enemy notes and weaknesses')).toBeVisible()
  })

  it('creates a character with parsed tags from a compact form', async () => {
    renderSection()

    await userEvent.click(screen.getByRole('button', { name: 'Add character' }))
    await userEvent.type(screen.getByLabelText('Character name'), 'Mira')
    await userEvent.type(
      screen.getByLabelText('Character tags'),
      'player, hero, hero'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Create character' })
    )

    expect(api.createProjectCharacter).toHaveBeenCalledWith(7, {
      name: 'Mira',
      description: '',
      tags: ['player', 'hero'],
    })
  })

  it('adds an ability from behind a plus action', async () => {
    renderSection()

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Ashen Warden' })
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Abilities' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Add ability to Ashen Warden' })
    )
    await userEvent.type(
      screen.getByLabelText('New ability for Ashen Warden'),
      'Ember lash'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add ability' }))

    expect(api.addCharacterAbility).toHaveBeenCalledWith(7, 3, {
      name: 'Ember lash',
      description: '',
    })
  })
})
