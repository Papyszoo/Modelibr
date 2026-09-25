import './ProjectStudioSection.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useState } from 'react'

import {
  createProductionNote,
  createProjectLevel,
  type ProductionNoteRequest,
  type ProjectLevelStatus,
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

import { ProjectCharactersSection } from './ProjectCharactersSection'

interface ProjectStudioSectionProps {
  projectId: number
  onChanged?: () => void
}

const LEVEL_STATUSES: Array<{ value: ProjectLevelStatus; label: string }> = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'Review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export function ProjectStudioSection({
  projectId,
  onChanged,
}: ProjectStudioSectionProps) {
  const queryClient = useQueryClient()
  const levelsQuery = useProjectLevelsQuery(projectId)
  const charactersQuery = useProjectCharactersQuery(projectId)
  const notesQuery = useProductionNotesQuery(projectId)
  const referencesQuery = useProjectReferencesQuery(projectId)
  const [levelName, setLevelName] = useState('')
  const [levelDescription, setLevelDescription] = useState('')
  const [levelStatus, setLevelStatus] = useState<ProjectLevelStatus>('planned')
  const [showLevelForm, setShowLevelForm] = useState(false)
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

  return (
    <div className="project-studio-section">
      <div className="project-studio-header">
        <div>
          <span className="container-rich-kicker">Production</span>
          <h3>Project studio</h3>
        </div>
        <span className="project-studio-summary">
          {levels.length} {levels.length === 1 ? 'level' : 'levels'} ·{' '}
          {notes.filter(note => note.isPinned).length} pinned notes
        </span>
      </div>

      <div className="project-studio-grid">
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
                <div className="project-level-row" key={level.id}>
                  <div>
                    <strong>{level.name}</strong>
                    {level.description && <p>{level.description}</p>}
                  </div>
                  <span className="project-status-pill">
                    {LEVEL_STATUSES.find(
                      status => status.value === level.productionStatus
                    )?.label ?? level.productionStatus}
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
              icon="pi pi-lightbulb"
              title="No notes yet"
              message="Capture a production note or pin an idea for later."
            />
          ) : (
            <div className="project-note-list">
              {notes.map(note => (
                <article
                  className={`project-note-row${note.isPinned ? ' is-pinned' : ''}`}
                  key={note.id}
                >
                  <div className="project-note-heading">
                    <strong>{note.title}</strong>
                    {note.isPinned && (
                      <i className="pi pi-bookmark-fill" aria-label="Pinned" />
                    )}
                  </div>
                  <p>{note.body}</p>
                  <small>
                    {note.levelId
                      ? `Level #${note.levelId}`
                      : note.referenceImageId
                        ? `Reference #${note.referenceImageId}`
                        : note.characterId
                          ? `Character #${note.characterId}`
                          : 'Project'}
                  </small>
                </article>
              ))}
            </div>
          )}
          {showNoteForm ? (
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
                    <option
                      key={character.id}
                      value={`character:${character.id}`}
                    >
                      Character: {character.name}
                    </option>
                  ))}
                  {references.map(reference => (
                    <option
                      key={reference.id}
                      value={`reference:${reference.id}`}
                    >
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
                    !noteTitle.trim() ||
                    !noteBody.trim() ||
                    createNote.isPending
                  }
                />
              </div>
            </form>
          ) : null}
        </section>
      </div>
      <ProjectCharactersSection projectId={projectId} onChanged={onChanged} />
    </div>
  )
}
