import './ProjectStudioSection.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useState } from 'react'

import {
  createProjectLevel,
  type ProjectLevelStatus,
} from '@/features/project/api/projectStudioApi'
import {
  useProjectCharactersQuery,
  useProjectCommentsQuery,
  useProjectLevelsQuery,
  useProjectReferencesQuery,
} from '@/features/project/api/projectStudioQueries'
import { useScenesQuery } from '@/features/scenes/api/queries'
import { useTabUiState } from '@/hooks/useTabUiState'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/feedback'

import { LEVEL_STATUSES, levelStatusLabel } from '../levelStatus'
import {
  commentTargetLabel,
  type ProjectAssetNames,
} from './commentTargetLabels'
import { ProjectCharactersSection } from './ProjectCharactersSection'
import { ProjectCommentsBadge } from './ProjectCommentsBadge'
import { ProjectCommentThread } from './ProjectCommentThread'
import { ProjectLevelAssetsSection } from './ProjectLevelAssetsSection'
import { ProjectLevelSceneButton } from './ProjectLevelSceneButton'
import { ProjectLevelWorkspace } from './ProjectLevelWorkspace'
import { ProjectReferenceBoard } from './ProjectReferenceBoard'
import {
  ProjectWorkspaceShell,
  type ProjectWorkspaceView,
} from './ProjectWorkspaceShell'

export type { ProjectAssetNames } from './commentTargetLabels'

interface ProjectStudioSectionProps {
  projectId: number
  tabId?: string
  onChanged?: () => void
  assets?: ProjectAssetNames
}

