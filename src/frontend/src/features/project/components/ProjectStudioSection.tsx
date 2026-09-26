import './ProjectStudioSection.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useState } from 'react'

import {
  createProductionNote,
  createProjectLevel,
  type ProductionNoteDto,
  type ProductionNoteRequest,
  type ProjectCharacterDto,
  type ProjectLevelDto,
  type ProjectLevelStatus,
  type ProjectReferenceDto,
} from '@/features/project/api/projectStudioApi'
import {
  useProductionNotesQuery,
  useProjectCharactersQuery,
  useProjectLevelsQuery,
  useProjectReferencesQuery,
} from '@/features/project/api/projectStudioQueries'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/feedback'
import { useScenesQuery } from '@/features/scenes/api/queries'

import { useTabUiState } from '@/hooks/useTabUiState'

import { LEVEL_STATUSES, levelStatusLabel } from '../levelStatus'

import { ProjectCharactersSection } from './ProjectCharactersSection'
import { ProjectLevelAssetsSection } from './ProjectLevelAssetsSection'
import { ProjectLevelSceneButton } from './ProjectLevelSceneButton'
import { ProjectLevelWorkspace } from './ProjectLevelWorkspace'
import { ProjectReferenceBoard } from './ProjectReferenceBoard'
import {
  ProjectWorkspaceShell,
  type ProjectWorkspaceView,
} from './ProjectWorkspaceShell'

interface ProjectStudioSectionProps {
  projectId: number
  tabId?: string
  onChanged?: () => void
}

/**
 * What a note is attached to, in words rather than ids.
 *
 * Resolving the names needs the levels, characters and references the studio has
 * already loaded, so a note that pointed at "Level #4" said nothing a user could
 * act on - and the target is the whole point of a production note.
 */
function noteTargetLabel(
  note: ProductionNoteDto,
  levels: ProjectLevelDto[],
  characters: ProjectCharacterDto[],
  references: ProjectReferenceDto[]
): string {
  if (note.levelId) {
    return `Level: ${levels.find(level => level.id === note.levelId)?.name ?? note.levelId}`
  }
  if (note.characterId) {
    return `Character: ${characters.find(character => character.id === note.characterId)?.name ?? note.characterId}`
  }
  if (note.referenceImageId) {
    const reference = references.find(item => item.id === note.referenceImageId)
    return `Reference: ${reference ? reference.title || reference.fileName : note.referenceImageId}`
  }
  return 'Project'
}

