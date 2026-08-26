import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiClientError } from '@/lib/apiBase'
import { useSceneLinkHoldStore } from '@/stores'
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

function sceneView(id: number, overrides: { projectId?: number | null } = {}) {
  return {
    scene: {
      id,
      name: 'Rundown city street',
      description: null,
      revision: 1,
      nodeCount: 0,
      lightCount: 0,
      projectId: overrides.projectId ?? null,
      projectName: null,
    },
    document: { nodes: [], lights: [] },
  } as never
}

/**
 * A request the server ANSWERED and refused. Nothing was written, so resending
 * it is an ordinary retry.
 */
function refusal(message = 'That project no longer exists.') {
  return new ApiClientError(message, {
    status: 404,
    isNetworkError: false,
    isTimeout: false,
    isOffline: false,
  })
}

/**
 * A request whose outcome is UNKNOWN - the connection dropped, or it timed out,
 * or the server answered 5xx from somewhere inside the write. It may have
 * committed, so it must not be sent again.
 */
function ambiguousFailure(kind: 'network' | 'timeout' | 'server' = 'network') {
  if (kind === 'server') {
    return new ApiClientError('Internal Server Error', {
      status: 500,
      isNetworkError: false,
      isTimeout: false,
      isOffline: false,
    })
  }

  return new ApiClientError(
    kind === 'timeout' ? 'timeout of 30000ms exceeded' : 'Network Error',
    {
      isNetworkError: kind === 'network',
      isTimeout: kind === 'timeout',
      isOffline: false,
    }
  )
}

