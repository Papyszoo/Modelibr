import { screen, waitFor } from '@testing-library/react'
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

const baseCharacter: projectStudioApi.ProjectCharacterDto = {
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

/**
 * The stand-in server. Mutating the fixture in the mock is what lets a test
 * assert the row after the save, instead of only that a call was made.
 */
let character: projectStudioApi.ProjectCharacterDto

function renderSection() {
  return renderWithProviders(
    <>
      <ConfirmDialog />
      <ProjectCharactersSection projectId={7} />
    </>
  )
}

async function openAbilities() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Edit Ashen Warden' })
  )
  await userEvent.click(screen.getByRole('tab', { name: 'Abilities' }))
}

describe('ProjectCharactersSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    character = { ...baseCharacter }
    queries.useProjectCharactersQuery.mockImplementation(
      () => query([character]) as never
    )
    queries.useProjectLevelsQuery.mockReturnValue(
      query([{ id: 5, name: 'Forest Crossing' }]) as never
    )
    queries.useProductionNotesQuery.mockReturnValue(query([]) as never)
    // The linked-model picker reads the project's explicit members.
    queries.useProjectMemberModelsQuery.mockReturnValue(query([]) as never)
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
    await userEvent.click(screen.getByRole('button', { name: 'Save ability' }))

    expect(api.addCharacterAbility).toHaveBeenCalledWith(7, 3, {
      name: 'Ember lash',
      description: '',
    })
  })

  // The studio read as "add and remove only" because an existing ability had no
  // way to change - the save has to reach the update route and the row has to
  // show the new values with the section still open.
  it('edits an existing ability in place and leaves the section open', async () => {
    character = {
      ...baseCharacter,
      abilityCount: 1,
      abilities: [
        {
          id: 12,
          name: 'Ember lash',
          description: 'Scorches on hit',
          sortOrder: 0,
        },
      ],
    }
    api.updateCharacterAbility.mockImplementation(
      async (_projectId, _characterId, abilityId, body) => {
        const ability = character.abilities.find(item => item.id === abilityId)
        if (ability) Object.assign(ability, body)
        return ability!
      }
    )

    const { rerender } = renderSection()
    await openAbilities()

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit ability Ember lash' })
    )

    const name = screen.getByLabelText('Edit ability name for Ashen Warden')
    const description = screen.getByLabelText(
      'Edit ability description for Ashen Warden'
    )
    // Pre-filled from the stored record, or the edit would silently blank it.
    expect(name).toHaveValue('Ember lash')
    expect(description).toHaveValue('Scorches on hit')

    await userEvent.clear(name)
    await userEvent.type(name, 'Ember burn')
    await userEvent.clear(description)
    await userEvent.type(description, 'Ignites the ground')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save ability changes' })
    )

    await waitFor(() => {
      expect(api.updateCharacterAbility).toHaveBeenCalledWith(7, 3, 12, {
        name: 'Ember burn',
        description: 'Ignites the ground',
      })
    })

    rerender(
      <>
        <ConfirmDialog />
        <ProjectCharactersSection projectId={7} />
      </>
    )

    expect(screen.getByTestId('project-character-ability')).toHaveAttribute(
      'data-name',
      'Ember burn'
    )
    expect(screen.getByText('Ignites the ground')).toBeVisible()
    // Still on the abilities section - saving a row must not close the editor.
    expect(screen.getByRole('tab', { name: 'Abilities' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  it('discards a typed ability name when the inline edit is cancelled', async () => {
    character = {
      ...baseCharacter,
      abilityCount: 1,
      abilities: [
        { id: 12, name: 'Ember lash', description: null, sortOrder: 0 },
      ],
    }

    renderSection()
    await openAbilities()

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit ability Ember lash' })
    )
    await userEvent.clear(
      screen.getByLabelText('Edit ability name for Ashen Warden')
    )
    await userEvent.type(
      screen.getByLabelText('Edit ability name for Ashen Warden'),
      'Ember burn'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancel ability edit' })
    )

    expect(api.updateCharacterAbility).not.toHaveBeenCalled()
    expect(screen.getByTestId('project-character-ability')).toHaveAttribute(
      'data-name',
      'Ember lash'
    )
  })

  // A variant edit that dropped the level would silently detach it from the
  // level it was written for, so the untouched level has to be resubmitted.
  it('edits a variant name without dropping its level', async () => {
    character = {
      ...baseCharacter,
      variantCount: 1,
      variants: [
        {
          id: 21,
          name: 'Frozen',
          description: 'Ice shell',
          projectLevelId: 5,
          projectLevelName: 'Forest Crossing',
          sortOrder: 0,
        },
      ],
    }
    api.updateCharacterVariant.mockImplementation(
      async (_projectId, _characterId, variantId, body) => {
        const variant = character.variants.find(item => item.id === variantId)
        if (variant) Object.assign(variant, body)
        return variant!
      }
    )

    const { rerender } = renderSection()
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Ashen Warden' })
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Variants' }))

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit variant Frozen' })
    )

    const name = screen.getByLabelText('Edit variant name for Ashen Warden')
    expect(name).toHaveValue('Frozen')
    expect(
      screen.getByLabelText('Edit variant level for Ashen Warden')
    ).toHaveValue('5')

    await userEvent.clear(name)
    await userEvent.type(name, 'Frozen Warden')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save variant changes' })
    )

    await waitFor(() => {
      expect(api.updateCharacterVariant).toHaveBeenCalledWith(7, 3, 21, {
        name: 'Frozen Warden',
        description: 'Ice shell',
        projectLevelId: 5,
      })
    })

    rerender(
      <>
        <ConfirmDialog />
        <ProjectCharactersSection projectId={7} />
      </>
    )

    const row = screen.getByTestId('project-character-variant')
    expect(row).toHaveAttribute('data-name', 'Frozen Warden')
    // The level name rides along in the row, so it proves the link survived.
    expect(row).toHaveTextContent('Forest Crossing')
  })

  it('edits an image title and caption without touching the file', async () => {
    character = {
      ...baseCharacter,
      imageCount: 1,
      images: [
        {
          id: 31,
          fileId: 210,
          fileName: 'warden-front.png',
          title: 'Front view',
          caption: 'Silhouette read',
          previewUrl: '/files/210/preview?channel=rgb',
          fileUrl: '/files/210',
          sortOrder: 0,
        },
      ],
    }
    api.updateProjectCharacterImage.mockImplementation(
      async (_projectId, _characterId, imageId, body) => {
        const image = character.images.find(item => item.id === imageId)
        if (image) Object.assign(image, body)
        return image!
      }
    )

    const { rerender } = renderSection()
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Ashen Warden' })
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Media' }))

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit details for Front view' })
    )
    const title = screen.getByLabelText('Image title for Ashen Warden')
    expect(title).toHaveValue('Front view')
    await userEvent.clear(title)
    await userEvent.type(title, 'Front turn')
    await userEvent.clear(
      screen.getByLabelText('Image caption for Ashen Warden')
    )
    await userEvent.type(
      screen.getByLabelText('Image caption for Ashen Warden'),
      'Weight on the left'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Save image details' })
    )

    await waitFor(() => {
      expect(api.updateProjectCharacterImage).toHaveBeenCalledWith(7, 3, 31, {
        title: 'Front turn',
        caption: 'Weight on the left',
      })
    })

    rerender(
      <>
        <ConfirmDialog />
        <ProjectCharactersSection projectId={7} />
      </>
    )

    expect(screen.getByText('Front turn')).toBeVisible()
  })

  it('edits a linked model label in place', async () => {
    character = {
      ...baseCharacter,
      modelCount: 1,
      models: [
        {
          id: 41,
          modelId: 7,
          modelName: 'warden.fbx',
          label: 'Hero rig',
          sortOrder: 0,
        },
      ],
    }
    api.updateProjectCharacterModel.mockResolvedValue({
      ...character.models[0],
      label: 'Boss rig',
    })

    renderSection()
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit Ashen Warden' })
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Media' }))

    await userEvent.click(
      screen.getByRole('button', { name: 'Edit label for warden.fbx' })
    )
    const label = screen.getByLabelText('Model label for Ashen Warden')
    expect(label).toHaveValue('Hero rig')
    await userEvent.clear(label)
    await userEvent.type(label, 'Boss rig')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save model label' })
    )

    expect(api.updateProjectCharacterModel).toHaveBeenCalledWith(7, 3, 41, {
      label: 'Boss rig',
    })
  })
})
