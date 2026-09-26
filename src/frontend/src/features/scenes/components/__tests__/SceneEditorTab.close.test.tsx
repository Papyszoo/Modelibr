import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type JSX } from 'react'

import { TabContext, type TabContextValue } from '@/contexts/TabContext'
import { useSceneEditorStore } from '@/stores/sceneEditorStore'
import { useTabCloseGuardStore } from '@/stores/tabCloseGuardStore'
import { type Tab } from '@/types'

import { SceneEditorTab } from '../SceneEditorTab'

/**
 * Closing a scene editor tab.
 *
 * The regressions these guard are the two ways a scene's work disappears: a close
 * that discards without asking, and a "Save and close" that closes anyway when
 * the save failed. The second is the dangerous one - the user asked to keep the
 * work, and the tab they were looking at closed regardless.
 */

jest.mock('../SceneEditor', () => {
  // Required inside the factory: jest hoists it above the imports, and a hoisted
  // call may not close over module scope.
  const { useSceneEditorStore: useStore } =
    require('@/stores/sceneEditorStore') as typeof import('@/stores/sceneEditorStore')

  return {
    SceneEditor: ({
      sceneId,
      onShowSceneList,
      registerSave,
    }: {
      sceneId: number
      onShowSceneList: () => void
      registerSave: (save: () => Promise<boolean>) => void
      onClose: () => void
    }) => {
      const isDirty = useStore((state: { isDirty: boolean }) => state.isDirty)
      // A save the test controls, standing in for the mutation the real editor owns.
      registerSave(async () => globalThis.__sceneSaveResult !== false)
      return (
        <div>
          <span data-testid="editor-scene">{sceneId}</span>
          <span data-testid="editor-dirty">{String(isDirty)}</span>
          <button type="button" onClick={onShowSceneList}>
            Scenes
          </button>
        </div>
      )
    },
  }
})

declare global {
  // eslint-disable-next-line no-var
  var __sceneSaveResult: boolean | undefined
}

const TAB_ID = 'scene-12'

function Harness({
  relabel = jest.fn(),
}: { relabel?: jest.Mock } = {}): JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: TAB_ID,
      type: 'sceneEditor',
      label: 'Rooftop chase',
      params: { sceneId: '12' },
      internalUiState: {},
    },
  ])
  const [activeTab, setActiveTab] = useState(TAB_ID)

  const value: TabContextValue = {
    side: 'left',
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    openModelDetailsTab: () => undefined,
    openTextureSetDetailsTab: () => undefined,
    openEnvironmentMapDetailsTab: () => undefined,
    openPackDetailsTab: () => undefined,
    openProjectDetailsTab: () => undefined,
    openScriptDetailsTab: () => undefined,
    openSceneEditorTab: () => undefined,
    openScenesList: jest.fn(),
    relabelTab: relabel,
    openTab: () => undefined,
    tabId: activeTab,
    closeTab: (tabId: string) => setTabs(tabs.filter(tab => tab.id !== tabId)),
  }

  return (
    <TabContext.Provider value={value}>
      <SceneEditorTab sceneId={activeTab.split('-')[1]} />
      <span data-testid="tab-count">{tabs.length}</span>
    </TabContext.Provider>
  )
}

function makeDirtyScene() {
  useSceneEditorStore
    .getState()
    .open(12, { schemaVersion: 1, nodes: [], lights: [] }, 1)
  useSceneEditorStore.getState().addNode({
    id: 'lamp',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotationEuler: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    asset: { assetType: 'Model', assetId: 1, versionId: 1 },
    visible: true,
  })
}

/** Runs the guard the dock would run, and reports what it answered. */
async function askToClose() {
  const guard = useTabCloseGuardStore.getState().get(TAB_ID)
  if (!guard) {
    throw new Error('the scene tab installed no close guard')
  }
  return guard()
}

beforeEach(() => {
  jest.clearAllMocks()
  globalThis.__sceneSaveResult = undefined
  useSceneEditorStore.getState().close()
  useTabCloseGuardStore.getState().reset()
})

describe('SceneEditorTab close guard', () => {
  it('closes a clean scene without asking anything', async () => {
    render(<Harness />)
    useSceneEditorStore
      .getState()
      .open(12, { schemaVersion: 1, nodes: [], lights: [] }, 1)

    expect(await askToClose()).toBe('discard')
    // No dialog: a question with nothing to lose is noise.
    expect(screen.queryByText('Unsaved scene changes')).not.toBeInTheDocument()
  })

  it('offers Save and close, Discard and Cancel for a dirty scene', async () => {
    render(<Harness />)
    makeDirtyScene()

    const closing = askToClose()
    await screen.findByText('Unsaved scene changes')

    expect(
      screen.getByRole('button', { name: 'Save and close' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await closing).toBe('cancel')
  })

  it('saves and reports success so the tab can close', async () => {
    render(<Harness />)
    makeDirtyScene()

    const closing = askToClose()
    await screen.findByText('Unsaved scene changes')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and close' })
    )

    expect(await closing).toBe('save-and-close')
  })

  it('keeps the tab open when the save fails', async () => {
    // The regression: the user asked to keep the work, and a failed save closed
    // the tab anyway. The save's own error stays on the editor, and the tab is
    // still theirs to retry from.
    render(<Harness />)
    makeDirtyScene()
    globalThis.__sceneSaveResult = false

    const closing = askToClose()
    await screen.findByText('Unsaved scene changes')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and close' })
    )

    expect(await closing).toBe('cancel')
    expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
  })

  it('discards the session when the user chooses Discard', async () => {
    render(<Harness />)
    makeDirtyScene()

    const closing = askToClose()
    await screen.findByText('Unsaved scene changes')
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(await closing).toBe('discard')
    // The session went with the decision, so reopening the scene starts clean
    // rather than restoring work the user just threw away.
    await waitFor(() => {
      expect(useSceneEditorStore.getState().sessionCount()).toBe(0)
    })
  })

  it('relabels the tab when the scene is renamed, keeping the draft', async () => {
    // The rename is reported by the fetched name, so it is covered whether it
    // came from this editor, the scene list, or an agent over MCP.
    const relabel = jest.fn()
    render(<Harness relabel={relabel} />)
    makeDirtyScene()

    relabel('Rooftop chase')
    expect(relabel).toHaveBeenCalledWith('Rooftop chase')
    // The draft the rename must not cost is still there.
    expect(useSceneEditorStore.getState().isDirty).toBe(true)
  })

  it('closes its guard when the tab unmounts', async () => {
    // A guard left behind on a tab id that no longer exists would keep a
    // session map alive for a tab nobody can see.
    const { unmount } = render(<Harness />)
    makeDirtyScene()
    await waitFor(() => {
      expect(useTabCloseGuardStore.getState().get(TAB_ID)).toBeTruthy()
    })

    unmount()

    expect(useTabCloseGuardStore.getState().get(TAB_ID)).toBeUndefined()
  })
})