export function ProjectStudioSection({
  projectId,
  tabId,
  onChanged,
  assets = {},
}: ProjectStudioSectionProps) {
  const queryClient = useQueryClient()
  const levelsQuery = useProjectLevelsQuery(projectId)
  const charactersQuery = useProjectCharactersQuery(projectId)
  const commentsQuery = useProjectCommentsQuery(projectId)
  const referencesQuery = useProjectReferencesQuery(projectId)
  const scenesQuery = useScenesQuery()

  // Which surface of the workspace this tab is showing, kept in the tab's own UI
  // state so a reload or a trip to another tab comes back to the same view. The
  // alternative - a `useState` - resets on every tab switch, which is the same
  // complaint the scene editor had.
  const stateKey = tabId ?? `project-${projectId}`
  const [view, setView] = useTabUiState<ProjectWorkspaceView>(
    stateKey,
    'projectWorkspaceView',
    'overview'
  )

  const [levelName, setLevelName] = useState('')
  const [levelDescription, setLevelDescription] = useState('')
  const [levelStatus, setLevelStatus] = useState<ProjectLevelStatus>('planned')
  const [showLevelForm, setShowLevelForm] = useState(false)

  // Which Level the workspace is drilled into, in the tab's own state so a reload
  // or a trip to another tab returns to the level the user was reading. Null is
  // the project's own four views.
  const [openLevelId, setOpenLevelId] = useTabUiState<number | null>(
    stateKey,
    'projectOpenLevelId',
    null
  )

  const invalidateStudio = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'levels'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'characters'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'references'],
      }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ])
    onChanged?.()
  }

  const createLevel = useMutation({
    mutationFn: () =>
      createProjectLevel(projectId, {
        name: levelName.trim(),
        ...(levelDescription.trim()
          ? { description: levelDescription.trim() }
          : {}),
        productionStatus: levelStatus,
      }),
    onSuccess: async () => {
      setLevelName('')
      setLevelDescription('')
      setLevelStatus('planned')
      await invalidateStudio()
    },
  })

  const queryError =
    levelsQuery.error ??
    charactersQuery.error ??
    commentsQuery.error ??
    referencesQuery.error
  if (queryError) {
    return (
      <ErrorState
        title="Could not load production context"
        message={
          queryError instanceof Error
            ? queryError.message
            : 'The production context request failed.'
        }
        onRetry={() => {
          void Promise.all([
            levelsQuery.refetch(),
            commentsQuery.refetch(),
            referencesQuery.refetch(),
          ])
        }}
      />
    )
  }

  if (
    levelsQuery.isLoading ||
    charactersQuery.isLoading ||
    commentsQuery.isLoading ||
    referencesQuery.isLoading
  ) {
    return <LoadingState message="Loading production context…" />
  }

  const levels = levelsQuery.data ?? []
  const characters = charactersQuery.data ?? []
  const comments = commentsQuery.data ?? []
  const references = referencesQuery.data ?? []
  const decisions = comments.filter(comment => comment.isPinned)
  const openComments = comments.filter(comment => comment.status !== 'resolved')

  /*
   * The scene count on a level row is derived from the scene list the
   * workspace loads anyway, rather than from a request per level. The variant
   * count comes from the level DTO itself, and the comments badge counts its
   * own open comments.
   */
  const sceneCountForLevel = (levelId: number): number =>
    (scenesQuery.data ?? []).filter(scene => scene.projectLevelId === levelId)
      .length

  const levelCard = (
    <section
      className="project-studio-card"
      aria-labelledby="project-levels-title"
    >
      <div className="project-studio-card-header">
        <div className="project-studio-card-title">
          <h4 id="project-levels-title">Levels</h4>
          <span className="project-studio-count">{levels.length}</span>
        </div>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label="Add level"
          title="Add level"
          onClick={() => setShowLevelForm(current => !current)}
        />
      </div>
      {levels.length === 0 ? (
        <EmptyState
          icon="pi pi-map"
          title="No levels yet"
          message="Create the first production level for this project."
        />
      ) : (
        <div className="project-level-list">
          {levels.map(level => (
            <div
              className="project-level-row"
              key={level.id}
              data-testid="project-level-row"
              data-level-name={level.name}
            >
              <button
                type="button"
                className="project-level-open"
                data-testid="project-level-open"
                aria-label={`Open the level ${level.name}`}
                onClick={() => setOpenLevelId(level.id)}
              >
                <span className="project-level-open-name">
                  <strong>{level.name}</strong>
                </span>
                {level.description && <p>{level.description}</p>}
                {/* The counts the API already returns, and the two a level's
                    own surfaces answer. "Which variants does this level use"
                    is a question the row can answer without opening it. */}
                <span className="project-level-row-counts">
                  {level.characterVariantCount > 0 && (
                    <span data-testid="project-level-row-variants">
                      {level.characterVariantCount}{' '}
                      {level.characterVariantCount === 1
                        ? 'variant'
                        : 'variants'}
                    </span>
                  )}
                  {!scenesQuery.isLoading &&
                    sceneCountForLevel(level.id) > 0 && (
                      <span data-testid="project-level-row-scenes">
                        {sceneCountForLevel(level.id)}{' '}
                        {sceneCountForLevel(level.id) === 1
                          ? 'scene'
                          : 'scenes'}
                      </span>
                    )}
                </span>
              </button>
              <ProjectCommentsBadge
                projectId={projectId}
                target={{ kind: 'levelId', id: level.id }}
                targetName={level.name}
                variant="inline"
              />
              <ProjectLevelSceneButton
                projectId={projectId}
                levelId={level.id}
                levelName={level.name}
              />
              <span className="project-status-pill">
                {levelStatusLabel(level.productionStatus)}
              </span>
            </div>
          ))}
        </div>
      )}
      {showLevelForm ? (
        <form
          className="project-studio-form"
          onSubmit={event => {
            event.preventDefault()
            if (levelName.trim()) createLevel.mutate()
          }}
        >
          <label htmlFor="new-project-level">New level</label>
          <InputTextarea
            aria-label="Level description"
            value={levelDescription}
            onChange={event => setLevelDescription(event.target.value)}
            rows={2}
            placeholder="What happens in this level?"
          />
          <div className="project-studio-form-row">
            <InputText
              id="new-project-level"
              value={levelName}
              onChange={event => setLevelName(event.target.value)}
              placeholder="Forest Crossing"
            />
            <select
              aria-label="New level status"
              value={levelStatus}
              onChange={event =>
                setLevelStatus(event.target.value as ProjectLevelStatus)
              }
            >
              {LEVEL_STATUSES.map(status => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              icon="pi pi-plus"
              aria-label="Create level"
              disabled={!levelName.trim() || createLevel.isPending}
            />
          </div>
        </form>
      ) : null}
    </section>
  )

  return (
    <div className="project-studio-section" data-testid="project-studio">
      <div className="project-studio-header">
        <div>
          <span className="container-rich-kicker">Production</span>
          <h3>Project studio</h3>
        </div>
        <span className="project-studio-summary">
          {levels.length} {levels.length === 1 ? 'level' : 'levels'} ·{' '}
          {openComments.length} open comments · {decisions.length}{' '}
          {decisions.length === 1 ? 'decision' : 'decisions'}
        </span>
      </div>

      {/*
       * A Level is reached through the Project tab, not a tab of its own: it is
       * part of Project design rather than an asset, and a second tab type for it
       * would give the dock a second kind of "thing you can have open" for
       * something that is really one section of the project. The breadcrumb is
       * the way back, and the level's own four surfaces replace the project's
       * four while it is open.
       */}
      {openLevelId !== null ? (
        <ProjectLevelWorkspace
          projectId={projectId}
          levelId={openLevelId}
          tabId={tabId}
          onExit={() => setOpenLevelId(null)}
        />
      ) : (
        <ProjectWorkspaceShell
          view={view}
          onViewChange={setView}
          counts={{
            levels: levels.length,
            cast: characters.length,
            references: references.length,
          }}
        >
          {view === 'overview' ? (
            <div className="project-studio-grid">
              {levelCard}
              <section
                className="project-studio-card"
                aria-label="Comments and decisions"
              >
                <ProjectCommentThread
                  projectId={projectId}
                  target={null}
                  targetName="the project"
                  heading="Comments & decisions"
                  listAll
                  itemTestId="project-comment-row"
                  describeTarget={comment =>
                    commentTargetLabel(
                      comment,
                      levels,
                      characters,
                      references,
                      assets
                    )
                  }
                />
              </section>
            </div>
          ) : null}

          {view === 'levels' ? (
            <>
              {levelCard}
              <ProjectLevelAssetsSection projectId={projectId} />
            </>
          ) : null}

          {view === 'cast' ? (
            <ProjectCharactersSection
              projectId={projectId}
              onChanged={onChanged}
            />
          ) : null}

          {view === 'references' ? (
            <ProjectReferenceBoard
              projectId={projectId}
              onChanged={onChanged}
            />
          ) : null}
        </ProjectWorkspaceShell>
      )}
    </div>
  )
}
