import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import * as projectStudioQueries from '@/features/project/api/projectStudioQueries'
import type { SceneDocument, SceneSummary } from '@/features/scenes/types'
import { client } from '@/lib/apiBase'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectLevelAssetsSection } from '../ProjectLevelAssetsSection'

jest.mock('@/features/project/api/projectStudioQueries')

const queries = projectStudioQueries as jest.Mocked<typeof projectStudioQueries>
const mockedClient = client as jest.Mocked<typeof client>

const PROJECT_ID = 7

const levels = [
  {
    id: 3,
    projectId: PROJECT_ID,
    name: 'Forest Crossing',
    description: null,
    productionStatus: 'in_progress' as const,
    sortOrder: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 4,
    projectId: PROJECT_ID,
    name: 'Ruined Keep',
    description: null,
    productionStatus: 'planned' as const,
    sortOrder: 1,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 5,
    projectId: PROJECT_ID,
    name: 'Sunset Pass',
    description: null,
    productionStatus: 'planned' as const,
    sortOrder: 2,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
]

type LevelScopedSummary = SceneSummary & {
  projectLevelId?: number | null
  isPrimaryLevelScene?: boolean
}

/**
 * Three scenes of one level, one of a second level, and one belonging to a
 * different project while pointing at this project's level id - a level id is
 * only unique inside its project, so that last one is the case a level-only
 * filter gets wrong.
 */
const scenes: LevelScopedSummary[] = [
  summary(21, 'Crossing Layout', PROJECT_ID, 3, true),
  summary(22, 'Crossing Detail', PROJECT_ID, 3, false),
  summary(23, 'Keep Approach', PROJECT_ID, 4, true),
  summary(24, 'Harbour Layout', 9, 3, true),
]

function summary(
  id: number,
  name: string,
  projectId: number,
  projectLevelId: number,
  isPrimaryLevelScene: boolean
): LevelScopedSummary {
  return {
    id,
    name,
    description: null,
    schemaVersion: 1,
    revision: 1,
    nodeCount: 1,
    lightCount: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    stage: null,
    projectId,
    projectName: projectId === PROJECT_ID ? 'Nightfall' : 'Other',
    projectLevelId,
    projectLevelName: projectLevelId === 3 ? 'Forest Crossing' : 'Ruined Keep',
    isPrimaryLevelScene,
  }
}

function node(
  id: string,
  assetType: 'Model' | 'Sprite',
  assetId: number,
  name: string
) {
  return {
    id,
    name,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    asset: { assetType, assetId },
    visible: true,
  }
}

const documents: Record<number, SceneDocument> = {
  21: {
    schemaVersion: 1,
    nodes: [
      node('deck', 'Model', 1, 'Rope Bridge Deck'),
      node('sign', 'Sprite', 5, 'Crossing Sign'),
    ],
    lights: [],
  },
  22: {
    schemaVersion: 1,
    nodes: [node('deck-again', 'Model', 1, 'Rope Bridge Deck')],
    lights: [],
  },
  23: {
    schemaVersion: 1,
    nodes: [node('gate', 'Model', 77, 'Keep Gate')],
    lights: [],
  },
  24: {
    schemaVersion: 1,
    nodes: [node('crane', 'Model', 99, 'Harbour Crane')],
    lights: [],
  },
}

const members = [
  {
    id: '1',
    name: 'Rope Bridge Deck',
    files: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
]

const query = <T,>(data: T) => ({
  data,
  error: null,
  isLoading: false,
  refetch: jest.fn(),
})

function mockScenes() {
  mockedClient.get.mockImplementation((url: string) => {
    if (url === '/scenes') {
      return Promise.resolve({ data: { scenes } } as never)
    }
    const detail = /^\/scenes\/(\d+)$/.exec(url)
    if (detail) {
      const sceneId = Number(detail[1])
      return Promise.resolve({
        data: {
          scene: scenes.find(candidate => candidate.id === sceneId),
          document: documents[sceneId],
          nodes: [],
          overlaps: [],
          scaleWarnings: [],
        },
      } as never)
    }
    throw new Error(`Unmocked request: ${url}`)
  })
}

function renderSection() {
  return renderWithProviders(
    <ProjectLevelAssetsSection projectId={PROJECT_ID} />
  )
}

async function sceneGroup() {
  return screen.findByTestId('level-assets-scene-group')
}

function assetRow(key: string) {
  return document.querySelector(
    `[data-testid="level-assets-row"][data-asset-key="${key}"]`
  )
}

describe('ProjectLevelAssetsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    queries.useProjectLevelsQuery.mockReturnValue(query(levels) as never)
    queries.useProjectMemberModelsQuery.mockReturnValue(query(members) as never)
    mockScenes()
  })

  // A level's asset list that repeated an asset per scene, or hid which scene
  // placed it, cannot answer "where is this used?" - which is the only reason
  // this view exists.
  it('lists an asset once and names every scene that places it', async () => {
    renderSection()

    const row = await waitFor(() => {
      const found = assetRow('Model:1')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })

    expect(
      screen
        .getAllByTestId('level-assets-row')
        .filter(element => element.getAttribute('data-asset-key') === 'Model:1')
    ).toHaveLength(1)
    expect(within(row).getByText('Rope Bridge Deck')).toBeVisible()
    expect(
      within(row)
        .getAllByTestId('level-assets-scene')
        .map(chip => chip.getAttribute('data-scene-name'))
    ).toEqual(['Crossing Layout', 'Crossing Detail'])
  })

  // The same model in a second scene of the same level is one row with two
  // scenes; a different family in one scene is its own row naming only that
  // scene. A view that flattened placements into rows would double the first and
  // lose the second distinction.
  it('keeps each placement of a different asset in its own row', async () => {
    renderSection()

    await waitFor(() => expect(assetRow('Sprite:5')).not.toBeNull())

    const sign = assetRow('Sprite:5') as HTMLElement
    expect(
      within(sign)
        .getAllByTestId('level-assets-scene')
        .map(chip => chip.getAttribute('data-scene-name'))
    ).toEqual(['Crossing Layout'])
  })

  // Level ids are unique per project and scenes outlive the level they were
  // filed under, so reading the wrong scenes here would show a user assets from
  // a level they are not looking at - and could show two projects' assets as one
  // level's.
  it('leaves out what scenes outside this level place', async () => {
    renderSection()

    const group = await sceneGroup()
    await waitFor(() => expect(assetRow('Model:1')).not.toBeNull())

    expect(assetRow('Model:77')).toBeNull()
    expect(assetRow('Model:99')).toBeNull()
    expect(
      within(group)
        .getAllByTestId('level-assets-scene')
        .map(chip => chip.getAttribute('data-scene-name'))
    ).not.toContain('Keep Approach')
    expect(within(group).queryByText('Harbour Layout')).not.toBeInTheDocument()
  })

  // The two relationships are different facts: a model added to the project is
  // a member whether or not a scene places it. Merged into one list, a user
  // could no longer tell which is which.
  it('lists project members in their own group, apart from placed assets', async () => {
    renderSection()

    await waitFor(() => expect(assetRow('Model:1')).not.toBeNull())
    const memberGroup = screen.getByTestId('level-assets-member-group')

    expect(
      within(memberGroup).getByTestId('level-assets-member-row')
    ).toHaveTextContent('Rope Bridge Deck')
    expect(
      within(screen.getByTestId('level-assets-scene-group')).getAllByTestId(
        'level-assets-row'
      )
    ).toHaveLength(2)
  })

  // A level nobody has built yet is the ordinary first state of a project, so it
  // has to read as what to do next rather than as something missing.
  it('reads a level with no scenes as an instruction, not a failure', async () => {
    renderSection()

    await waitFor(() => expect(assetRow('Model:1')).not.toBeNull())
    await userEvent.selectOptions(
      screen.getByLabelText('Level for assets'),
      'Sunset Pass'
    )

    const group = await sceneGroup()
    expect(
      within(group).getByText('No scene linked to this level')
    ).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // The member group is unaffected: it is a different relationship, and it
    // must not disappear because this level has no scenes yet.
    expect(
      within(screen.getByTestId('level-assets-member-group')).getByTestId(
        'level-assets-member-row'
      )
    ).toBeVisible()
  })
})
