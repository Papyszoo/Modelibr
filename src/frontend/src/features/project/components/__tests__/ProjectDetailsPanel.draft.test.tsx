import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import * as modelApi from '@/features/models/api/modelApi'
import * as projectApi from '@/features/project/api/projectApi'
import * as projectStudioQueries from '@/features/project/api/projectStudioQueries'
import { ProjectDetailsPanel } from '@/features/project/components/ProjectDetailsPanel'
import * as sceneQueries from '@/features/scenes/api/queries'
import {
  createTab,
  getWindowId,
  useNavigationStore,
} from '@/stores/navigationStore'
import { renderWithProviders } from '@/test/renderWithProviders'
import { type ProjectBriefDto, type ProjectDetailDto } from '@/types'

jest.mock('@/features/models/api/modelApi')
jest.mock('@/features/project/api/projectApi')
jest.mock('@/features/project/api/projectStudioQueries')
// Only the scene LIST is stubbed: the level asset view reads documents through
// the editor's own query options, which stay real.
jest.mock('@/features/scenes/api/queries', () => ({
  ...jest.requireActual('@/features/scenes/api/queries'),
  useScenesQuery: jest.fn(),
}))

const projectApiMock = projectApi as jest.Mocked<typeof projectApi>
const modelApiMock = modelApi as jest.Mocked<typeof modelApi>
const studioQueriesMock = projectStudioQueries as jest.Mocked<
  typeof projectStudioQueries
>
const sceneQueriesMock = sceneQueries as jest.Mocked<typeof sceneQueries>

const emptyQuery = <T,>(data: T) => ({
  data,
  error: null,
  isLoading: false,
  isFetching: false,
  refetch: jest.fn(),
})

function project(): ProjectDetailDto {
  return {
    id: 9,
    name: 'Draft Meridian',
    description: 'Original description',
    notes: 'Original notes',
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
    conceptImages: [],
    models: [],
    textureSets: [],
    sprites: [],
    environmentMaps: [],
  }
}

function brief(): ProjectBriefDto {
  return {
    id: 9,
    name: 'Draft Meridian',
    description: 'Original description',
    notes: 'Original notes',
    engines: [],
    platforms: [],
    genres: [],
    styles: [],
    perspectives: [],
    budget: {
      maxTrianglesPerAsset: null,
      maxTextureSize: null,
      targetSceneTriangles: null,
      pixelsPerUnit: null,
    },
    budgetSuggestion: null,
    worldConvention: {
      unitsPerMetre: 1,
      upAxis: 'Y',
      handedness: 'right',
      isDefault: true,
      engineConversions: [],
      conflicts: [],
    },
    styleSignals: {
      maxTriangles: null,
      maxTextureSize: null,
      maxMaterials: null,
      preferredUvStatus: null,
      boostTokens: [],
      penaltyTokens: [],
      familyHint: null,
      unmappedStyles: [],
    },
    paletteHex: [],
    conceptImages: [],
    environmentMaps: [],
    scenes: [],
    assetCounts: {
      models: 0,
      textureSets: 0,
      sprites: 0,
      sounds: 0,
      scripts: 0,
      environmentMaps: 0,
      scenes: 0,
    },
    guidance: [],
  }
}

