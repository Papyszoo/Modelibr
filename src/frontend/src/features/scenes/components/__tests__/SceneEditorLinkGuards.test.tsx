import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { useSceneEditorStore } from '@/stores'
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
    useSceneEditorStore.getState().open(2, sceneView().document, REVISION)

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

  it('leaves no permanent hold when the link FAILS', async () => {
    // The other way out. A refused link invalidates nothing, so nothing arrives
    // to release a hold that waits for a refetch - the editor was read-only for
    // the rest of the session.
    await open()
    editThenSave()

    const link = pendingLink()
    await startLink()

    link.reject(new Error('nope'))

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
})
