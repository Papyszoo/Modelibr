import './ProjectLevelScenesSection.css'

import { Button } from 'primereact/button'
import { type ReactNode, type JSX } from 'react'

import { useTabContext } from '@/hooks/useTabContext'
import { useScenesQuery } from '@/features/scenes/api/queries'

import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/shared/components/feedback'

import { selectLevelScenes } from '../levelAssets'

interface ProjectLevelScenesSectionProps {
  projectId: number
  levelId: number
  levelName: string
  /**
   * The create-or-open control.
   *
   * Passed in rather than built here so the same button serves the level row, the
   * overview and this list - one way into a level's scene, not three that drift.
   */
  createOrOpen: ReactNode
}

/**
 * The Scenes filed under one Level.
 *
 * A Level may hold several: one primary shot plus alternates, which is the normal
 * way to try a level's staging without losing the version you settled on. The
 * primary one is marked rather than sorted away, because which is which is the
 * information a user needs before opening either.
 */
export function ProjectLevelScenesSection({
  projectId,
  levelId,
  levelName,
  createOrOpen,
}: ProjectLevelScenesSectionProps): JSX.Element {
  const { openSceneEditorTab } = useTabContext()
  const scenesQuery = useScenesQuery()

  if (scenesQuery.isLoading) {
    return <LoadingState message="Loading level scenes…" />
  }

  if (scenesQuery.isError) {
    return (
      <ErrorState
        title="Could not load this level's scenes"
        message={
          scenesQuery.error instanceof Error
            ? scenesQuery.error.message
            : 'The scene request failed.'
        }
        onRetry={() => void scenesQuery.refetch()}
      />
    )
  }

  // The same derivation the level-assets view uses, so a scene can never appear in
  // one and not the other.
  const scenes = selectLevelScenes(scenesQuery.data ?? [], projectId, levelId)

  return (
    <section
      className="project-level-scenes"
      data-testid="project-level-scenes"
      aria-labelledby="project-level-scenes-title"
    >
      <div className="project-level-scenes-header">
        <div>
          <span className="container-rich-kicker">Implementation</span>
          <h3 id="project-level-scenes-title">Scenes</h3>
        </div>
        {createOrOpen}
      </div>

      {scenes.length === 0 ? (
        <EmptyState
          icon="pi pi-camera"
          title="No scene for this level yet"
          message="Create one from the level, then place models in it. What it places shows up under the level's Assets."
        />
      ) : (
        <ul className="project-level-scene-list">
          {scenes.map(scene => (
            <li
              key={scene.id}
              className="project-level-scene-row"
              data-testid="project-level-scene-row"
              data-scene-name={scene.name}
              data-primary={scene.isPrimary ? 'true' : 'false'}
            >
              <i className="pi pi-camera" aria-hidden="true" />
              <span className="project-level-scene-name">{scene.name}</span>
              {scene.isPrimary && (
                <span className="project-level-scene-badge">primary</span>
              )}
              <Button
                label="Open"
                icon="pi pi-external-link"
                text
                rounded
                size="small"
                aria-label={`Open the scene ${scene.name}`}
                tooltip="Open in a tab"
                onClick={() => openSceneEditorTab(String(scene.id), scene.name)}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="project-level-scenes-note">
        Opening a scene leaves this level open beside it in its own tab, so you
        can come back to {levelName} without losing anything.
      </p>
    </section>
  )
}