describe('ProjectDetailsPanel draft ownership', () => {
  const tabId = 'project-9'
  let windowId: string

  beforeEach(() => {
    jest.clearAllMocks()
    windowId = getWindowId()
    const tab = createTab('projectViewer', '9', 'Draft Meridian')
    useNavigationStore.setState({
      activeWindows: {
        [windowId]: {
          tabs: [tab],
          activeTabId: tab.id,
          activeRightTabId: null,
          splitterSize: 50,
          lastActiveAt: new Date().toISOString(),
        },
      },
      recentlyClosedTabs: [],
      recentlyClosedWindows: [],
    })

    projectApiMock.getProjectProfileOptions.mockResolvedValue([])
    projectApiMock.getProjectBrief.mockResolvedValue(brief())
    projectApiMock.updateProject.mockResolvedValue()
    projectApiMock.addProjectConceptImage.mockResolvedValue()
    projectApiMock.setProjectProfile.mockResolvedValue(brief())
    modelApiMock.uploadFile.mockResolvedValue({ fileId: 42 } as never)
    // The Project studio (levels, characters, references) renders inside this
    // panel; it is exercised by its own suites, so stub the queries here.
    studioQueriesMock.useProjectLevelsQuery.mockReturnValue(
      emptyQuery([]) as never
    )
    studioQueriesMock.useProjectCharactersQuery.mockReturnValue(
      emptyQuery([]) as never
    )
    studioQueriesMock.useProjectReferencesQuery.mockReturnValue(
      emptyQuery([]) as never
    )
    studioQueriesMock.useProjectCommentsQuery.mockReturnValue(
      emptyQuery([]) as never
    )
    // The studio's level asset view reads the project's explicit members and
    // the scene list; neither is what this file is about.
    studioQueriesMock.useProjectMemberModelsQuery.mockReturnValue(
      emptyQuery([]) as never
    )
    sceneQueriesMock.useScenesQuery.mockReturnValue(emptyQuery([]) as never)
  })

  afterEach(() => {
    act(() => {
      useNavigationStore.setState({ activeWindows: {}, recentlyClosedTabs: [] })
    })
  })

  it('preserves Overview edits made while a save request is in flight', async () => {
    let resolveUpdate!: () => void
    const updatePromise = new Promise<void>(resolve => {
      resolveUpdate = resolve
    })
    projectApiMock.updateProject.mockReturnValue(updatePromise)

    renderWithProviders(
      <ProjectDetailsPanel
        project={project()}
        tabId={tabId}
        refetchContainer={async () => undefined}
        showToast={jest.fn()}
      />
    )

    const description = screen.getByLabelText('Description')
    await userEvent.clear(description)
    await userEvent.type(description, 'Submitted description')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(projectApiMock.updateProject).toHaveBeenCalled())

    const notes = screen.getByLabelText('Notes')
    await userEvent.clear(notes)
    await userEvent.type(notes, 'Typed while saving')

    await act(async () => {
      resolveUpdate()
      await updatePromise
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    )
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Submitted description'
    )
    expect(screen.getByLabelText('Notes')).toHaveValue('Typed while saving')

    const storedTab = useNavigationStore
      .getState()
      .activeWindows[windowId].tabs.find(tab => tab.id === tabId)
    expect(storedTab?.internalUiState.hasUnsavedChanges).toBe(true)
    expect(storedTab?.internalUiState.projectOverviewState).toMatchObject({
      dirty: true,
      draft: {
        description: 'Submitted description',
        notes: 'Typed while saving',
      },
    })
  })

  it('keeps Overview and Profile edits through a reference refetch and tab unmount', async () => {
    let refetches = 0

    function ProjectTab() {
      const [currentProject, setCurrentProject] = useState(project())

      return (
        <ProjectDetailsPanel
          project={currentProject}
          tabId={tabId}
          refetchContainer={async () => {
            refetches += 1
            setCurrentProject(value => ({
              ...value,
              conceptImageCount: 1,
              conceptImages: [
                {
                  id: 42,
                  fileId: 42,
                  fileName: 'reference.png',
                  previewUrl: '/files/42/preview',
                  fileUrl: '/files/42',
                  sortOrder: 0,
                },
              ],
            }))
          }}
          showToast={jest.fn()}
        />
      )
    }

    const view = renderWithProviders(<ProjectTab />)

    const description = screen.getByLabelText('Description')
    await userEvent.clear(description)
    await userEvent.type(description, 'Unsaved description')

    expect(description).toHaveValue('Unsaved description')
    await waitFor(() => {
      const storedTab = useNavigationStore
        .getState()
        .activeWindows[windowId].tabs.find(tab => tab.id === tabId)
      expect(storedTab?.internalUiState.projectOverviewState).toMatchObject({
        dirty: true,
        draft: { description: 'Unsaved description' },
      })
    })

    const triangles = await screen.findByLabelText('Triangles per asset')
    await userEvent.clear(triangles)
    await userEvent.type(triangles, '3210')

    // The reference board lives on the workspace's References view, so it has to
    // be switched to before its upload input is in the document. This test is
    // about draft ownership, not about which view is showing - the switch is
    // setup, not the thing under test.
    await userEvent.click(
      await screen.findByTestId('project-workspace-tab-references')
    )

    const referenceInput = screen.getByLabelText(
      'Reference images to upload'
    ) as HTMLInputElement
    await userEvent.upload(
      referenceInput,
      new File(['reference'], 'reference.png', { type: 'image/png' })
    )

    // The reference upload refetches the containing project; the drafts must
    // survive that round trip.
    await waitFor(() => {
      expect(refetches).toBeGreaterThan(0)
    })
    expect(projectApiMock.addProjectConceptImage).toHaveBeenCalledWith(9, 42)
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Unsaved description'
    )

    await waitFor(() => {
      const storedTab = useNavigationStore
        .getState()
        .activeWindows[windowId].tabs.find(tab => tab.id === tabId)
      expect(storedTab?.internalUiState.hasUnsavedChanges).toBe(true)
      expect(storedTab?.internalUiState.projectOverviewState).toMatchObject({
        dirty: true,
        draft: { description: 'Unsaved description' },
      })
    })

    view.rerender(<div>Another open tab</div>)
    view.rerender(<ProjectTab />)

    expect(await screen.findByLabelText('Description')).toHaveValue(
      'Unsaved description'
    )
    expect(await screen.findByLabelText('Triangles per asset')).toHaveValue(
      '3,210'
    )
  })
})
