import { type JSX, useEffect } from 'react'

import { useTabContext } from '@/hooks/useTabContext'
import { useSceneEditorStore } from '@/stores'

import { SceneEditor } from './SceneEditor'
import { SceneList } from './SceneList'

/**
 * The Scenes tab: the list, and one editor tab per scene.
 *
 * Which scene is open is now the tab's business rather than the tab's, so two
 * scenes can be open at once - two levels' scenes, side by side, the way the
 * rest of the keyed viewers in the dock already work.
 */
export function ScenesTab(): JSX.Element {
  const { openSceneEditorTab } = useTabContext()

  return (
    <SceneList
      onOpenScene={(sceneId, name) => openSceneEditorTab(String(sceneId), name)}
    />
  )
}

/**
 * One scene, one tab.
 *
 * The tab owns the scene, so switching tabs never has to guess which draft is
 * live: mounting points the store at this scene, which restores that scene's own
 * draft if it has one. Back closes the tab and discards the draft, which is the
 * only gesture that was ever meant to forget it.
 */
export function SceneEditorTab({ sceneId }: { sceneId?: string }): JSX.Element {
  const { closeTab, tabId } = useTabContext()
  const openScene = useSceneEditorStore(state => state.openScene)
  const close = useSceneEditorStore(state => state.close)
  const storeSceneId = useSceneEditorStore(state => state.sceneId)

  const numericId = sceneId ? Number(sceneId) : null

  // Restore this scene's draft on the way in, so a tab switch is never the thing
  // that loses unsaved edits.
  useEffect(() => {
    if (numericId !== null) {
      openScene(numericId)
    }
  }, [openScene, numericId])

  if (numericId === null) {
    return (
      <div className="tab-error">This scene tab has no scene attached.</div>
    )
  }

  // Until the store points at this scene the editor would paint whichever draft
  // the previously active tab left behind. One loading frame beats one frame of
  // the wrong scene.
  if (storeSceneId !== null && storeSceneId !== numericId) {
    return <div className="tab-loading">Loading scene…</div>
  }

  return (
    <SceneEditor
      sceneId={numericId}
      onClose={() => {
        close()
        closeTab(tabId)
      }}
    />
  )
}
