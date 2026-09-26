import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  createScene as mockCreateScene,
  setSceneLevel as mockSetSceneLevel,
  setSceneProject as mockSetSceneProject,
} from '@/features/scenes/api/scenesApi'
import { useScenesQuery } from '@/features/scenes/api/queries'
import { renderWithProviders } from '@/test/renderWithProviders'

import { ProjectLevelSceneButton } from '../ProjectLevelSceneButton'

// Required inside the factory, not closed over: jest hoists these above the
// imports, and a hoisted factory may not reach module scope.
jest.mock('@/features/scenes/api/queries', () => {
  // The mocked scenesApi, not requireActual: the mutations under test have to be
  // the same jest.fn()s the assertions look at.
  const api = require('@/features/scenes/api/scenesApi') as {
    createScene: jest.Mock
    setSceneProject: jest.Mock
    setSceneLevel: jest.Mock
  }
  return {
    useScenesQuery: jest.fn(),
    useCreateSceneMutation: () => ({
      mutateAsync: api.createScene,
      isPending: false,
    }),
    useSetSceneProjectMutation: () => ({ mutateAsync: api.setSceneProject }),
    useFileSceneUnderLevel: () => api.setSceneLevel,
  }
})

jest.mock('@/features/scenes/api/scenesApi', () => ({
  createScene: jest.fn(),
  setSceneProject: jest.fn(),
  setSceneLevel: jest.fn(),
}))

/**
 * A level has to be drivable into its scene from the level.
 *
 * The backend has filed scenes under levels since v0.7 and the levels view was
 * the one place that should have offered the trip, so these cover the two things
 * the button means: a level that has a scene opens it, and a level that has none
 * gets one filed under it. The ordering in the second case is the contract - a
 * scene must belong to the project before it can belong to one of its levels, and
 * filing it under the level first is refused by the server.
 */

const scenes = useScenesQuery as unknown as jest.Mock

function renderButton(onOpenSceneEditorTab = jest.fn()) {
  const result = renderWithProviders(
    <ProjectLevelSceneButton
      projectId={7}
      levelId={3}
      levelName="Forest Crossing"
    />,
    { tabId: 'project-7', onOpenSceneEditorTab }
  )
  return { ...result, onOpenSceneEditorTab }
}

beforeEach(() => {
  jest.clearAllMocks()
  scenes.mockReturnValue({ data: [] })
  ;(mockCreateScene as jest.Mock).mockResolvedValue({
    scene: { id: 42, name: 'Forest Crossing' },
  })
  ;(mockSetSceneProject as jest.Mock).mockResolvedValue({ revision: 1 })
  ;(mockSetSceneLevel as jest.Mock).mockResolvedValue({ revision: 2 })
})

describe('ProjectLevelSceneButton', () => {
  it('offers to create when the level has no scene', async () => {
    renderButton()

    expect(
      screen.getByRole('button', { name: 'Create a scene for Forest Crossing' })
    ).toBeVisible()
  })

  it('opens the level scene that already exists', async () => {
    // The primary scene first: it is the level's own shot, and the other scenes
    // filed under the level are alternates of it.
    scenes.mockReturnValue({
      data: [
        {
          id: 11,
          name: 'Alternate',
          projectId: 7,
          projectLevelId: 3,
          isPrimaryLevelScene: false,
        },
        {
          id: 9,
          name: 'Forest Crossing',
          projectId: 7,
          projectLevelId: 3,
          isPrimaryLevelScene: true,
        },
      ],
    })
    const { onOpenSceneEditorTab } = renderButton()

    await userEvent.click(
      screen.getByRole('button', { name: 'Open the scene of Forest Crossing' })
    )

    expect(onOpenSceneEditorTab).toHaveBeenCalledWith('9', 'Forest Crossing')
    expect(mockCreateScene).not.toHaveBeenCalled()
  })

  it('ignores a scene filed under this level in another project', async () => {
    // A level id is only unique within its project, and the scenes list is not
    // project-filtered. Trusting the id alone would open a different project's
    // scene.
    scenes.mockReturnValue({
      data: [
        {
          id: 9,
          name: 'Someone else',
          projectId: 8,
          projectLevelId: 3,
          isPrimaryLevelScene: true,
        },
      ],
    })
    renderButton()

    expect(
      screen.getByRole('button', { name: 'Create a scene for Forest Crossing' })
    ).toBeVisible()
  })

  it('creates, files and opens when the level has no scene', async () => {
    const { onOpenSceneEditorTab } = renderButton()

    await userEvent.click(
      screen.getByRole('button', { name: 'Create a scene for Forest Crossing' })
    )

    await waitFor(() => {
      expect(onOpenSceneEditorTab).toHaveBeenCalledWith('42', 'Forest Crossing')
    })
    expect(mockCreateScene).toHaveBeenCalledWith({ name: 'Forest Crossing' })
    expect(mockSetSceneProject).toHaveBeenCalledWith({
      sceneId: 42,
      projectId: 7,
    })
    expect(mockSetSceneLevel).toHaveBeenCalledWith(42, 3, true)
  })

  it('reports a failure instead of opening nothing silently', async () => {
    // The level row would otherwise just stop responding, and a level whose
    // scene could not be created looks exactly like a level without one.
    ;(mockSetSceneLevel as jest.Mock).mockRejectedValue(new Error('refused'))
    const { onOpenSceneEditorTab } = renderButton()

    await userEvent.click(
      screen.getByRole('button', { name: 'Create a scene for Forest Crossing' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Could not open Forest Crossing's scene."
    )
    expect(onOpenSceneEditorTab).not.toHaveBeenCalled()
  })
})
