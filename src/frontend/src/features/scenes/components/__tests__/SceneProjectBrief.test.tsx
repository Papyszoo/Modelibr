import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiClientError } from '@/lib/apiBase'
import { useSceneLinkHoldStore } from '@/stores'
import { renderWithProviders } from '@/test/renderWithProviders'

import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import { SceneProjectBrief } from '../SceneProjectBrief'

jest.mock('../../../project/api/projectApi')
jest.mock('../../api/scenesApi')

const projects = projectApi as jest.Mocked<typeof projectApi>
const scenes = scenesApi as jest.Mocked<typeof scenesApi>

/**
 * A refusal the server actually answered: nothing was written, and a retry is
 * the right advice.
 */
function refusal() {
  return new ApiClientError('That project no longer exists.', {
    status: 404,
    isNetworkError: false,
    isTimeout: false,
    isOffline: false,
  })
}

/**
 * A failure that reached an unknown point in the write. The server may have
 * committed and the answer never came back, so this must NOT be treated as a
 * refusal.
 */
function transportFailure() {
  return new ApiClientError('Network Error', {
    isNetworkError: true,
    isTimeout: false,
    isOffline: false,
  })
}

describe('SceneProjectBrief', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useSceneLinkHoldStore.setState({ holds: {} })
    projects.getAllProjects.mockResolvedValue([
      { id: 4, name: 'Rooftop chase' },
    ] as never)
    scenes.setSceneProject.mockResolvedValue({
      sceneId: 2,
      projectId: 4,
      revision: 8,
    })
  })

  /** Opens the panel and picks the one project on offer. */
  async function pickProject() {
    await userEvent.click(screen.getByTestId('scene-project-chip'))
    await userEvent.click(screen.getByTestId('scene-project-select'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
  }

  it('says plainly when a scene belongs to no project', async () => {
    // Not an empty panel: "no project" means the agent is given no budget, no
    // style and no world convention, which is worth stating rather than
    // leaving to be inferred from a blank box.
    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await userEvent.click(screen.getByTestId('scene-project-chip'))

    expect(
      await screen.findByTestId('scene-project-brief-unlinked')
    ).toBeInTheDocument()
    expect(projects.getProjectBrief).not.toHaveBeenCalled()
  })

  it('does not fetch the brief until the panel is opened', () => {
    renderWithProviders(
      <SceneProjectBrief
        sceneId={2}
        projectId={4}
        projectName="Rooftop chase"
      />
    )

    expect(projects.getProjectBrief).not.toHaveBeenCalled()
  })

  it('links the scene to the project the user picks', async () => {
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await userEvent.click(screen.getByTestId('scene-project-chip'))

    // The dropdown renders its list only once opened, so the picking is two
    // clicks - the same two the user makes.
    await userEvent.click(screen.getByTestId('scene-project-select'))
    await userEvent.click(await screen.findByText('Rooftop chase'))

    expect(scenes.setSceneProject).toHaveBeenCalledWith(2, 4)
  })

  it('refuses to link while the editor holds an unsaved draft', async () => {
    // Linking moves the scene's revision, and the draft was opened against the
    // old one - a save afterwards is refused as a conflict with nothing to
    // reconcile it.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)

    renderWithProviders(
      <SceneProjectBrief
        sceneId={2}
        projectId={null}
        projectName={null}
        blocked="Save your edits first."
      />
    )

    await userEvent.click(screen.getByTestId('scene-project-chip'))

    expect(
      await screen.findByTestId('scene-project-blocked')
    ).toHaveTextContent('Save your edits first.')
    await userEvent.click(screen.getByTestId('scene-project-select'))
    expect(screen.queryByText('Rooftop chase')).not.toBeInTheDocument()
    expect(scenes.setSceneProject).not.toHaveBeenCalled()
  })

  it("opens the scene's hold before the request goes out", async () => {
    // The hold has to cover the whole in-flight window. Opened on the response
    // instead, everything between the click and the answer was unguarded - and
    // that window is precisely when an edit produces the conflict.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    let settle!: (value: unknown) => void
    scenes.setSceneProject.mockReturnValue(
      new Promise(resolve => {
        settle = resolve
      }) as never
    )

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await pickProject()

    await waitFor(() =>
      expect(useSceneLinkHoldStore.getState().holds[2]?.phase).toBe('pending')
    )

    settle({ sceneId: 2, projectId: 4, revision: 9 })

    // And the server's own revision is what the hold then waits for, rather than
    // "some refetch landing" - a number the client guessed at was how a stale
    // read could end the hold.
    await waitFor(() =>
      expect(useSceneLinkHoldStore.getState().holds[2]).toMatchObject({
        phase: 'awaiting-revision',
        targetRevision: 9,
      })
    )
  })

  it('releases the hold when the server REFUSES the link', async () => {
    // A refusal moved nothing and queues no refetch, so a hold waiting for one
    // waits forever - the editor was read-only until the tab was closed.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    scenes.setSceneProject.mockRejectedValue(refusal())

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await pickProject()

    await screen.findByTestId('scene-project-error')
    expect(useSceneLinkHoldStore.getState().holds[2]).toBeUndefined()
  })

  it('KEEPS the hold when the failure cannot say whether the write landed', async () => {
    // The finding. A dropped connection is not a refusal: the server may have
    // committed and the answer never made it back. Releasing here hands the
    // editor back over a scene that may have moved underneath it, and the next
    // save is the conflict this whole mechanism exists to prevent.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    scenes.setSceneProject.mockRejectedValue(transportFailure())

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await pickProject()

    await waitFor(() =>
      expect(useSceneLinkHoldStore.getState().holds[2]?.phase).toBe(
        'reconciling'
      )
    )
  })

  it('offers a retry for a refusal and an explanation for an ambiguity', async () => {
    // The two failures need different advice. "Try again" after a request that
    // may have committed is an invitation to link twice.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    scenes.setSceneProject.mockRejectedValue(transportFailure())

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await pickProject()

    const error = await screen.findByTestId('scene-project-error')
    expect(error).toHaveTextContent(/re-read from the server/i)
    expect(error).not.toHaveTextContent(/Pick a project again/i)
  })

  it('refuses a second link while one is still in flight, even from the keyboard', async () => {
    // The dropdown is disabled while the mutation is pending, but a disabled
    // PrimeReact control still has a keyboard path - and "disabled" is styling,
    // not a rule about the write.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    scenes.setSceneProject.mockReturnValue(new Promise(() => {}) as never)

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await pickProject()
    await waitFor(() => expect(scenes.setSceneProject).toHaveBeenCalledTimes(1))

    await userEvent.click(screen.getByTestId('scene-project-select'), {
      pointerEventsCheck: 0,
    })
    const option = screen.queryByText('Rooftop chase')
    if (option) {
      await userEvent.click(option, { pointerEventsCheck: 0 })
    }

    expect(scenes.setSceneProject).toHaveBeenCalledTimes(1)
  })

  it('refuses to link while another scene write is in flight', async () => {
    // The other direction of the exclusion, which the editor expresses by
    // passing a reason down. Enforced in the handler, not only on the control.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)

    renderWithProviders(
      <SceneProjectBrief
        sceneId={2}
        projectId={null}
        projectName={null}
        blocked="Wait for the change being saved to finish."
      />
    )

    await userEvent.click(screen.getByTestId('scene-project-chip'))
    await userEvent.click(screen.getByTestId('scene-project-select'), {
      pointerEventsCheck: 0,
    })
    const option = screen.queryByText('Rooftop chase')
    if (option) {
      await userEvent.click(option, { pointerEventsCheck: 0 })
    }

    expect(scenes.setSceneProject).not.toHaveBeenCalled()
  })

  it('shows why a link was refused, and leaves the control ready to retry', async () => {
    // It used to fail silently: the dropdown snapped back to the project the
    // scene still had, and nothing said anything.
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    scenes.setSceneProject.mockRejectedValue(refusal())

    renderWithProviders(
      <SceneProjectBrief sceneId={2} projectId={null} projectName={null} />
    )

    await pickProject()

    const error = await screen.findByTestId('scene-project-error')
    expect(error).toHaveTextContent('Pick a project again to retry.')
    // Announced, because the panel it appears in is not where the eye is.
    expect(error).toHaveAttribute('role', 'alert')

    // And the retry is available: the write moved nothing, so there is nothing
    // to reconcile before trying again.
    expect(screen.getByTestId('scene-project-select')).not.toHaveClass(
      'p-disabled'
    )

    scenes.setSceneProject.mockResolvedValue({
      sceneId: 2,
      projectId: 4,
      revision: 9,
    })
    await pickProject()

    await waitFor(() => expect(scenes.setSceneProject).toHaveBeenCalledTimes(2))
  })
})
