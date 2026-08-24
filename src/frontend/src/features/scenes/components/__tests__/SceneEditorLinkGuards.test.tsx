import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiClientError } from '@/lib/apiBase'
import { useSceneEditorStore, useSceneLinkHoldStore } from '@/stores'

import type { SceneDocument } from '../../types'
import { renderWithProviders } from '@/test/renderWithProviders'

import * as modelApi from '../../../models/api/modelApi'
import * as projectApi from '../../../project/api/projectApi'
import * as scenesApi from '../../api/scenesApi'
import { SceneEditor } from '../SceneEditor'

/*
  The 3D canvas is not what is under test and cannot draw in jsdom, so it is
  stubbed. Everything else - the store, the guards, the mutations, the toolbar -
  is the real thing.
*/
jest.mock('../SceneCanvas', () => ({
  SceneCanvas: () => <div data-testid="scene-canvas" />,
}))

jest.mock('../../api/scenesApi')
jest.mock('../../../project/api/projectApi')
jest.mock('../../../models/api/modelApi')

const scenes = scenesApi as jest.Mocked<typeof scenesApi>
const projects = projectApi as jest.Mocked<typeof projectApi>
const models = modelApi as jest.Mocked<typeof modelApi>

/**
 * Editing is serialised against the project link because linking moves the
 * scene's revision and the editor only reseeds a CLEAN draft - so an edit made
 * during the link leaves the draft dirty at a revision the server has replaced,
 * and the next save is refused over a conflict the user cannot reconcile.
 *
 * <p>
 * The gate existed; three ways through it did not go past it. Undo and redo
 * called the store directly, on the button and on the chord. A model placement
 * awaits the asset's facts first, and the guard it had captured still said
 * "allowed" when that await resolved mid-link. And slot writes - which go
 * straight to the server carrying baseRevision - were held only for a dirty
 * draft, not for a link replacing the very revision they carry.
 * </p>
 */
