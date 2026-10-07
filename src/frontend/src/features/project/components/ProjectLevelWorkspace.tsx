import './ProjectLevelWorkspace.css'

import { Button } from 'primereact/button'
import { useMemo, type JSX } from 'react'

import { useTabUiState } from '@/hooks/useTabUiState'

import { useProjectLevelsQuery } from '../api/projectStudioQueries'
import type { ProjectLevelDto } from '../api/projectStudioApi'
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from '@/shared/components/feedback'

import { ProjectLevelAssetsSection } from './ProjectLevelAssetsSection'
import { ProjectLevelScenesSection } from './ProjectLevelScenesSection'
import { ProjectLevelSceneButton } from './ProjectLevelSceneButton'
import { ProjectReferenceBoard } from './ProjectReferenceBoard'
import {
  ProjectWorkspaceShell,
  type ProjectLevelView,
  type WorkspaceViewDescriptor,
} from './ProjectWorkspaceShell'

const LEVEL_VIEWS: Array<WorkspaceViewDescriptor<ProjectLevelView>> = [
  { id: 'overview', label: 'Overview', icon: 'pi pi-info-circle' },
  { id: 'assets', label: 'Assets', icon: 'pi pi-box' },
  { id: 'scenes', label: 'Scenes', icon: 'pi pi-camera' },
  { id: 'references', label: 'References', icon: 'pi pi-images' },
]
import { levelStatusLabel } from '../levelStatus'

interface ProjectLevelWorkspaceProps {
  projectId: number
  levelId: number
  /** Returns to the Project's Levels view. */
  onExit: () => void
  /** Same key the rest of the studio uses, so the level survives a tab switch. */
  tabId?: string
}

/**
 * One Level, in full: its brief, what it places, its Scenes and its references.
 *
 * A Level is part of Project design rather than an asset, so it does not get a
 * dock tab - it is reached through the Project tab and leaves through the
 * breadcrumb. That is the same relationship the Project has to the window, and
 * it keeps one place where "what is this project" is answered.
 *
 * The four views are the four questions a level actually gets asked: what is it
 * meant to be, what does it use, how is it built, and what should it look like.
 * Assets and References reuse the Project's own sections, scoped, so there is one
 * implementation of each rather than a level-flavoured copy.
 */
export function ProjectLevelWorkspace({
  projectId,
  levelId,
  onExit,
  tabId,
}: ProjectLevelWorkspaceProps): JSX.Element {
  const levelsQuery = useProjectLevelsQuery(projectId)
  const stateKey = tabId ?? `project-${projectId}`

  // Which of the level's four surfaces is showing, in the tab's own state so a
  // reload or a trip to another tab returns to it.
  const [view, setView] = useTabUiState<ProjectLevelView>(
    stateKey,
    'projectLevelView',
    'overview'
  )

  const level = useMemo<ProjectLevelDto | null>(
    () =>
      (levelsQuery.data ?? []).find(candidate => candidate.id === levelId) ??
      null,
    [levelsQuery.data, levelId]
  )

  if (levelsQuery.isLoading) {
    return <LoadingState message="Loading level…" />
  }

  if (levelsQuery.isError) {
    return (
      <ErrorState
        title="Could not load this level"
        message={
          levelsQuery.error instanceof Error
            ? levelsQuery.error.message
            : 'The level request failed.'
        }
        onRetry={() => void levelsQuery.refetch()}
      />
    )
  }

  // A level deleted while its workspace was open. The Project tab is still here
  // and the breadcrumb still works, so the honest answer is to say it and offer
  // the way out rather than rendering an empty level.
  if (level === null) {
    return (
      <EmptyState
        icon="pi pi-map"
        title="This level no longer exists"
        message="It was deleted while you were here. The rest of the project is untouched."
        action={<Button label="Back to levels" onClick={onExit} size="small" />}
      />
    )
  }

  return (
    <ProjectWorkspaceShell
      view={view}
      onViewChange={setView}
      views={LEVEL_VIEWS}
      label="Level workspace"
      counts={{ scenes: undefined }}
      breadcrumb={
        <nav className="project-level-breadcrumb" aria-label="Breadcrumb">
          <button
            type="button"
            className="project-level-crumb"
            data-testid="project-level-crumb-project"
            onClick={onExit}
          >
            Project
          </button>
          <i className="pi pi-angle-right" aria-hidden="true" />
          <span
            className="project-level-crumb is-current"
            data-testid="project-level-crumb-level"
            aria-current="page"
          >
            {level.name}
          </span>
          <span className="project-level-status">
            {levelStatusLabel(level.productionStatus)}
          </span>
        </nav>
      }
    >
      {view === 'overview' ? (
        <LevelOverview level={level} onOpenScenes={() => setView('scenes')} />
      ) : null}
      {view === 'assets' ? (
        <ProjectLevelAssetsSection projectId={projectId} levelId={level.id} />
      ) : null}
      {view === 'scenes' ? (
        <ProjectLevelScenesSection
          projectId={projectId}
          levelId={level.id}
          levelName={level.name}
          createOrOpen={
            <ProjectLevelSceneButton
              {...{ projectId, levelId: level.id, levelName: level.name }}
            />
          }
        />
      ) : null}
      {view === 'references' ? (
        <ProjectReferenceBoard
          projectId={projectId}
          fixedTarget={`level:${level.id}`}
        />
      ) : null}
    </ProjectWorkspaceShell>
  )
}

/**
 * The level's brief: what it is for, in its own words, plus the production facts
 * that belong beside that sentence rather than on a settings screen.
 */
function LevelOverview({
  level,
  onOpenScenes,
}: {
  level: ProjectLevelDto
  onOpenScenes: () => void
}): JSX.Element {
  return (
    <section
      className="project-level-overview"
      data-testid="project-level-overview"
      aria-labelledby="project-level-overview-title"
    >
      <div className="project-level-overview-header">
        <div>
          <span className="container-rich-kicker">Production brief</span>
          <h3 id="project-level-overview-title">{level.name}</h3>
        </div>
        <ProjectLevelSceneButton
          projectId={level.projectId}
          levelId={level.id}
          levelName={level.name}
        />
      </div>

      {level.description ? (
        <p className="project-level-description">{level.description}</p>
      ) : (
        <p className="project-level-description is-empty">
          No description yet. What happens in this level is the one thing only
          you know.
        </p>
      )}

      <dl className="project-level-facts">
        <div>
          <dt>Production order</dt>
          <dd>{level.sortOrder}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{levelStatusLabel(level.productionStatus)}</dd>
        </div>
        <div>
          <dt>Character variants</dt>
          <dd data-testid="project-level-variant-count">
            {level.characterVariantCount}
          </dd>
        </div>
      </dl>

      {level.characterVariantCount > 0 && (
        <div
          className="project-level-variants"
          data-testid="project-level-variants"
        >
          <span className="container-rich-kicker">Cast in this level</span>
          <div className="project-level-variant-chips">
            {level.characterVariantNames.map(name => (
              <span key={name} className="project-level-variant-chip">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <Button
        label="Scenes"
        icon="pi pi-arrow-right"
        iconPos="right"
        text
        size="small"
        onClick={onOpenScenes}
        data-testid="project-level-goto-scenes"
      />
    </section>
  )
}
