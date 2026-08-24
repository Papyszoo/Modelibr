import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '@/test/renderWithProviders'

import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import { SceneList } from '../SceneList'

jest.mock('../../../project/api/projectApi')
jest.mock('../../api/scenesApi')

const projects = projectApi as jest.Mocked<typeof projectApi>
const scenes = scenesApi as jest.Mocked<typeof scenesApi>

/** A deferred promise, so a mutation can be held in flight on purpose. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function sceneView(id: number) {
  return {
    scene: {
      id,
      name: 'Rundown city street',
      description: null,
      revision: 1,
      nodeCount: 0,
      lightCount: 0,
      projectId: null,
      projectName: null,
    },
    document: { nodes: [], lights: [] },
  } as never
}

describe('SceneList - creating a scene', () => {
  let onOpenScene: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    onOpenScene = jest.fn()
    scenes.getScenes.mockResolvedValue([])
    projects.getAllProjects.mockResolvedValue([
      { id: 4, name: 'Rooftop chase' },
    ] as never)
    scenes.createScene.mockResolvedValue(sceneView(9))
    scenes.setSceneProject.mockResolvedValue({
      sceneId: 9,
      projectId: 4,
      revision: 2,
    })
  })

  async function openDialog() {
    renderWithProviders(<SceneList onOpenScene={onOpenScene} />)
    await userEvent.click(await screen.findByTestId('scene-list-new'))
    await userEvent.type(screen.getByLabelText('Name'), 'Rundown city street')
  }

  it('creates one scene however many times the button is clicked', async () => {
    // The guard that matters is inside the handler, not on the button.
    // `isPending` is React state - it is set when the mutation's render lands,
    // not when it starts - so two clicks in one tick both read the old false.
    const held = deferred<never>()
    scenes.createScene.mockReturnValue(held.promise as never)

    await openDialog()
    const create = screen.getByTestId('scene-create-confirm')

    await userEvent.click(create)
    await userEvent.click(create)
    await userEvent.click(create)

    held.resolve(sceneView(9) as never)
    await waitFor(() => expect(onOpenScene).toHaveBeenCalledWith(9))
    expect(scenes.createScene).toHaveBeenCalledTimes(1)
  })

  it('creates one scene however many times Enter is pressed', async () => {
    // Enter never went through the button's disabled attribute, so it was the
    // route that bypassed the guard entirely. A held key repeats far faster than
    // React commits.
    const held = deferred<never>()
    scenes.createScene.mockReturnValue(held.promise as never)

    await openDialog()
    const nameField = screen.getByLabelText('Name')

    await userEvent.type(nameField, '{Enter}{Enter}{Enter}')

    held.resolve(sceneView(9) as never)
    await waitFor(() => expect(onOpenScene).toHaveBeenCalledWith(9))
    expect(scenes.createScene).toHaveBeenCalledTimes(1)
  })

  it('does not submit on Enter with an empty name', async () => {
    renderWithProviders(<SceneList onOpenScene={onOpenScene} />)
    await userEvent.click(await screen.findByTestId('scene-list-new'))

    await userEvent.type(screen.getByLabelText('Name'), '{Enter}')

    expect(scenes.createScene).not.toHaveBeenCalled()
  })

  it('does not create a second scene when Enter is pressed while the link is in flight', async () => {
    // The window this closes: the scene is created, the link is still running,
    // and the form still holds a name. Another Enter used to start again from
    // the top.
    const heldLink = deferred<never>()
    scenes.setSceneProject.mockReturnValue(heldLink.promise as never)

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))

    await waitFor(() => expect(scenes.setSceneProject).toHaveBeenCalledTimes(1))
    await userEvent.type(screen.getByLabelText('Name'), '{Enter}')
    await userEvent.click(screen.getByTestId('scene-create-confirm'))

    heldLink.resolve({ sceneId: 9, projectId: 4, revision: 2 } as never)
    await waitFor(() => expect(onOpenScene).toHaveBeenCalledWith(9))
    expect(scenes.createScene).toHaveBeenCalledTimes(1)
  })

  it('reports a failed create and leaves the form open to retry', async () => {
    scenes.createScene.mockRejectedValueOnce(new Error('boom'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-confirm'))

    expect(await screen.findByTestId('scene-create-error')).toBeInTheDocument()
    expect(onOpenScene).not.toHaveBeenCalled()
  })

  it('reports a failed link instead of silently opening the scene unlinked', async () => {
    // The scene EXISTS at this point. Swallowing the failure meant a user who
    // asked for a project got none and was never told.
    scenes.setSceneProject.mockRejectedValueOnce(new Error('nope'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))

    const message = await screen.findByTestId('scene-create-error')
    expect(message).toHaveTextContent(/linking it to the project failed/i)
    // Still in the dialog: the scene is not opened behind an unreported failure.
    expect(onOpenScene).not.toHaveBeenCalled()
  })

  it('retries a failed link against the scene that already exists', async () => {
    scenes.setSceneProject.mockRejectedValueOnce(new Error('nope'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))
    await screen.findByTestId('scene-create-error')

    // The retry links scene 9 - it does not create scene 10.
    await userEvent.click(screen.getByTestId('scene-create-confirm'))

    await waitFor(() => expect(onOpenScene).toHaveBeenCalledWith(9))
    expect(scenes.createScene).toHaveBeenCalledTimes(1)
    expect(scenes.setSceneProject).toHaveBeenCalledTimes(2)
    expect(scenes.setSceneProject).toHaveBeenLastCalledWith(9, 4)
  })

  it('can give up on the link and open the scene that was created', async () => {
    scenes.setSceneProject.mockRejectedValueOnce(new Error('nope'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))
    await screen.findByTestId('scene-create-error')

    await userEvent.click(screen.getByTestId('scene-create-skip-link'))

    expect(onOpenScene).toHaveBeenCalledWith(9)
    expect(scenes.createScene).toHaveBeenCalledTimes(1)
  })

  it('opens the scene straight away when no project was asked for', async () => {
    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-confirm'))

    await waitFor(() => expect(onOpenScene).toHaveBeenCalledWith(9))
    expect(scenes.setSceneProject).not.toHaveBeenCalled()
  })
})