describe('scene editing is serialised against the project link', () => {
  const REVISION = 4

  function sceneView(revision = REVISION) {
    return {
      scene: {
        id: 2,
        name: 'Kitchen',
        description: null,
        revision,
        projectId: null,
        projectName: null,
        stage: null,
        schemaVersion: 1,
        nodeCount: 1,
        lightCount: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      document: {
        schemaVersion: 1,
        nodes: [
          {
            id: 'crate',
            name: 'Crate',
            transform: {
              position: { x: 0, y: 0, z: 0 },
              rotationEuler: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
            asset: { assetType: 'Model', assetId: 12, versionId: 34 },
            visible: true,
          },
        ],
        lights: [],
      },
      nodes: [],
      overlaps: [],
      scaleWarnings: [],
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    useSceneLinkHoldStore.setState({ holds: {} })
    useSceneEditorStore
      .getState()
      .open(2, sceneView().document as SceneDocument, REVISION)

    scenes.getSceneById.mockResolvedValue(sceneView() as never)
    scenes.getSceneSlots.mockResolvedValue({
      sceneId: 2,
      revision: REVISION,
      slots: [],
    } as never)
    scenes.getSceneAssetFacts.mockResolvedValue({
      groundedYAtOrigin: 0,
      sourceDimensions: { x: 1, y: 1, z: 1 },
    } as never)
    projects.getAllProjects.mockResolvedValue([
      { id: 4, name: 'Rooftop chase' },
    ] as never)
    projects.getProjectBrief.mockResolvedValue({ guidance: [] } as never)
    models.getModelsPaginated.mockResolvedValue({
      items: [
        { id: '12', name: 'Crate', activeVersionId: 34, latestVersionId: 34 },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 40,
    } as never)
  })

  /** Renders the editor and waits for the scene to load. */
  async function open() {
    const rendered = renderWithProviders(
      <SceneEditor sceneId={2} onClose={() => {}} />
    )
    await screen.findByTestId('scene-canvas')
    return rendered
  }

  /** Starts a project link that will not settle until `settle` is called. */
  function pendingLink() {
    let settle!: (value: unknown) => void
    let reject!: (reason: unknown) => void
    scenes.setSceneProject.mockReturnValue(
      new Promise((resolve, rejectIt) => {
        settle = resolve
        reject = rejectIt
      }) as never
    )
    return { settle, reject }
  }

  /**
   * Sends an undo/redo chord to the window, from nowhere in particular.
   *
   * <p>
   * The handler ignores chords aimed at a text field, so typing one while the
   * project dropdown still holds focus is a no-op for a reason that has nothing
   * to do with the guard under test - and a test asserting "nothing happened"
   * would pass without exercising anything. Focus is dropped first, and the
   * positive control below proves the chord does reach the editor.
   * </p>
   */
  async function chord(shift = false) {
    ;(document.activeElement as HTMLElement | null)?.blur()
    await userEvent.keyboard(
      shift ? '{Control>}{Shift>}z{/Shift}{/Control}' : '{Control>}z{/Control}'
    )
  }

  /** Opens the project panel and picks the one project on offer. */
  async function startLink() {
    await userEvent.click(screen.getByTestId('scene-project-chip'))
    await userEvent.click(screen.getByTestId('scene-project-select'))
    await userEvent.click(await screen.findByText('Rooftop chase'))
    await screen.findByTestId('scene-editor-link-pending')
  }

  /**
   * An edit, then a save of exactly what that edit produced.
   *
   * <p>
   * Both halves are needed. The edit gives the draft something to undo; the
   * save makes it CLEAN, which is what lets the link start at all - the link
   * control refuses outright while a draft is unsaved, and that refusal is a
   * different guard from the one under test here. What is left is the case that
   * matters: a clean draft, undo history behind it, and a link in flight.
   * </p>
   */
  function editThenSave() {
    const store = useSceneEditorStore.getState()
    store.setNodeTransform('crate', {
      position: { x: 5, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })
    const saved = useSceneEditorStore.getState().document!
    useSceneEditorStore.getState().markSaved(REVISION, saved)
  }

  /** One proposed slot with one choosable candidate, which is all these need. */
  function slotsWithOneCandidate() {
    return {
      sceneId: 2,
      revision: REVISION,
      slots: [
        {
          slotId: 'sofa',
          status: 'proposed',
          role: 'seating',
          candidates: [
            {
              id: 'a',
              ref: 'sofa/a',
              rejected: false,
              choosable: true,
              label: 'Sofa A',
            },
          ],
          chosen: null,
        },
      ],
    }
  }

  it('disables undo and redo while a link is in flight', async () => {
    await open()
    editThenSave()
    await waitFor(() =>
      expect(screen.getByTestId('scene-editor-undo')).toBeEnabled()
    )

    pendingLink()
    await startLink()

    expect(screen.getByTestId('scene-editor-undo')).toBeDisabled()
  })

  it('ignores the undo BUTTON if it is somehow pressed during a link', async () => {
    // Belt and braces over the disabled attribute: the guard is what actually
    // protects the draft, and it has to hold whether or not the styling does.
    await open()
    editThenSave()
    const moved = useSceneEditorStore.getState().document

    pendingLink()
    await startLink()

    await userEvent.click(screen.getByTestId('scene-editor-undo'), {
      pointerEventsCheck: 0,
    })

    expect(useSceneEditorStore.getState().document).toBe(moved)
  })

  it('ignores the undo CHORD during a link', async () => {
    // The keyboard path bypasses every disabled attribute in the toolbar, so it
    // is the one that mattered most and had no guard at all.
    await open()
    editThenSave()
    const moved = useSceneEditorStore.getState().document

    pendingLink()
    await startLink()

    await chord()

    expect(useSceneEditorStore.getState().document).toBe(moved)
  })

  it('ignores the redo chord during a link', async () => {
    await open()
    editThenSave()
    // Undo it, so there is a redo waiting - and save again, because the link
    // control refuses outright while the draft is unsaved and that is a
    // different guard from this one.
    useSceneEditorStore.getState().undo()
    const undone = useSceneEditorStore.getState().document!
    useSceneEditorStore.getState().markSaved(REVISION, undone)

    pendingLink()
    await startLink()

    await chord(true)

    expect(useSceneEditorStore.getState().document).toBe(undone)
  })

  it('undoes on the chord when nothing is holding edits', async () => {
    // The control the three tests above depend on. Without it, "the document did
    // not change" is equally consistent with a guard that works and a chord that
    // never arrived.
    await open()
    editThenSave()
    const moved = useSceneEditorStore.getState().document

    await chord()

    expect(useSceneEditorStore.getState().document).not.toBe(moved)
  })

  it('refuses a placement that STARTED before the link and finished during it', async () => {
    // The stale-closure case. The asset's facts are fetched before the node is
    // added, and a link can begin inside that await - the guard the placement
    // captured on the way in still said "allowed" when it came back.
    await open()

    let deliverFacts!: (value: unknown) => void
    scenes.getSceneAssetFacts.mockReturnValue(
      new Promise(resolve => {
        deliverFacts = resolve
      }) as never
    )

    const before = useSceneEditorStore.getState().document
    const tile = await screen.findByTestId('scene-picker-tile')
    await userEvent.click(tile)
    await waitFor(() => expect(scenes.getSceneAssetFacts).toHaveBeenCalled())

    // The link starts while the placement is still waiting on its facts.
    pendingLink()
    await startLink()

    deliverFacts({
      groundedYAtOrigin: 0,
      sourceDimensions: { x: 1, y: 1, z: 1 },
    })

    // Nothing was added, and the user is told why rather than left wondering
    // where their model went.
    await waitFor(() =>
      expect(screen.getByTestId('scene-editor-place-error')).toBeInTheDocument()
    )
    expect(useSceneEditorStore.getState().document).toBe(before)
  })

  it('holds slot writes for a link, not only for a dirty draft', async () => {
    // Slot writes go straight to the server carrying baseRevision, which is the
    // number the link is in the middle of replacing.
    scenes.getSceneSlots.mockResolvedValue({
      sceneId: 2,
      revision: REVISION,
      slots: [
        {
          slotId: 'sofa',
          status: 'open',
          role: 'seating',
          candidates: [],
          chosen: null,
        },
      ],
    } as never)
    await open()

    pendingLink()
    await startLink()

    expect(screen.getByTestId('scene-choices-blocked')).toHaveTextContent(
      /linked to a project/i
    )
    expect(scenes.resolveSceneSlot).not.toHaveBeenCalled()
  })

  it('lets editing resume once the link succeeds and the draft is reseeded', async () => {
    // Atomically holding forever would be its own bug. The hold has to end.
    await open()
    editThenSave()

    const link = pendingLink()
    await startLink()
    expect(screen.getByTestId('scene-editor-undo')).toBeDisabled()

    // The link lands, and the refetch it queued brings the new revision. The
    // draft is clean, so the editor reseeds onto it - which is the whole event
    // the hold was waiting for.
    scenes.getSceneById.mockResolvedValue(sceneView(REVISION + 1) as never)
    link.settle({ sceneId: 2, projectId: 4, revision: REVISION + 1 })

    await waitFor(() =>
      expect(
        screen.queryByTestId('scene-editor-link-pending')
      ).not.toBeInTheDocument()
    )

    // And the draft really is on the new revision, so a save afterwards is not
    // a conflict.
    expect(useSceneEditorStore.getState().baseRevision).toBe(REVISION + 1)
  })

  it('leaves no permanent hold when the server REFUSES the link', async () => {
    // The other way out. A refused link invalidates nothing, so nothing arrives
    // to release a hold that waits for a refetch - the editor was read-only for
    // the rest of the session.
    //
    // A refusal is specifically a request the server ANSWERED and declined. It
    // used to be any rejected promise at all, which is the bug the ambiguity
    // test below covers.
    await open()
    editThenSave()

    const link = pendingLink()
    await startLink()

    link.reject(
      new ApiClientError('That project no longer exists.', {
        status: 404,
        isNetworkError: false,
        isTimeout: false,
        isOffline: false,
      })
    )

    await waitFor(() =>
      expect(
        screen.queryByTestId('scene-editor-link-pending')
      ).not.toBeInTheDocument()
    )

    // And editing genuinely works again, not just visually: the toolbar is live
    // and the chord reaches the draft.
    expect(screen.getByTestId('scene-editor-undo')).toBeEnabled()

    const moved = useSceneEditorStore.getState().document
    await chord()

    expect(useSceneEditorStore.getState().document).not.toBe(moved)
  })

  it('KEEPS the hold when the link fails in a way that cannot say what happened', async () => {
    // The finding. A dropped connection is not a refusal: the server may have
    // committed and the answer never came back. The editor used to resume on any
    // rejection at all, which hands it back over a scene that may have moved -
    // and the next save is the conflict the whole mechanism exists to prevent.
    await open()
    editThenSave()

    const link = pendingLink()
    await startLink()

    // The re-read this failure triggers is left in flight, so what the hold does
    // in the meantime is observable rather than a frame that flickers past.
    scenes.getSceneById.mockReturnValue(new Promise(() => {}) as never)
    link.reject(
      new ApiClientError('Network Error', {
        isNetworkError: true,
        isTimeout: false,
        isOffline: false,
      })
    )

    await waitFor(() =>
      expect(useSceneLinkHoldStore.getState().holds[2]?.phase).toBe(
        'reconciling'
      )
    )
    expect(screen.getByTestId('scene-editor-link-pending')).toBeInTheDocument()

    // And editing is genuinely still held, not merely labelled as held.
    const held = useSceneEditorStore.getState().document
    await chord()
    expect(useSceneEditorStore.getState().document).toBe(held)
  })

  it('resumes only once the re-read after an ambiguous link has landed', async () => {
    // The way out of the ambiguity is authoritative data, not a timer. The scene
    // is refetched and the answer - whatever it is - releases the hold.
    await open()
    editThenSave()

    const link = pendingLink()
    await startLink()

    // The write did land, as it happens; the client just never heard so.
    scenes.getSceneById.mockResolvedValue(sceneView(REVISION + 1) as never)
    link.reject(
      new ApiClientError('timeout of 30000ms exceeded', {
        isNetworkError: false,
        isTimeout: true,
        isOffline: false,
      })
    )

    await waitFor(() =>
      expect(
        screen.queryByTestId('scene-editor-link-pending')
      ).not.toBeInTheDocument()
    )
    expect(useSceneEditorStore.getState().baseRevision).toBe(REVISION + 1)
  })

  it('keeps holding when the refetch after a link cannot be completed', async () => {
    // Releasing here would resume editing against whatever was left in the
    // cache, which is the scene from BEFORE the write that just moved it. The
    // editor shows the failure rather than a live editor over stale data, and
    // the hold survives to cover the recovery.
    await open()
    editThenSave()

    const link = pendingLink()
    await startLink()

    scenes.getSceneById.mockRejectedValue(
      new ApiClientError('Network Error', {
        isNetworkError: true,
        isTimeout: false,
        isOffline: false,
      })
    )
    link.settle({ sceneId: 2, projectId: 4, revision: REVISION + 1 })

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(useSceneLinkHoldStore.getState().holds[2]).toMatchObject({
      phase: 'awaiting-revision',
      targetRevision: REVISION + 1,
    })

    // The draft is still on the OLD revision, which is exactly why the hold has
    // to outlive the failure: resuming now would edit against a number the
    // server has replaced.
    expect(useSceneEditorStore.getState().baseRevision).toBe(REVISION)
  })

  it('is still held after the editor is closed and reopened mid-link', async () => {
    // The scene editor unmounts whenever the user glances at another tab - the
    // dock renders only the active one. The hold lived in this component's state
    // and died there, so the remount believed nothing was in flight over a draft
    // seeded on a revision the server had already replaced.
    const first = await open()
    editThenSave()

    pendingLink()
    await startLink()
    first.unmount()

    await open()

    expect(
      await screen.findByTestId('scene-editor-link-pending')
    ).toBeInTheDocument()
    expect(screen.getByTestId('scene-editor-undo')).toBeDisabled()
  })

  // ---- slot writes and the link, in both directions -------------------------

  it('refuses a rejection submitted with ENTER while a link is pending', async () => {
    // The reason box submits on Enter, and that path never consulted `busy` - it
    // went straight to the server carrying baseRevision, which is the number the
    // link is in the middle of replacing. Disabling the Reject BUTTON did nothing
    // about it.
    scenes.getSceneSlots.mockResolvedValue(slotsWithOneCandidate() as never)
    await open()

    // Open the "none of these" form BEFORE the link starts, so the form is
    // already on screen when the hold appears - which is the situation.
    await userEvent.click(screen.getByTestId('scene-choices-none-sofa'))
    const reason = screen.getByLabelText('Why none of these work')
    await userEvent.type(reason, 'too modern')

    pendingLink()
    await startLink()

    await userEvent.type(reason, '{Enter}')

    expect(scenes.rejectSceneCandidates).not.toHaveBeenCalled()
  })

  it('refuses a rejection submitted with ENTER while another slot write is in flight', async () => {
    // The same guard, without a link involved: two slot writes both carrying the
    // same baseRevision means whichever lands second comes back as a conflict the
    // user could not have caused. The reason box stays open across the other
    // write, and Enter in it went straight to the server.
    scenes.getSceneSlots.mockResolvedValue(slotsWithOneCandidate() as never)
    scenes.resolveSceneSlot.mockReturnValue(new Promise(() => {}) as never)
    await open()

    await userEvent.click(screen.getByTestId('scene-choices-none-sofa'))
    const reason = screen.getByLabelText('Why none of these work')
    await userEvent.type(reason, 'too modern')

    // A different write on the same slot starts and does not finish.
    await userEvent.click(screen.getByTestId('scene-choices-choose-sofa/a'))
    await waitFor(() => expect(scenes.resolveSceneSlot).toHaveBeenCalled())

    await userEvent.type(reason, '{Enter}')

    expect(scenes.rejectSceneCandidates).not.toHaveBeenCalled()
  })

  it('refuses a SAVE while a slot write is in flight', async () => {
    // The save carries baseRevision too, and this overlap is reachable: choose a
    // candidate (which needs a CLEAN draft), then edit while that write is still
    // outstanding, then save. Two writes against the same revision, and whichever
    // lands second comes back as a conflict the user could not have caused.
    scenes.getSceneSlots.mockResolvedValue(slotsWithOneCandidate() as never)
    scenes.resolveSceneSlot.mockReturnValue(new Promise(() => {}) as never)
    await open()

    await userEvent.click(screen.getByTestId('scene-choices-choose-sofa/a'))
    await waitFor(() => expect(scenes.resolveSceneSlot).toHaveBeenCalled())

    // Now dirty the draft, with the slot write still in flight.
    useSceneEditorStore.getState().setNodeTransform('crate', {
      position: { x: 5, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    })

    await userEvent.click(screen.getByTestId('scene-editor-save'), {
      pointerEventsCheck: 0,
    })

    expect(scenes.updateSceneDocument).not.toHaveBeenCalled()
  })

  it('refuses to start a link while a slot write is in flight', async () => {
    // The other direction. Linking moves the revision the pending write is using,
    // so it has to wait for it - previously only the reverse was covered.
    scenes.getSceneSlots.mockResolvedValue(slotsWithOneCandidate() as never)
    scenes.resolveSceneSlot.mockReturnValue(new Promise(() => {}) as never)
    await open()

    await userEvent.click(screen.getByTestId('scene-choices-choose-sofa/a'))
    await waitFor(() => expect(scenes.resolveSceneSlot).toHaveBeenCalled())

    await userEvent.click(screen.getByTestId('scene-project-chip'))
    expect(screen.getByTestId('scene-project-blocked')).toHaveTextContent(
      /Wait for the change being saved/i
    )

    await userEvent.click(screen.getByTestId('scene-project-select'), {
      pointerEventsCheck: 0,
    })
    const option = screen.queryByText('Rooftop chase')
    if (option) {
      await userEvent.click(option, { pointerEventsCheck: 0 })
    }

    expect(scenes.setSceneProject).not.toHaveBeenCalled()
  })
})
