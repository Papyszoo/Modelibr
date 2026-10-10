import './SceneEditor.css'

import { Button } from 'primereact/button'
import { Message } from 'primereact/message'
import { SelectButton } from 'primereact/selectbutton'
import { type JSX, useCallback, useEffect, useMemo, useRef } from 'react'

import { ApiClientError } from '@/lib/apiBase'
import { ErrorState, ListHeader, LoadingState } from '@/shared/components'
import { useSceneEditorStore } from '@/stores'
import type { SceneSlotPreview } from '@/stores/sceneEditorStore'

import {
  SceneWriteHeldError,
  useAcceptSceneRecommendationsMutation,
  useRejectSceneCandidatesMutation,
  useResolveSceneSlotMutation,
  useSaveSceneDocumentMutation,
  useSceneByIdQuery,
  useSceneSlotsQuery,
} from '../api/queries'
import { SCENE_STAGES, type SceneStage } from '../api/sceneContract.generated'
import { getSceneAssetFacts } from '../api/scenesApi'
import { useProjectLinkSerialization } from '../hooks/useProjectLinkSerialization'
import { useSceneMaterials } from '../hooks/useSceneMaterials'
import { bindNodeMaterial } from '../lib/sceneDressing'
import { transformsEqual } from '../lib/sceneGeometry'
import { buildSceneNodeFacts } from '../lib/sceneNodeFacts'
import { nextLightId, nextNodeId, nextPlacementX } from '../lib/sceneNodeIds'
import type {
  SceneDocument,
  SceneLight,
  SceneMaterialBinding,
  SceneNode,
  SceneSlotView,
  SceneTransform,
} from '../types'
import { SceneAssetPicker } from './SceneAssetPicker'
import { SceneCanvas } from './SceneCanvas'
import { SceneChoicesPanel } from './SceneChoicesPanel'
import { SceneHierarchy } from './SceneHierarchy'
import { SceneNodeAnimation } from './SceneNodeAnimation'
import { SceneNodeMaterials } from './SceneNodeMaterials'
import { SceneProjectBrief } from './SceneProjectBrief'
import { ScenePropertyPanel } from './ScenePropertyPanel'

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0 }
const UNIT_SCALE = { x: 1, y: 1, z: 1 }

// Stable empty references for a scene whose draft has not been seeded yet, so a
// bare `?? []` / `?? new Map()` does not hand every render a fresh identity.
const EMPTY_HISTORY: SceneDocument[] = []
const EMPTY_FAILURES: Map<string, string> = new Map()

/**
 * The stage picker's options, plus the "not authored in stages" default every
 * scene written before stages existed still sits in. Offered rather than
 * hidden: an unstaged scene is judged against everything at once, which is a
 * legitimate way to work and the only way that existed until now.
 */
const STAGE_OPTIONS: { label: string; value: SceneStage | 'none' }[] = [
  { label: 'Unstaged', value: 'none' },
  ...SCENE_STAGES.map(stage => ({
    label: stage.charAt(0).toUpperCase() + stage.slice(1),
    value: stage,
  })),
]

interface SceneEditorProps {
  sceneId: number
  /**
   * Focuses the Scenes list. This is a navigation, not a close: the editor stays
   * open with its draft, because the alternative - a Back button that closes the
   * tab - is how an unsaved scene disappears.
   */
  onShowSceneList: () => void
  /**
   * Publishes the save so the tab's close guard can run it for "Save and close".
   * Called on every render; the caller stores it in a ref.
   */
  registerSave: (save: () => Promise<boolean>) => void
  /**
   * Reports the scene's current name, so the tab can be relabelled in place.
   *
   * Driven by the fetched name rather than by a rename control on purpose: a scene
   * can also be renamed from the list or by an agent over MCP, and a tab that
   * only relabelled on its own control would keep the old name after either.
   */
  onSceneNameChange?: (name: string) => void
  /** Explicitly abandons this scene: the tab caller forgets the session and closes. */
  onClose: () => void
}

