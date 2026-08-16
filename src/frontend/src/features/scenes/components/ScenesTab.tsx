import { type JSX } from 'react'

import { useSceneEditorStore } from '@/stores'

import { SceneEditor } from './SceneEditor'
import { SceneList } from './SceneList'

/**
 * The Scenes tab: the list, and the editor for whichever scene is open.
 *
 * Which scene is open lives in the editor store, not in `useState`. The dock
 * renders only the active tab, so this component unmounts on every tab switch -
 * local state meant glancing at another tab dropped the open scene and, with
 * it, the unsaved draft. Closing is now an explicit act (the Back button),
 * which is the only thing that was ever meant to forget it.
 */
export function ScenesTab(): JSX.Element {
  const openSceneId = useSceneEditorStore(state => state.openSceneId)
  const openScene = useSceneEditorStore(state => state.openScene)
  const close = useSceneEditorStore(state => state.close)

  return openSceneId === null ? (
    <SceneList onOpenScene={openScene} />
  ) : (
    <SceneEditor sceneId={openSceneId} onClose={close} />
  )
}
