import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type JSX, useState } from 'react'

import { TabContext, type TabContextValue } from '@/contexts/TabContext'
import { useSceneEditorStore } from '@/stores/sceneEditorStore'
import { type Tab } from '@/types'

import { SceneEditorTab } from '../SceneEditorTab'
import { ScenesTab } from '../ScenesTab'

/**
 * One tab per scene.
 *
 * The regressions these catch: the list opening the editor in place instead of a
 * tab (so two scenes still cannot be open at once), a scene tab showing whichever
 * draft the previously active tab left behind (a user would edit one scene while
 * looking at another's document), and Back clearing the editor without closing
 * the tab (leaving an empty editor with no list to go back to).
 */

jest.mock('../SceneEditor', () => {
  // Required inside the factory: jest hoists it above the imports, and the
  // hoisted call may not close over module scope.

  const { useSceneEditorStore } = require('@/stores/sceneEditorStore')

  return {
    SceneEditor: ({
      sceneId,
      onClose,
    }: {
      sceneId: number
      onClose: () => void
    }) => {
      const nodes = useSceneEditorStore(
        (state: { document: { nodes: { id: string }[] } | null }) =>
          state.document?.nodes.map(node => node.id).join(',')
      )
      const isDirty = useSceneEditorStore(
        (state: { isDirty: boolean }) => state.isDirty
      )
      return (
        <div>
          <span data-testid="editor-scene">{sceneId}</span>
          <span data-testid="editor-nodes">{nodes ?? 'none'}</span>
          <span data-testid="editor-dirty">{String(isDirty)}</span>
          <button type="button" onClick={onClose}>
            Back
          </button>
        </div>
      )
    },
  }
})

jest.mock('../SceneList', () => ({
  SceneList: ({ onOpenScene }: { onOpenScene: (sceneId: number) => void }) => (
    <button type="button" onClick={() => onOpenScene(7)}>
      Open scene 7
    </button>
  ),
}))

function makeDocument(nodes: string[]): {
  schemaVersion: number
  nodes: {
    id: string
    transform: {
      position: { x: number; y: number; z: number }
      rotationEuler: { x: number; y: number; z: number }
      scale: { x: number; y: number; z: number }
    }
    asset: { assetType: 'Model'; assetId: number; versionId: number }
    visible: boolean
  }[]
  lights: []
} {
  return {
    schemaVersion: 1,
    lights: [],
    nodes: nodes.map(id => ({
      id,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotationEuler: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      asset: { assetType: 'Model' as const, assetId: 1, versionId: 1 },
      visible: true,
    })),
  }
}

function Harness({ initialSceneId }: { initialSceneId?: string }): JSX.Element {
  const [tabs, setTabs] = useState<Tab[]>(
    initialSceneId
      ? [
          {
            id: `scene-${initialSceneId}`,
            type: 'sceneEditor',
            params: { sceneId: initialSceneId },
            internalUiState: {},
          },
        ]
      : []
  )
  const [activeTab, setActiveTab] = useState(
    initialSceneId ? `scene-${initialSceneId}` : ''
  )

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
    openTab: () => undefined,
    openScenesList: jest.fn(),
    relabelTab: jest.fn(),
    openVfxEditorTab: () => undefined,
    openSceneEditorTab: (sceneId, name) => {
      const existing = tabs.find(
        tab => tab.type === 'sceneEditor' && tab.sceneId === sceneId
      )
      if (existing) {
        setActiveTab(existing.id)
        return
      }
      const newTab: Tab = {
        id: `scene-${sceneId}`,
        type: 'sceneEditor',
        label: name,
        params: { sceneId },
        internalUiState: {},
      }
      setTabs([...tabs, newTab])
      setActiveTab(newTab.id)
    },
    tabId: activeTab,
    closeTab: tabId => setTabs(tabs.filter(tab => tab.id !== tabId)),
  }

  return (
    <TabContext.Provider value={value}>
      {initialSceneId ? (
        <SceneEditorTab sceneId={activeTab.split('-')[1]} />
      ) : (
        <ScenesTab />
      )}
      <span data-testid="tab-count">{tabs.length}</span>
    </TabContext.Provider>
  )
}

describe('ScenesTab', () => {
  beforeEach(() => {
    useSceneEditorStore.getState().close()
  })

  it('opens a scene in its own tab rather than in place', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Open scene 7' }))

    // The list is all the list tab renders now; the editor lives in a new tab.
    expect(screen.queryByTestId('editor-scene')).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-count')).toHaveTextContent('1')
  })
})

describe('SceneEditorTab', () => {
  beforeEach(() => {
    useSceneEditorStore.getState().close()
  })

  it('shows its own scene and not the draft another tab left behind', () => {
    // Scene 3's draft is dirty and unsaved, exactly as it would be after a user
    // edited it and moved on.
    useSceneEditorStore.getState().open(3, makeDocument(['lamp']), 4)
    useSceneEditorStore.getState().addNode(makeDocument(['lamp']).nodes[0])

    render(<Harness initialSceneId="9" />)

    // Scene 9 has no draft of its own, so the editor fetches it - and what it
    // shows meanwhile must not be scene 3's work.
    expect(screen.getByTestId('editor-scene')).toHaveTextContent('9')
    expect(screen.getByTestId('editor-nodes')).toHaveTextContent('none')
  })

  it('restores the draft it already has instead of starting empty', () => {
    useSceneEditorStore.getState().open(9, makeDocument(['crate']), 1)
    useSceneEditorStore.getState().addNode(makeDocument(['crate']).nodes[0])

    render(<Harness initialSceneId="9" />)

    expect(screen.getByTestId('editor-nodes')).toHaveTextContent('crate')
    expect(screen.getByTestId('editor-dirty')).toHaveTextContent('true')
  })

  it('Back closes the tab and forgets the draft', async () => {
    const user = userEvent.setup()
    useSceneEditorStore.getState().open(9, makeDocument(['crate']), 1)
    useSceneEditorStore.getState().addNode(makeDocument(['crate']).nodes[0])

    render(<Harness initialSceneId="9" />)

    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByTestId('tab-count')).toHaveTextContent('0')
    // Reopening must not resurrect the abandoned edits.
    useSceneEditorStore.getState().openScene(9)
    expect(useSceneEditorStore.getState().document).toBeNull()
  })
})