export function SceneEditor({
  sceneId,
  onShowSceneList,
  registerSave,
  onSceneNameChange,
  onClose,
}: SceneEditorProps): JSX.Element {
  const {
    data: view,
    isLoading,
    isFetching: sceneFetching,
    isError: sceneErrored,
    dataUpdatedAt: sceneUpdatedAt,
    errorUpdatedAt: sceneErrorAt,
    refetch: refetchScene,
    error,
  } = useSceneByIdQuery({ sceneId })
  const { data: slotsView, isLoading: slotsLoading } = useSceneSlotsQuery({
    sceneId,
  })
  const save = useSaveSceneDocumentMutation()
  const resolveSlot = useResolveSceneSlotMutation()
  const rejectCandidates = useRejectSceneCandidatesMutation()
  const acceptRecommendations = useAcceptSceneRecommendationsMutation()

  // Every read and write below is scoped to THIS tab's scene. The store's flat
  // fields are a projection of whichever scene opened last, so with two scene
  // tabs in split view reading them showed one tab's document in the other and
  // writing through the shared projection landed edits in the wrong scene.
  const sceneDraft = useSceneEditorStore(state => state.drafts[sceneId])

  const {
    open,
    markSaved: markSavedDraft,
    edit: editDraft,
    undo: undoDraft,
    redo: redoDraft,
    selectNode: selectNodeDraft,
    setNodeTransform: setNodeTransformDraft,
    updateNode: updateNodeDraft,
    removeNode: removeNodeDraft,
    addNode: addNodeDraft,
    setLight: setLightDraft,
    setSaveError: setSaveErrorDraft,
    setPlaceError: setPlaceErrorDraft,
    setSlotError: setSlotErrorDraft,
    setPreview: setPreviewDraft,
    setIsPlacing: setIsPlacingDraft,
    setBlockoutOverride: setBlockoutOverrideDraft,
    recordNodeFailure: recordNodeFailureDraft,
    clearNodeFailure: clearNodeFailureDraft,
  } = useSceneEditorStore()

  const document = sceneDraft?.document ?? null
  const baseRevision = sceneDraft?.baseRevision ?? null
  const isDirty = sceneDraft?.isDirty ?? false
  const selectedNodeId = sceneDraft?.selectedNodeId ?? null
  const past = sceneDraft?.past ?? EMPTY_HISTORY
  const future = sceneDraft?.future ?? EMPTY_HISTORY
  const saveError = sceneDraft?.saveError ?? null
  const placeError = sceneDraft?.placeError ?? null
  const slotError = sceneDraft?.slotError ?? null
  const preview = sceneDraft?.preview ?? null
  const isPlacing = sceneDraft?.isPlacing ?? false
  const failedNodes = sceneDraft?.failedNodes ?? EMPTY_FAILURES
  const blockoutOverride = sceneDraft?.blockoutOverride ?? null

  // Scene-bound setters, so every call site below writes this tab's draft
  // without repeating the id - and cannot forget it.
  const setSaveError = useCallback(
    (message: string | null) => setSaveErrorDraft(message, sceneId),
    [setSaveErrorDraft, sceneId]
  )
  const setPlaceError = useCallback(
    (message: string | null) => setPlaceErrorDraft(message, sceneId),
    [setPlaceErrorDraft, sceneId]
  )
  const setSlotError = useCallback(
    (message: string | null) => setSlotErrorDraft(message, sceneId),
    [setSlotErrorDraft, sceneId]
  )
  const setPreview = useCallback(
    (next: SceneSlotPreview | null) => setPreviewDraft(next, sceneId),
    [setPreviewDraft, sceneId]
  )
  const setIsPlacing = useCallback(
    (next: boolean) => setIsPlacingDraft(next, sceneId),
    [setIsPlacingDraft, sceneId]
  )
  const setBlockoutOverride = useCallback(
    (next: boolean | null) => setBlockoutOverrideDraft(next, sceneId),
    [setBlockoutOverrideDraft, sceneId]
  )
  const selectNode = useCallback(
    (nodeId: string | null) => selectNodeDraft(nodeId, sceneId),
    [selectNodeDraft, sceneId]
  )
  const recordNodeFailure = useCallback(
    (nodeId: string, message: string) =>
      recordNodeFailureDraft(nodeId, message, sceneId),
    [recordNodeFailureDraft, sceneId]
  )
  const clearNodeFailure = useCallback(
    (nodeId: string) => clearNodeFailureDraft(nodeId, sceneId),
    [clearNodeFailureDraft, sceneId]
  )
  const markSaved = useCallback(
    (revision: number, savedDocument: SceneDocument) =>
      markSavedDraft(revision, savedDocument, sceneId),
    [markSavedDraft, sceneId]
  )

  // Editing is held while a direct scene write is moving the scene's revision -
  // the project link and every slot write alike. The hold belongs to the SCENE,
  // not to this component: it survives a tab switch and a remount, and it ends
  // only on authoritative data that the draft is actually sitting on. The
  // reasoning is in the hook and in `sceneLinkHoldStore`.
  const { editsBlocked } = useProjectLinkSerialization({
    sceneId,
    loadedRevision: view?.scene.revision,
    baseRevision,
    isFetching: sceneFetching,
    isError: sceneErrored,
    dataUpdatedAt: sceneUpdatedAt,
    errorUpdatedAt: sceneErrorAt,
    refetch: refetchScene,
  })

  // Every guard reads through this, so a callback built before the hold began
  // still sees the hold when it finally runs. Assigned during render rather than
  // in an effect: an effect would leave the ref a render behind, which is
  // exactly the window a placement finishes in.
  const editsBlockedRef = useRef(editsBlocked)
  editsBlockedRef.current = editsBlocked

  // One guard, applied where the draft actions enter this component, so every
  // call site inherits it rather than each one remembering to ask. Wrapped with
  // useCallback because these identities are dependencies of the handlers below.
  const setNodeTransformAction = useCallback(
    (nodeId: string, transform: SceneTransform) =>
      setNodeTransformDraft(nodeId, transform, sceneId),
    [setNodeTransformDraft, sceneId]
  )
  const updateNodeAction = useCallback(
    (nodeId: string, patch: Partial<SceneNode>) =>
      updateNodeDraft(nodeId, patch, sceneId),
    [updateNodeDraft, sceneId]
  )
  const removeNodeAction = useCallback(
    (nodeId: string) => removeNodeDraft(nodeId, sceneId),
    [removeNodeDraft, sceneId]
  )
  const addNodeAction = useCallback(
    (node: SceneNode) => addNodeDraft(node, sceneId),
    [addNodeDraft, sceneId]
  )
  const setLightAction = useCallback(
    (light: SceneLight) => setLightDraft(light, sceneId),
    [setLightDraft, sceneId]
  )
  const editAction = useCallback(
    (mutate: (current: SceneDocument) => SceneDocument) =>
      editDraft(mutate, sceneId),
    [editDraft, sceneId]
  )
  const undoAction = useCallback(() => undoDraft(sceneId), [undoDraft, sceneId])
  const redoAction = useCallback(() => redoDraft(sceneId), [redoDraft, sceneId])

  const setNodeTransform = useGuardedEdit(
    setNodeTransformAction,
    editsBlockedRef
  )
  const updateNode = useGuardedEdit(updateNodeAction, editsBlockedRef)
  const removeNode = useGuardedEdit(removeNodeAction, editsBlockedRef)
  const addNode = useGuardedEdit(addNodeAction, editsBlockedRef)
  const setLight = useGuardedEdit(setLightAction, editsBlockedRef)
  const edit = useGuardedEdit(editAction, editsBlockedRef)

  // Undo and redo are draft writes like any other, and were reaching the store
  // raw. Rolling the draft back mid-link leaves it dirty at the old revision -
  // the same stale-revision conflict every other edit is held for, arrived at
  // through the one pair of actions that skipped the gate.
  const undo = useGuardedEdit(undoAction, editsBlockedRef)
  const redo = useGuardedEdit(redoAction, editsBlockedRef)

  const handleNodeLoadError = useCallback(
    (nodeId: string, message: string) => {
      recordNodeFailure(nodeId, message)
    },
    [recordNodeFailure]
  )

  // A node whose resource arrived is no longer failed. Without this the flag
  // from a first load attempt survived a successful retry (a swapped asset, a
  // late auxiliary file) until the whole draft was reseeded, so the hierarchy
  // kept marking a node that was drawing fine.
  const handleNodeLoadSettled = useCallback(
    (nodeId: string, loaded: boolean) => {
      if (loaded) {
        clearNodeFailure(nodeId)
      }
    },
    [clearNodeFailure]
  )

  // The draft is seeded once per (scene, revision): re-seeding on every render
  // of a fetched query would throw away the user's unsaved edits each time
  // React Query refetched in the background. It is also what makes remounting
  // free - coming back from another tab finds the draft already at this
  // revision, so nothing is re-seeded and nothing is lost.
  const loadedRevision = view?.scene.revision
  useEffect(() => {
    if (!view) {
      return
    }
    // Read THIS scene's draft, not the flat projection: the flat fields belong
    // to whichever scene opened last, and with two tabs open a reseed decided
    // from another scene's revision either skipped this one or clobbered it.
    const stored = useSceneEditorStore.getState().drafts[sceneId]
    const storedRevision = stored?.baseRevision ?? null
    const storedDirty = stored?.isDirty ?? false
    if (storedRevision === null || loadedRevision !== storedRevision) {
      if (!storedDirty) {
        open(sceneId, view.document, view.scene.revision)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, loadedRevision])

  const nodeFacts = useMemo(() => buildSceneNodeFacts(view), [view])

  // What dresses each node, resolved from ids to names. The canvas resolves the
  // same bindings to render them, through the same query keys, so the panel
  // costs no extra request.
  const dressingByNode = useSceneMaterials(document)

  const slots = useMemo(() => slotsView?.slots ?? [], [slotsView])

  // Every slot nobody has settled, so the viewport can mark the nodes standing
  // in for a decision that has not been made.
  const undecidedNodeIds = useMemo(
    () =>
      new Set(
        slots
          .filter(slot => slot.status !== 'chosen' && slot.nodeId)
          .map(slot => slot.nodeId as string)
      ),
    [slots]
  )

  /**
   * The draft with the previewed candidate swapped in, for the canvas only.
   *
   * The swap follows the same rule the server applies when a candidate is
   * actually chosen - the candidate is the whole answer for its slot - so what
   * the user is looking at is what they would get, rather than a preview that
   * flatters the proposal.
   */
  const canvasDocument = useMemo(() => {
    if (!document || !preview) {
      return document
    }

    const slot = slots.find(entry => entry.slotId === preview.slotId)
    const candidate = slot?.candidates.find(
      entry => entry.id === preview.candidateId
    )
    if (!slot?.nodeId || !candidate) {
      return document
    }

    return {
      ...document,
      nodes: document.nodes.map(node =>
        node.id === slot.nodeId
          ? {
              ...node,
              asset: candidate.asset ?? node.asset,
              material: candidate.material ?? null,
            }
          : node
      ),
    }
  }, [document, preview, slots])

  const handlePreviewCandidate = useCallback(
    (slot: SceneSlotView, candidateRef: string, candidateId: string) => {
      // Toggling: previewing the candidate the viewport already shows clears it.
      // Read through the store rather than an updater, because the write is a
      // session field and the value it compares against is the same session's.
      setPreview(
        preview?.ref === candidateRef
          ? null
          : { slotId: slot.slotId, candidateId, ref: candidateRef }
      )
      if (slot.nodeId) {
        selectNode(slot.nodeId)
      }
    },
    [preview, selectNode, setPreview]
  )

  /**
   * Slot writes go straight to the server, unlike everything else in this
   * editor, because a choice is not a local edit: it is what the agent reads
   * back through `get_slots` and what the audit log records as a decision a
   * person made. They are refused while the draft is dirty rather than merged -
   * a slot write moves the scene's revision, and merging it into an unsaved
   * draft would silently discard one of the two.
   */
  //
  // And held for any OTHER direct write for the same reason the save is: a slot
  // write carries baseRevision, and a link - or another slot write - is in the
  // middle of replacing it. Sending one into that window is the conflict, not a
  // way around it. `editsBlocked` covers both now, because the writes and the
  // link share one hold.
  const slotsBlocked =
    editsBlocked ??
    (isDirty
      ? 'Save your edits before choosing - a choice is written to the scene straight away.'
      : null)

  // The remaining `isPending` gate, which is now only about the SAVE.
  //
  // The slot writes hold the scene for their whole window, response through
  // reseed, so `editsBlocked` already covers them - this used to be the only
  // thing that did, and it went false a refetch too early. The save is a
  // different shape: its response IS the new revision and it seeds the cache
  // with it directly, so it needs no reconciliation, only an exclusion.
  const sceneWritePending =
    resolveSlot.isPending ||
    rejectCandidates.isPending ||
    acceptRecommendations.isPending ||
    save.isPending

  // Read through a ref for the same reason the edit guard is: a handler built
  // before a write started still has to see it when it finally runs.
  const slotsBlockedRef = useRef(slotsBlocked)
  slotsBlockedRef.current = slotsBlocked
  const sceneWritePendingRef = useRef(sceneWritePending)
  sceneWritePendingRef.current = sceneWritePending

  /**
   * Runs one slot write, refusing outright if anything says it must not happen.
   *
   * The check is HERE rather than only on the buttons. The panel disables its
   * controls while a write is in flight, but the rejection form also submits on
   * Enter, and that path went straight to the server: an open reason box plus a
   * project link starting behind it was two writes racing for one revision, and
   * whichever lost came back as a conflict the user could not have caused.
   */
  const runSlotWrite = useCallback(
    async (write: () => Promise<unknown>) => {
      if (slotsBlockedRef.current !== null) {
        setSlotError(slotsBlockedRef.current)
        return
      }
      if (sceneWritePendingRef.current) {
        setSlotError(
          'Another change to this scene is still being saved. Wait for it to finish - both would be written against the same revision.'
        )
        return
      }

      setSlotError(null)
      try {
        await write()
        setPreview(null)
      } catch (caught) {
        setSlotError(
          caught instanceof ApiClientError ||
            caught instanceof SceneWriteHeldError
            ? caught.message
            : 'The choice could not be saved.'
        )
      }
    },
    [setPreview, setSlotError]
  )

  const selectedNode =
    document?.nodes.find(node => node.id === selectedNodeId) ?? null
  const selectedFacts = selectedNodeId
    ? (nodeFacts.get(selectedNodeId) ?? null)
    : null

  // The server computed groundOffset against the transform it last saw. Once
  // the node has moved locally that number describes a position the node is no
  // longer in, so the action is withheld until the next save rather than
  // applying an offset that would put the node somewhere neither the user nor
  // the server asked for.
  const groundOffset =
    selectedFacts &&
    transformsEqual(selectedFacts.transform, selectedNode?.transform)
      ? selectedFacts.groundOffset
      : null

  /**
   * Places a library model into the draft.
   *
   * The asset's facts are fetched first so the node lands resting on the ground
   * rather than half-buried - the server computes that height with the same
   * code its own `place_asset` uses, so a hand-placed node and an agent-placed
   * one end up in the same spot.
   */
  const handlePlaceModel = useCallback(
    async (model: { id: string; name: string }, versionId: number) => {
      const current =
        useSceneEditorStore.getState().drafts[sceneId]?.document ?? null
      if (!current) {
        return
      }

      if (editsBlockedRef.current) {
        setPlaceError(editsBlockedRef.current)
        return
      }

      const assetId = Number(model.id)
      setPlaceError(null)
      setIsPlacing(true)

      let groundedY = 0
      let width: number | null = null
      try {
        const facts = await getSceneAssetFacts({
          assetType: 'Model',
          assetId,
          versionId,
        })
        groundedY = facts.groundedYAtOrigin ?? 0
        width = facts.sourceDimensions?.x ?? null
      } catch (caught) {
        // Bounds are advisory: an asset that has never been extracted still
        // places, at y=0, and the panel reports its bounds as unknown. Refusing
        // the placement would make an un-extracted library unusable by hand.
        setPlaceError(
          caught instanceof ApiClientError
            ? `Placed without bounds: ${caught.message}`
            : 'Placed without bounds - this asset has no derived size yet.'
        )
      } finally {
        setIsPlacing(false)
      }

      // The fetch above is a real round trip, and a link can begin during it.
      // `addNode` would refuse on its own now, but silently - and a placement
      // that vanishes without a word is worse than one that says why.
      if (editsBlockedRef.current) {
        setPlaceError(editsBlockedRef.current)
        return
      }

      const nodeId = nextNodeId(current, `model-${assetId}`)
      addNode({
        id: nodeId,
        name: model.name,
        transform: {
          position: { x: nextPlacementX(current, width), y: groundedY, z: 0 },
          rotationEuler: IDENTITY_ROTATION,
          scale: UNIT_SCALE,
        },
        asset: { assetType: 'Model', assetId, versionId },
        visible: true,
      })
      selectNode(nodeId)
    },
    [addNode, selectNode, sceneId, setIsPlacing, setPlaceError]
  )

  /**
   * Dresses the selected node, or clears a slot.
   *
   * The binding lands in the draft document rather than going straight to
   * `PUT /scenes/{id}/material`: dressing then undoes with Ctrl+Z like every
   * other edit, and one save carries it with whatever else the user changed.
   * The patch is computed by the same rules the server applies, so a node
   * dressed here and one dressed by `apply_material` are the same document.
   */
  const handleBindMaterial = useCallback(
    (slot: string | null, binding: SceneMaterialBinding | null) => {
      const own = useSceneEditorStore.getState().drafts[sceneId]
      const nodeId = own?.selectedNodeId ?? null
      const current = own?.document?.nodes.find(node => node.id === nodeId)
      if (!nodeId || !current) {
        return
      }

      updateNode(nodeId, bindNodeMaterial(current, slot, binding))
    },
    [updateNode, sceneId]
  )

  const handleAddPrimitive = useCallback(() => {
    const current =
      useSceneEditorStore.getState().drafts[sceneId]?.document ?? null
    if (!current) {
      return
    }

    const nodeId = nextNodeId(current, 'box')
    addNode({
      id: nodeId,
      name: 'Blockout box',
      transform: {
        // Primitives are authored centered, so half its height puts it on the
        // floor - the same offset the server's footprint uses for them.
        position: { x: nextPlacementX(current, 1), y: 0.5, z: 0 },
        rotationEuler: IDENTITY_ROTATION,
        scale: UNIT_SCALE,
      },
      primitive: { shape: 'box', size: { x: 1, y: 1, z: 1 } },
      visible: true,
    })
    selectNode(nodeId)
  }, [addNode, selectNode, sceneId])

  const handleAddLight = useCallback(() => {
    const current =
      useSceneEditorStore.getState().drafts[sceneId]?.document ?? null
    if (!current) {
      return
    }

    setLight({
      id: nextLightId(current, 'light'),
      type: 'directional',
      position: { x: 6, y: 10, z: 6 },
      intensity: 1.1,
      color: '#ffffff',
      name: 'Key light',
    })
  }, [setLight, sceneId])

  const handleSave = useCallback(async () => {
    if (!document || baseRevision === null) {
      return
    }

    // Held while a link is moving the revision: this save carries baseRevision,
    // and sending it against a revision the link has already replaced is the
    // conflict rather than a way of avoiding one.
    if (editsBlocked) {
      setSaveError(editsBlocked)
      return
    }

    // And held for the slot writes, which carry the same number. The save button
    // is disabled while one is in flight, but the chord and any programmatic
    // caller are not - and the exclusion is a rule about the write.
    if (sceneWritePendingRef.current) {
      setSaveError(
        'Another change to this scene is still being saved. Wait for it to finish - both would be written against the same revision.'
      )
      return
    }

    setSaveError(null)
    try {
      const saved = await save.mutateAsync({
        sceneId,
        document,
        expectedRevision: baseRevision,
      })
      // The document that was actually sent, so edits made while the request
      // was in flight stay dirty instead of being marked saved unsent.
      markSaved(saved.scene.revision, document)
    } catch (caught) {
      // The server rejects an invalid document in full and says why, per
      // problem. Surfacing that verbatim is the point: the alternative this
      // replaces silently swapped in an empty scene.
      setSaveError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The scene could not be saved.'
      )
    }
  }, [
    document,
    baseRevision,
    sceneId,
    save,
    markSaved,
    editsBlocked,
    setSaveError,
  ])

  // handleSave is what Save does; the close guard needs the same code path to
  // answer whether the save actually landed, so it is published rather than
  // duplicated.
  const saveAndReport = useCallback(async (): Promise<boolean> => {
    await handleSave()
    const state = useSceneEditorStore.getState()
    const error =
      state.drafts[sceneId]?.saveError ??
      (state.sceneId === sceneId ? state.saveError : null)
    return !error
  }, [handleSave, sceneId])

  /*
   * Both publishers go through refs on purpose.
   *
   * The tab passes these as inline arrows, so their identity changes on every
   * render. An effect that depended on that identity would re-run every render,
   * and since relabelling the tab writes to the navigation store, the tab would
   * re-render, the arrow would be new again, and the loop would take the whole
   * app down with it. The refs make the effect depend on the VALUE that matters
   * instead: the name, and the save function.
   */
  const registerSaveRef = useRef(registerSave)
  registerSaveRef.current = registerSave
  useEffect(() => {
    registerSaveRef.current(saveAndReport)
  }, [saveAndReport])

  const onSceneNameChangeRef = useRef(onSceneNameChange)
  onSceneNameChangeRef.current = onSceneNameChange
  useEffect(() => {
    if (view?.scene.name) {
      onSceneNameChangeRef.current?.(view.scene.name)
    }
  }, [view?.scene.name])

  // Undo/redo on the usual chord. Scoped to the editor being mounted, and
  // ignored while a text field has focus so typing in the name box does not
  // roll back a placement.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'z'
      ) {
        return
      }

      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      event.preventDefault()
      if (event.shiftKey) {
        redo()
      } else {
        undo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  if (isLoading) {
    return <LoadingState message="Loading scene…" />
  }

  if (error || !view) {
    // A scene deleted while its tab was open is a normal outcome, not a crash:
    // the tab is still here, and the honest thing is to say what happened and
    // offer the two ways out. Throwing the whole tab layout away for one missing
    // scene would be the worse answer.
    const missing =
      error instanceof ApiClientError &&
      (error.status === 404 ||
        error.message.toLowerCase().includes('not found'))
    return (
      <ErrorState
        title={
          missing
            ? 'This scene no longer exists'
            : 'This scene could not be opened'
        }
        message={
          missing
            ? 'It was deleted while this tab was open. The tab can be closed, and the rest of your workspace is untouched.'
            : error instanceof ApiClientError
              ? error.message
              : 'The scene could not be loaded.'
        }
        action={
          <div className="scene-editor-missing-actions">
            <Button
              label="Scenes"
              icon="pi pi-arrow-left"
              size="small"
              onClick={onShowSceneList}
            />
            <Button
              label="Close tab"
              icon="pi pi-times"
              size="small"
              severity="secondary"
              outlined
              onClick={onClose}
            />
          </div>
        }
      />
    )
  }

  if (!document) {
    return <LoadingState message="Preparing editor…" />
  }

  const canUndo = past.length > 0
  const canRedo = future.length > 0
  const stage = document.stage ?? null
  const blockout = blockoutOverride ?? stage === 'layout'

  /**
   * The stage is a field of the document, so changing it is an ordinary edit
   * that the next save carries. That is deliberate: the save then goes through
   * the same gate an agent's `set_scene_stage` does, and a scene with something
   * floating is refused with the server's own explanation rather than by a
   * second rule written here.
   */
  const setStage = (next: SceneStage | 'none') =>
    edit(current => ({ ...current, stage: next === 'none' ? null : next }))

  return (
    <div className="scene-editor" data-testid="scene-editor">
      <ListHeader
        variant="tab"
        className="scene-editor-header"
        title={
          <span className="scene-editor-title">
            <Button
              icon="pi pi-arrow-left"
              text
              rounded
              size="small"
              aria-label="Scenes"
              tooltip="Scenes"
              onClick={onShowSceneList}
            />
            {view.scene.name}
            <SceneProjectBrief
              sceneId={sceneId}
              projectId={view.scene.projectId}
              projectName={view.scene.projectName}
              blocked={
                // The other direction of the exclusion, and it has three reasons
                // rather than one. A dirty draft was the only one covered: a
                // link starting while an accept/reject/resolve or a save is
                // still in flight races the very revision that write carries,
                // and a link starting while any earlier write is still being
                // reconciled would stack two unresolved writes on one scene.
                // The last of those is `editsBlocked` - the shared hold - and
                // the store refuses the second claim even if this misses it.
                editsBlocked ??
                (sceneWritePending
                  ? 'Wait for the change being saved to finish - linking moves the revision that write is using.'
                  : isDirty
                    ? 'Save your edits before changing the project - linking is written to the scene straight away, and your unsaved draft could not be saved afterwards.'
                    : null)
              }
            />
          </span>
        }
        stats={[
          { icon: 'pi-box', label: `${document.nodes.length} nodes` },
          { icon: 'pi-sun', label: `${document.lights.length} lights` },
          { icon: 'pi-history', label: `rev ${baseRevision}` },
        ]}
        actions={
          <div className="scene-editor-actions">
            <SelectButton
              className="scene-editor-stage"
              value={stage ?? 'none'}
              options={STAGE_OPTIONS}
              data-testid="scene-editor-stage"
              aria-label="Scene stage"
              onChange={event => {
                // PrimeReact reports a click on the already-selected option as
                // null. Ignoring it keeps the control from silently unstaging a
                // scene the user only meant to re-confirm.
                if (event.value != null) {
                  setStage(event.value as SceneStage | 'none')
                }
              }}
            />
            <Button
              icon="pi pi-clone"
              text={!blockout}
              size="small"
              aria-label="Blockout view"
              data-testid="scene-editor-blockout"
              aria-pressed={blockout}
              tooltip="Blockout view - draw every node as its volume"
              onClick={() => setBlockoutOverride(!blockout)}
            />
            <Button
              icon="pi pi-undo"
              text
              size="small"
              aria-label="Undo"
              data-testid="scene-editor-undo"
              tooltip="Undo (Ctrl+Z)"
              disabled={!canUndo || editsBlocked !== null}
              onClick={undo}
            />
            <Button
              icon="pi pi-refresh"
              text
              size="small"
              aria-label="Redo"
              tooltip="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo || editsBlocked !== null}
              onClick={redo}
            />
            <Button
              data-testid="scene-editor-save"
              label={isDirty ? 'Save' : 'Saved'}
              icon={isDirty ? 'pi pi-save' : 'pi pi-check'}
              size="small"
              loading={save.isPending}
              disabled={!isDirty || save.isPending || editsBlocked !== null}
              onClick={() => void handleSave()}
            />
          </div>
        }
      />

      {editsBlocked ? (
        <Message
          severity="info"
          text={editsBlocked}
          className="scene-editor-message"
          data-testid="scene-editor-link-pending"
        />
      ) : null}

      {saveError ? (
        <Message
          severity="error"
          text={saveError}
          className="scene-editor-message"
        />
      ) : null}

      {placeError ? (
        <Message
          severity="warn"
          text={placeError}
          className="scene-editor-message"
          data-testid="scene-editor-place-error"
        />
      ) : null}

      {slotError ? (
        <Message
          severity="error"
          text={slotError}
          className="scene-editor-message"
        />
      ) : null}

      <div className="scene-editor-body">
        <aside className="scene-editor-side">
          <SceneAssetPicker
            disabled={isPlacing || editsBlocked !== null}
            onPlace={(model, versionId) =>
              void handlePlaceModel(model, versionId)
            }
          />

          <div className="scene-editor-add-row">
            <Button
              label="Blockout box"
              icon="pi pi-stop"
              size="small"
              outlined
              onClick={handleAddPrimitive}
            />
            <Button
              label="Light"
              icon="pi pi-sun"
              size="small"
              outlined
              onClick={handleAddLight}
            />
          </div>

          <SceneHierarchy
            document={document}
            nodeFacts={nodeFacts}
            failedNodes={failedNodes}
            overlaps={view.overlaps}
            selectedNodeId={selectedNodeId}
            onSelectNode={selectNode}
            onToggleVisible={(nodeId, visible) =>
              updateNode(nodeId, { visible })
            }
            onRemoveNode={removeNode}
          />
        </aside>

        <SceneCanvas
          document={canvasDocument ?? document}
          nodeFacts={nodeFacts}
          selectedNodeId={selectedNodeId}
          onSelectNode={selectNode}
          onNodeLoadError={handleNodeLoadError}
          onNodeLoadSettled={handleNodeLoadSettled}
          blockout={blockout}
          undecidedNodeIds={undecidedNodeIds}
        />

        <aside className="scene-editor-side scene-editor-side--right">
          <SceneChoicesPanel
            slots={slots}
            isLoading={slotsLoading}
            sceneDescription={view?.scene.description ?? null}
            recommendationSummary={slotsView?.recommendationSummary ?? null}
            previewRef={preview?.ref ?? null}
            busySlotId={
              resolveSlot.isPending || rejectCandidates.isPending
                ? (resolveSlot.variables?.slotId ??
                  rejectCandidates.variables?.slotId ??
                  null)
                : null
            }
            acceptBusy={acceptRecommendations.isPending}
            onAcceptRecommendations={choices =>
              void runSlotWrite(() =>
                acceptRecommendations.mutateAsync({
                  sceneId,
                  choices,
                  expectedRevision: baseRevision ?? undefined,
                })
              )
            }
            blocked={slotsBlocked}
            onPreview={(slot, candidate) =>
              handlePreviewCandidate(slot, candidate.ref, candidate.id)
            }
            onChoose={(slotId, candidateId) =>
              void runSlotWrite(() =>
                resolveSlot.mutateAsync({
                  sceneId,
                  slotId,
                  candidateId,
                  expectedRevision: baseRevision ?? undefined,
                })
              )
            }
            onReject={(slotId, candidateIds, reason) =>
              void runSlotWrite(() =>
                rejectCandidates.mutateAsync({
                  sceneId,
                  slotId,
                  candidateIds,
                  reason,
                  expectedRevision: baseRevision ?? undefined,
                })
              )
            }
            onRejectAll={(slotId, reason) =>
              void runSlotWrite(() =>
                rejectCandidates.mutateAsync({
                  sceneId,
                  slotId,
                  reason,
                  all: true,
                  expectedRevision: baseRevision ?? undefined,
                })
              )
            }
            onReopen={slotId =>
              void runSlotWrite(() =>
                resolveSlot.mutateAsync({
                  sceneId,
                  slotId,
                  clear: true,
                  expectedRevision: baseRevision ?? undefined,
                })
              )
            }
          />

          <ScenePropertyPanel
            node={selectedNode}
            facts={selectedFacts}
            warnings={view.scaleWarnings.filter(
              warning => warning.nodeId === selectedNodeId
            )}
            onChangeTransform={transform => {
              if (selectedNodeId) {
                setNodeTransform(selectedNodeId, transform)
              }
            }}
            onRename={name => {
              if (selectedNodeId) {
                updateNode(selectedNodeId, { name: name || null })
              }
            }}
            groundOffset={groundOffset}
            onGroundSnap={() => {
              if (!selectedNodeId || !selectedNode || groundOffset == null) {
                return
              }

              const offset = groundOffset

              edit(current => ({
                ...current,
                nodes: current.nodes.map(node =>
                  node.id === selectedNodeId
                    ? {
                        ...node,
                        transform: {
                          ...node.transform,
                          position: {
                            ...node.transform.position,
                            y: node.transform.position.y + offset,
                          },
                        },
                      }
                    : node
                ),
              }))
            }}
            materials={
              <SceneNodeMaterials
                node={selectedNode}
                dressing={
                  selectedNodeId
                    ? dressingByNode.get(selectedNodeId)
                    : undefined
                }
                onBind={handleBindMaterial}
              />
            }
            animation={
              <SceneNodeAnimation
                node={selectedNode}
                onChange={patch => {
                  if (selectedNodeId) {
                    updateNode(selectedNodeId, patch)
                  }
                }}
              />
            }
          />
        </aside>
      </div>
    </div>
  )
}

/**
 * Wraps a draft-mutating action so it does nothing while editing is held.
 *
 * A hook rather than a plain wrapper because the resulting function is a
 * dependency of half the handlers in this component: a new identity every render
 * would rebuild all of them every render, and re-run every effect keyed on one.
 */
/**
 * Wraps a draft action so it refuses to run while editing is held.
 *
 * <p>
 * The blocking state is read from a <b>ref</b>, at call time. Capturing the
 * value instead left every asynchronous path holding whichever answer was true
 * when its closure was built: a model placement that started before a link and
 * finished during it called an `addNode` created back when nothing was blocked,
 * and wrote into the draft the link was in the middle of invalidating. Reading
 * the ref means the guard answers for the moment the write actually happens.
 * </p>
 *
 * <p>
 * It also gives these actions ONE identity for the life of the editor, which
 * the handlers below depend on: they list the guarded actions in their own
 * dependency arrays, and rebuilding all of them every time the hold flips would
 * churn every callback in the component.
 * </p>
 */
function useGuardedEdit<A extends unknown[]>(
  action: (...args: A) => void,
  blockedRef: { current: string | null }
): (...args: A) => void {
  return useCallback(
    (...args: A) => {
      if (blockedRef.current) {
        return
      }
      action(...args)
    },
    [action, blockedRef]
  )
}
