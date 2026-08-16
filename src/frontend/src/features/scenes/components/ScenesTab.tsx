import { type JSX, useState } from 'react'

import { SceneEditor } from './SceneEditor'
import { SceneList } from './SceneList'

/**
 * The Scenes tab: the list, and the editor for whichever scene is open.
 *
 * Which scene is open is ephemeral tab state, so `useState` rather than a
 * store - closing the tab is meant to forget it.
 */
export function ScenesTab(): JSX.Element {
  const [openSceneId, setOpenSceneId] = useState<number | null>(null)

  return openSceneId === null ? (
    <SceneList onOpenScene={setOpenSceneId} />
  ) : (
    <SceneEditor sceneId={openSceneId} onClose={() => setOpenSceneId(null)} />
  )
}