describe('SceneList - creating a scene', () => {
  let onOpenScene: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    useSceneLinkHoldStore.setState({ holds: {} })
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

  it('retries a REFUSED link against the scene that already exists', async () => {
    // A retry is only offered for a failure the server answered. This used to
    // reject with a bare Error - which is an unknown outcome, not a refusal -
    // and the retry it asserted was the finding rather than the behaviour.
    scenes.setSceneProject.mockRejectedValueOnce(refusal())

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

  it('can give up on a refused link and open the scene that was created', async () => {
    scenes.setSceneProject.mockRejectedValueOnce(refusal())

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

  // ─── an ambiguous link is not retried, it is reconciled ────────────────────
  //
  // Creating is two writes, and the second one can fail in two very different
  // ways. The dialog used to treat them the same: any failure got a "Retry link"
  // button, which resent the write and - through `begin()` - overwrote the hold
  // that recorded the first attempt as unresolved. That is wrong three times
  // over. The write may already have committed, so the retry links twice; it
  // carries the project chosen BEFORE the first attempt, so it overwrites
  // whatever the scene has now; and overwriting the hold loses the fact that
  // anybody was waiting to find out. There is one safe move, and it is to look.

  it('offers no retry when the link failed in a way that cannot say what happened', async () => {
    scenes.setSceneProject.mockRejectedValueOnce(ambiguousFailure('network'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))

    const message = await screen.findByTestId('scene-create-error')
    expect(message).toHaveTextContent(/not known whether the link was saved/i)

    // The button that would resend the write is not on offer at all.
    expect(screen.queryByTestId('scene-create-confirm')).not.toBeInTheDocument()
    // What is on offer is the one thing that resolves it.
    expect(screen.getByTestId('scene-create-skip-link')).toHaveTextContent(
      /open the scene/i
    )
  })

  it.each([
    ['a dropped connection', 'network' as const],
    ['a timeout', 'timeout' as const],
    ['a 5xx from inside the write', 'server' as const],
  ])(
    'sends no second link request after %s, however the dialog is driven',
    async (_label, kind) => {
      scenes.setSceneProject.mockRejectedValueOnce(ambiguousFailure(kind))

      await openDialog()
      await userEvent.click(screen.getByTestId('scene-create-project'))
      await userEvent.click(await screen.findByText('Rooftop chase'))
      await userEvent.click(screen.getByTestId('scene-create-confirm'))
      await screen.findByTestId('scene-create-error')

      // Enter is the path that never went through a disabled attribute, so it
      // is the one that mattered. The name field is disabled here, so the key
      // is sent to the dialog itself.
      await userEvent.keyboard('{Enter}')

      expect(scenes.setSceneProject).toHaveBeenCalledTimes(1)
      expect(scenes.createScene).toHaveBeenCalledTimes(1)
    }
  )

  it('leaves the scene held for reconciliation after an ambiguous link', async () => {
    // The hold is what the editor reads when the scene is opened, and it is what
    // stops any other write reaching this scene until authoritative data has
    // landed. Releasing it here - or letting a retry overwrite it - is how the
    // "we do not know" gets quietly lost.
    scenes.setSceneProject.mockRejectedValueOnce(ambiguousFailure('network'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))
    await screen.findByTestId('scene-create-error')

    await waitFor(() =>
      expect(useSceneLinkHoldStore.getState().holds[9]).toMatchObject({
        phase: 'reconciling',
        kind: 'link',
      })
    )
  })

  it('opens the created scene so the unresolved link can be reconciled', async () => {
    // The way out. Opening the scene is what fetches it authoritatively; the
    // hold survives into the editor and ends there, on data, once the draft is
    // sitting on whatever the server actually has.
    scenes.setSceneProject.mockRejectedValueOnce(ambiguousFailure('timeout'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))
    await screen.findByTestId('scene-create-error')

    await userEvent.click(screen.getByTestId('scene-create-skip-link'))

    expect(onOpenScene).toHaveBeenCalledWith(9)
    expect(scenes.createScene).toHaveBeenCalledTimes(1)
    // Still exactly one attempt: opening is a read, not a second write.
    expect(scenes.setSceneProject).toHaveBeenCalledTimes(1)
    // And the hold is still up, because nothing has answered it yet.
    expect(useSceneLinkHoldStore.getState().holds[9]?.phase).toBe('reconciling')
  })

  it('does not resend the link when the first attempt DID commit', async () => {
    // The case the retry button was worst for. The server took the write and the
    // answer never came back, so the scene is already linked - and a resend
    // would be a second audited write against a scene whose project may since
    // have been changed by somebody else, using the value from before.
    scenes.setSceneProject.mockRejectedValueOnce(ambiguousFailure('network'))
    // What the server actually has, if anybody asks: the link DID land.
    scenes.getSceneById.mockResolvedValue(sceneView(9, { projectId: 4 }))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))
    await screen.findByTestId('scene-create-error')

    await userEvent.click(screen.getByTestId('scene-create-skip-link'))

    expect(scenes.setSceneProject).toHaveBeenCalledTimes(1)
  })

  it('does not resend the link when the first attempt did NOT commit either', async () => {
    // The other branch of the same unknown, and the point is that the dialog
    // cannot tell them apart and must not guess. Both end the same way: one
    // request, and a scene the user is sent to look at.
    scenes.setSceneProject.mockRejectedValueOnce(ambiguousFailure('network'))
    scenes.getSceneById.mockResolvedValue(sceneView(9))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))
    await screen.findByTestId('scene-create-error')

    await userEvent.click(screen.getByTestId('scene-create-skip-link'))

    expect(scenes.setSceneProject).toHaveBeenCalledTimes(1)
    expect(onOpenScene).toHaveBeenCalledWith(9)
  })

  it('refuses a second link write while one is unresolved, even if something asks for it', async () => {
    // Belt and braces under the dialog: the hold itself refuses the claim, so a
    // caller that got past the UI still cannot send the write.
    scenes.setSceneProject.mockRejectedValueOnce(ambiguousFailure('network'))

    await openDialog()
    await userEvent.click(screen.getByTestId('scene-create-project'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await userEvent.click(screen.getByTestId('scene-create-confirm'))
    await screen.findByTestId('scene-create-error')

    await waitFor(() =>
      expect(useSceneLinkHoldStore.getState().holds[9]?.phase).toBe(
        'reconciling'
      )
    )
    expect(useSceneLinkHoldStore.getState().tryBegin(9, 'link')).toBe(false)
    // And the unresolved record is untouched by the attempt.
    expect(useSceneLinkHoldStore.getState().holds[9]?.phase).toBe('reconciling')
  })
})