export function ProjectStudioSection({
  projectId,
  tabId,
  onChanged,
}: ProjectStudioSectionProps) {
  const queryClient = useQueryClient()
  const levelsQuery = useProjectLevelsQuery(projectId)
  const charactersQuery = useProjectCharactersQuery(projectId)
  const notesQuery = useProductionNotesQuery(projectId)
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
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteTarget, setNoteTarget] = useState('project')
  const [notePinned, setNotePinned] = useState(false)

  const invalidateStudio = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'levels'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'characters'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'production-notes'],
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

  const createNote = useMutation({
    mutationFn: () => {
      const request: ProductionNoteRequest = {
        title: noteTitle.trim(),
        body: noteBody.trim(),
        isPinned: notePinned,
      }
      if (noteTarget.startsWith('level:')) {
        request.levelId = Number(noteTarget.slice('level:'.length))
      } else if (noteTarget.startsWith('reference:')) {
        request.referenceImageId = Number(noteTarget.slice('reference:'.length))
      } else if (noteTarget.startsWith('character:')) {
        request.characterId = Number(noteTarget.slice('character:'.length))
      }
      return createProductionNote(projectId, request)
    },
    onSuccess: async () => {
      setNoteTitle('')
      setNoteBody('')
      setNoteTarget('project')
      setNotePinned(false)
      await invalidateStudio()
    },
  })

  const queryError =
    levelsQuery.error ??
    charactersQuery.error ??
    notesQuery.error ??
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
            notesQuery.refetch(),
            referencesQuery.refetch(),
          ])
        }}
      />
    )
  }

  if (
    levelsQuery.isLoading ||
    charactersQuery.isLoading ||
    notesQuery.isLoading ||
    referencesQuery.isLoading
  ) {
    return <LoadingState message="Loading production context…" />
  }

  const levels = levelsQuery.data ?? []
  const characters = charactersQuery.data ?? []
  const notes = notesQuery.data ?? []
  const references = referencesQuery.data ?? []
  const pinnedNotes = notes.filter(note => note.isPinned)

  /*
   * Two of the three counts on a level row, derived from data the studio already
   * has rather than from three more requests: the workspace loads the notes and
   * the scene list anyway, so a level's note and scene counts are a filter over
   * what is in hand. The variant count comes from the level DTO itself.
   */
  const sceneCountForLevel = (levelId: number): number =>
    (scenesQuery.data ?? []).filter(scene => scene.projectLevelId === levelId)
      .length
  const noteCountForLevel = (levelId: number): number =>
    notes.filter(note => note.levelId === levelId).length

  /*
   * Hoisted out of the JSX because the note form is reachable from two views and
   * duplicated markup drifts. Not a component: it closes over five pieces of
   * local draft state, and lifting that out would be a bigger change than the
   * duplication it replaces.
   */
  const noteForm = (
    <form
      className="project-studio-form"
      onSubmit={event => {
        event.preventDefault()
        if (noteTitle.trim() && noteBody.trim()) createNote.mutate()
      }}
    >
      <label htmlFor="new-project-note">New note or idea</label>
      <InputText
        id="new-project-note"
        value={noteTitle}
        onChange={event => setNoteTitle(event.target.value)}
        placeholder="Lighting mood"
      />
      <InputTextarea
        aria-label="Note body"
        value={noteBody}
        onChange={event => setNoteBody(event.target.value)}
        rows={2}
        placeholder="What should the team remember?"
      />
      <div className="project-studio-form-row">
        <select
          aria-label="Note target"
          value={noteTarget}
          onChange={event => setNoteTarget(event.target.value)}
        >
          <option value="project">Project</option>
          {levels.map(level => (
            <option key={level.id} value={`level:${level.id}`}>
              Level: {level.name}
            </option>
          ))}
          {characters.map(character => (
            <option key={character.id} value={`character:${character.id}`}>
              Character: {character.name}
            </option>
          ))}
          {references.map(reference => (
            <option key={reference.id} value={`reference:${reference.id}`}>
              Reference: {reference.title || reference.fileName}
            </option>
          ))}
        </select>
        <label className="project-studio-checkbox">
          <input
            type="checkbox"
            checked={notePinned}
            onChange={event => setNotePinned(event.target.checked)}
          />
          Pin as idea
        </label>
        <Button
          type="submit"
          icon="pi pi-arrow-up"
          aria-label="Create note"
          disabled={
            !noteTitle.trim() || !noteBody.trim() || createNote.isPending
          }
        />
      </div>
    </form>
  )

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
                  {noteCountForLevel(level.id) > 0 && (
                    <span data-testid="project-level-row-notes">
                      {noteCountForLevel(level.id)}{' '}
                      {noteCountForLevel(level.id) === 1 ? 'note' : 'notes'}
                    </span>
                  )}
                </span>
              </button>
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
          {pinnedNotes.length} pinned notes
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
                aria-labelledby="project-notes-title"
              >
                <div className="project-studio-card-header">
                  <div className="project-studio-card-title">
                    <h4 id="project-notes-title">Notes & ideas</h4>
                    <span className="project-studio-count">{notes.length}</span>
                  </div>
                  <Button
                    icon="pi pi-plus"
                    text
                    rounded
                    aria-label="Add note"
                    title="Add note"
                    onClick={() => setShowNoteForm(current => !current)}
                  />
                </div>
                {notes.length === 0 ? (
                  <EmptyState
                    icon="pi pi-file-edit"
                    title="No notes yet"
                    message="Record what the team should remember, or pin an idea."
                  />
                ) : (
                  <div className="project-note-list">
                    {notes.map(note => (
                      <article
                        className={`project-note-row${note.isPinned ? ' is-pinned' : ''}`}
                        key={note.id}
                        data-testid="project-note-row"
                        data-note-title={note.title}
                      >
                        <div className="project-note-heading">
                          <strong>{note.title}</strong>
                          {note.isPinned && (
                            <i
                              className="pi pi-bookmark-fill"
                              aria-label="Pinned"
                            />
                          )}
                        </div>
                        <p>{note.body}</p>
                        <small>
                          {noteTargetLabel(
                            note,
                            levels,
                            characters,
                            references
                          )}
                        </small>
                      </article>
                    ))}
                  </div>
                )}
                {showNoteForm ? noteForm : null}
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
