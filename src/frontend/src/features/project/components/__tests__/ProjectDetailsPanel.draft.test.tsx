import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import * as modelApi from '@/features/models/api/modelApi'
import * as projectApi from '@/features/project/api/projectApi'
import { ProjectDetailsPanel } from '@/features/project/components/ProjectDetailsPanel'
import {
  createTab,
  getWindowId,
  useNavigationStore,
} from '@/stores/navigationStore'
import { renderWithProviders } from '@/test/renderWithProviders'
import { type ProjectBriefDto, type ProjectDetailDto } from '@/types'

jest.mock('@/features/models/api/modelApi')
jest.mock('@/features/project/api/projectApi')

const projectApiMock = projectApi as jest.Mocked<typeof projectApi>
const modelApiMock = modelApi as jest.Mocked<typeof modelApi>

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
    function ProjectTab() {
      const [currentProject, setCurrentProject] = useState(project())

      return (
        <ProjectDetailsPanel
          project={currentProject}
          tabId={tabId}
          refetchContainer={async () => {
            setCurrentProject(value => ({
              ...value,
              conceptImageCount: 1,
              conceptImages: [
                {
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

    const referenceInput = document.querySelector(
      'input[type="file"][multiple]'
    ) as HTMLInputElement
    await userEvent.upload(
      referenceInput,
      new File(['reference'], 'reference.png', { type: 'image/png' })
    )

    expect(await screen.findByText('reference.png')).toBeVisible()
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
