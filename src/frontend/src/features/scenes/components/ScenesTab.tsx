import { type JSX } from 'react'

import { useTabContext } from '@/hooks/useTabContext'

import { SceneList } from './SceneList'

/**
 * The Scenes tab: the list, and nothing else.
 *
 * Which scene is open belongs to the editor tab, not to this one, so two scenes
 * can be open at once - two levels' scenes, side by side, the way the rest of the
 * keyed viewers in the dock already work. This page therefore never disappears.
 */
export function ScenesTab(): JSX.Element {
  const { openSceneEditorTab } = useTabContext()

  return (
    <SceneList
      onOpenScene={(sceneId, name) => openSceneEditorTab(String(sceneId), name)}
    />
  )
}
