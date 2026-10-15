import './ProjectLevelSceneButton.css'

import { Button } from 'primereact/button'
import { type JSX, useState } from 'react'

import { useTabContext } from '@/hooks/useTabContext'
import {
  useFileSceneUnderLevel,
  useCreateSceneMutation,
  useScenesQuery,
  useSetSceneProjectMutation,
} from '@/features/scenes/api/queries'

interface ProjectLevelSceneButtonProps {
  projectId: number
  levelId: number
  levelName: string
}

/**
 * The way into a level's Scene, from the level.
 *
 * A level whose Scene can only be reached from the Scenes list is a level the UI
 * cannot be driven from: the backend has filed scenes under levels since v0.7,
 * and the levels view was the one place that should have offered the trip. So
 * this is one button, and it means both of the things a person means by it:
 *
 *   - a level that already has a Scene opens it, in a tab, next to whatever else
 *     is open - the primary scene first, because that is the level's own shot;
 *   - a level that has none gets one, named after the level, filed under it, and
 *     opened. Creating without opening would leave the user staring at a level
 *     that still looks empty.
 *
 * Not a form. A scene starts empty by definition, so there is nothing to ask
 * about before one exists - and the name it gets is the level's, which is right
 * almost always and editable immediately in the editor that opens.
 */
export function ProjectLevelSceneButton({
  projectId,
  levelId,
  levelName,
}: ProjectLevelSceneButtonProps): JSX.Element {
  const { openSceneEditorTab } = useTabContext()
  const scenes = useScenesQuery()
  const createScene = useCreateSceneMutation()
  const setProject = useSetSceneProjectMutation()
  const fileUnderLevel = useFileSceneUnderLevel()
  const [error, setError] = useState<string | null>(null)

  const owned = (scenes.data ?? []).filter(
    scene => scene.projectId === projectId && scene.projectLevelId === levelId
  )
  const primary =
    owned.find(scene => scene.isPrimaryLevelScene) ?? owned[0] ?? null

  const open = (sceneId: number, name: string): void => {
    openSceneEditorTab(String(sceneId), name)
  }

  /**
   * Three writes in the order the domain requires them: a scene must belong to
   * the project before it can belong to one of that project's levels. Filing it
   * under a level first is refused by the server, and the refusal is the correct
   * one - so the order is not a convenience here.
   */
  const createForLevel = async (): Promise<void> => {
    setError(null)
    const created = await createScene.mutateAsync({ name: levelName })
    const sceneId = created.scene.id
    await setProject.mutateAsync({ sceneId, projectId })
    // Primary, and said here rather than defaulted: the scene this button makes
    // is the level's own shot, which is a production judgement about the level
    // rather than something the API should assume.
    await fileUnderLevel(sceneId, levelId, true)
    open(created.scene.id, created.scene.name)
  }

  const run = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action()
    } catch {
      // The level row already says a scene could not be opened; the scene list
      // and the server's own refusal carry the detail.
      setError(`Could not open ${levelName}'s scene.`)
    }
  }

  return (
    <span className="project-level-scene">
      <Button
        icon={primary ? 'pi pi-external-link' : 'pi pi-plus'}
        text
        rounded
        size="small"
        loading={createScene.isPending}
        // One name per level, and it says which gesture this is: open what is
        // there, or make what is not.
        aria-label={
          primary
            ? `Open the scene of ${levelName}`
            : `Create a scene for ${levelName}`
        }
        tooltip={primary ? 'Open scene' : 'Create scene'}
        onClick={() => {
          if (primary) {
            open(primary.id, primary.name)
            return
          }
          void run(createForLevel)
        }}
      />
      {error ? (
        <span className="project-level-scene-error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  )
}
