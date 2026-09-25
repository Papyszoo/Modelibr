import './ProjectReferenceBoard.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { InputText } from 'primereact/inputtext'
import { useRef, useState } from 'react'

import { uploadFile } from '@/features/models/api/modelApi'
import {
  addProjectConceptImage,
  removeProjectConceptImage,
} from '@/features/project/api/projectApi'
import {
  addProjectReferenceLink,
  createProductionNote,
  type ProductionNoteDto,
  type ProjectReferenceDto,
  removeProjectReferenceLink,
  updateProjectReference,
} from '@/features/project/api/projectStudioApi'
import {
  useProductionNotesQuery,
  useProjectCharactersQuery,
  useProjectLevelsQuery,
  useProjectReferencesQuery,
} from '@/features/project/api/projectStudioQueries'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/feedback'
import { ImageLightboxDialog } from '@/shared/components/ImageLightboxDialog'

interface ProjectReferenceBoardProps {
  projectId: number
  onChanged?: () => void
}

type LinkTarget = 'level' | 'character'

export function ProjectReferenceBoard({
  projectId,
  onChanged,
}: ProjectReferenceBoardProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const referencesQuery = useProjectReferencesQuery(projectId)
  const levelsQuery = useProjectLevelsQuery(projectId)
  const charactersQuery = useProjectCharactersQuery(projectId)
  const notesQuery = useProductionNotesQuery(projectId)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'references'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'production-notes'],
      }),
      onChanged?.(),
    ])
  }

  const uploadImages = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        // Upload to the library first, then attach the file to the project -
        // the same two steps the project card has always taken.
        const uploaded = await uploadFile(file, { uploadType: 'file' })
        await addProjectConceptImage(projectId, uploaded.fileId)
      }
    },
    onSuccess: invalidate,
  })

  const renameReference = useMutation({
    mutationFn: (input: { referenceId: number; title: string }) =>
      updateProjectReference(projectId, input.referenceId, {
        title: input.title,
      }),
    onSuccess: invalidate,
  })

  const addLink = useMutation({
    mutationFn: (input: {
      referenceId: number
      link: {
        projectLevelId?: number | null
        projectCharacterId?: number | null
      }
    }) => addProjectReferenceLink(projectId, input.referenceId, input.link),
    onSuccess: invalidate,
  })

  const removeLink = useMutation({
    mutationFn: (input: { referenceId: number; linkId: number }) =>
      removeProjectReferenceLink(projectId, input.referenceId, input.linkId),
    onSuccess: invalidate,
  })

  const removeImage = useMutation({
    mutationFn: (fileId: number) =>
      removeProjectConceptImage(projectId, fileId),
    onSuccess: invalidate,
  })

  const addNote = useMutation({
    mutationFn: (input: { referenceId: number; title: string; body: string }) =>
      createProductionNote(projectId, {
        referenceImageId: input.referenceId,
        title: input.title,
        body: input.body,
        isPinned: false,
      }),
    onSuccess: invalidate,
  })

  const queryError =
    referencesQuery.error ??
    levelsQuery.error ??
    charactersQuery.error ??
    notesQuery.error
  if (queryError) {
    return (
      <ErrorState
        title="Could not load references"
        message={
          queryError instanceof Error
            ? queryError.message
            : 'The reference request failed.'
        }
        onRetry={() => {
          void Promise.all([
            referencesQuery.refetch(),
            levelsQuery.refetch(),
            charactersQuery.refetch(),
            notesQuery.refetch(),
          ])
        }}
      />
    )
  }
  if (referencesQuery.isLoading) {
    return <LoadingState message="Loading references…" />
  }

  const references = referencesQuery.data ?? []
  const levels = levelsQuery.data ?? []
  const characters = charactersQuery.data ?? []
  const notes = notesQuery.data ?? []
  const lightboxImages = references.map(reference => ({
    id: reference.fileId,
    name: reference.title || reference.fileName,
    previewUrl: resolveApiAssetUrl(reference.previewUrl),
    fullUrl: resolveApiAssetUrl(reference.fileUrl),
  }))

  return (
    <section
      className="project-reference-board"
      data-testid="project-reference-board"
    >
      <div className="project-reference-header">
        <div>
          <span className="container-rich-kicker">Visual direction</span>
          <h3>Reference Board</h3>
        </div>
        <div className="project-reference-header-actions">
          <span className="project-studio-count">{references.length}</span>
          <Button
            icon="pi pi-plus"
            text
            rounded
            aria-label="Add reference images"
            title="Add reference images"
            disabled={uploadImages.isPending}
            onClick={() => fileInputRef.current?.click()}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="project-reference-upload"
          aria-label="Reference images to upload"
          onChange={event => {
            const files = Array.from(event.target.files ?? [])
            if (files.length > 0) uploadImages.mutate(files)
            event.target.value = ''
          }}
        />
      </div>

      <ImageLightboxDialog
        visible={lightboxIndex !== null}
        title="Project reference"
        images={lightboxImages}
        activeIndex={lightboxIndex ?? 0}
        onIndexChange={setLightboxIndex}
        onHide={() => setLightboxIndex(null)}
      />

      {references.length === 0 ? (
        <EmptyState
          icon="pi pi-images"
          title="No reference images yet"
          message="Add concept art, mood references, and character sheets here, then link each image to the level or character it belongs to."
        />
      ) : (
        <div className="project-reference-grid">
          {references.map((reference, index) => (
            <ReferenceCard
              key={reference.id}
              reference={reference}
              index={index}
              levels={levels}
              characters={characters}
              notes={notes.filter(
                note => note.referenceImageId === reference.id
              )}
              onOpen={() => setLightboxIndex(index)}
              onRename={title =>
                renameReference.mutate({
                  referenceId: reference.id,
                  title,
                })
              }
              onAddLink={link =>
                addLink.mutate({ referenceId: reference.id, link })
              }
              onRemoveLink={linkId =>
                removeLink.mutate({ referenceId: reference.id, linkId })
              }
              onAddNote={values =>
                addNote.mutate({ referenceId: reference.id, ...values })
              }
              onRemove={() => {
                confirmDialog({
                  header: 'Remove reference image',
                  message: `Remove ${reference.title || reference.fileName} from this project? The file stays in your library.`,
                  icon: 'pi pi-exclamation-triangle',
                  acceptLabel: 'Remove',
                  rejectLabel: 'Cancel',
                  acceptClassName: 'p-button-danger',
                  accept: () => removeImage.mutate(reference.fileId),
                })
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ReferenceCard({
  reference,
  index,
  levels,
  characters,
  notes,
  onOpen,
  onRename,
  onAddLink,
  onRemoveLink,
  onAddNote,
  onRemove,
}: {
  reference: ProjectReferenceDto
  index: number
  levels: Array<{ id: number; name: string }>
  characters: Array<{ id: number; name: string }>
  notes: ProductionNoteDto[]
  onOpen: () => void
  onRename: (title: string) => void
  onAddLink: (link: {
    projectLevelId?: number | null
    projectCharacterId?: number | null
  }) => void
  onRemoveLink: (linkId: number) => void
  onAddNote: (values: { title: string; body: string }) => void
  onRemove: () => void
}) {
  const [title, setTitle] = useState(reference.title)
  const [picker, setPicker] = useState<LinkTarget | null>(null)
  const [showNote, setShowNote] = useState(false)

  const levelLinks = reference.links.filter(link => link.targetType === 'level')
  const characterLinks = reference.links.filter(
    link => link.targetType === 'character'
  )
  const linkedLevelIds = new Set(
    levelLinks.map(link => link.projectLevelId).filter(Boolean)
  )
  const linkedCharacterIds = new Set(
    characterLinks.map(link => link.projectCharacterId).filter(Boolean)
  )

  return (
    <article
      className="project-reference-card"
      data-testid="project-reference-card"
      data-file-id={reference.fileId}
    >
      <div className="project-reference-preview-wrap">
        <button
          type="button"
          className="project-reference-preview"
          aria-label={`Open reference ${index + 1}`}
          onClick={onOpen}
        >
          <img
            src={resolveApiAssetUrl(reference.previewUrl)}
            alt={reference.title || reference.fileName}
          />
        </button>
        <Button
          icon="pi pi-times"
          text
          rounded
          severity="danger"
          className="project-reference-remove"
          aria-label={`Remove reference ${reference.title || reference.fileName}`}
          title="Remove from project"
          onClick={onRemove}
        />
      </div>

      <div className="project-reference-body">
        <InputText
          aria-label={`Title for ${reference.fileName}`}
          className="project-reference-title"
          data-testid="project-reference-title"
          value={title}
          placeholder={reference.fileName}
          onChange={event => setTitle(event.target.value)}
          onBlur={() => {
            if (title.trim() !== reference.title) onRename(title.trim())
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />

        <LinkRow
          label="Levels"
          links={levelLinks}
          open={picker === 'level'}
          options={levels
            .filter(level => !linkedLevelIds.has(level.id))
            .map(level => ({ id: level.id, name: level.name }))}
          emptyText="No levels yet"
          onToggle={() => setPicker(picker === 'level' ? null : 'level')}
          onPick={levelId => {
            onAddLink({ projectLevelId: levelId, projectCharacterId: null })
            setPicker(null)
          }}
          onRemove={onRemoveLink}
        />

        <LinkRow
          label="Characters"
          links={characterLinks}
          open={picker === 'character'}
          options={characters
            .filter(character => !linkedCharacterIds.has(character.id))
            .map(character => ({ id: character.id, name: character.name }))}
          emptyText="No characters yet"
          onToggle={() =>
            setPicker(picker === 'character' ? null : 'character')
          }
          onPick={characterId => {
            onAddLink({ projectLevelId: null, projectCharacterId: characterId })
            setPicker(null)
          }}
          onRemove={onRemoveLink}
        />

        <div className="project-reference-notes">
          {notes.map(note => (
            <div
              className="project-reference-note"
              key={note.id}
              data-testid="project-reference-note"
            >
              <strong>{note.title}</strong>
              <p>{note.body}</p>
            </div>
          ))}
          {showNote ? (
            <NoteForm
              fileName={reference.fileName}
              onCancel={() => setShowNote(false)}
              onSubmit={values => {
                onAddNote(values)
                setShowNote(false)
              }}
            />
          ) : (
            <Button
              icon="pi pi-plus"
              text
              rounded
              aria-label={`Add note to ${reference.fileName}`}
              title="Add note"
              onClick={() => setShowNote(true)}
            />
          )}
        </div>
      </div>
    </article>
  )
}

function LinkRow({
  label,
  links,
  open,
  options,
  emptyText,
  onToggle,
  onPick,
  onRemove,
}: {
  label: string
  links: Array<{
    id: number
    projectLevelId: number | null
    projectLevelName: string | null
    projectCharacterId: number | null
    projectCharacterName: string | null
  }>
  open: boolean
  options: Array<{ id: number; name: string }>
  emptyText: string
  onToggle: () => void
  onPick: (id: number) => void
  onRemove: (linkId: number) => void
}) {
  const nameFor = (link: (typeof links)[number]) =>
    link.projectLevelName ?? link.projectCharacterName ?? 'Linked target'

  return (
    <div className="project-reference-link-row">
      <div className="project-reference-link-head">
        <span>{label}</span>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label={`Link ${label.toLowerCase().replace(/s$/, '')}`}
          title={`Link a ${label.toLowerCase().replace(/s$/, '')}`}
          onClick={onToggle}
        />
      </div>
      {links.length > 0 ? (
        <div className="project-reference-chips">
          {links.map(link => (
            <span
              className="project-reference-chip"
              key={link.id}
              data-testid="project-reference-chip"
              data-target-type={
                link.projectLevelId != null ? 'level' : 'character'
              }
            >
              {nameFor(link)}
              <button
                type="button"
                aria-label={`Unlink ${nameFor(link)}`}
                onClick={() => onRemove(link.id)}
              >
                <i className="pi pi-times" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {open ? (
        <div
          className="project-reference-picker"
          data-testid="project-reference-picker"
        >
          {options.length === 0 ? (
            <span className="project-reference-picker-empty">{emptyText}</span>
          ) : (
            options.map(option => (
              <button
                type="button"
                key={option.id}
                onClick={() => onPick(option.id)}
              >
                {option.name}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function NoteForm({
  fileName,
  onSubmit,
  onCancel,
}: {
  fileName: string
  onSubmit: (values: { title: string; body: string }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  return (
    <form
      className="project-reference-note-form"
      onSubmit={event => {
        event.preventDefault()
        if (title.trim() && body.trim()) {
          onSubmit({ title: title.trim(), body: body.trim() })
        }
      }}
    >
      <InputText
        aria-label={`Note title for ${fileName}`}
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder="Note title"
      />
      <textarea
        aria-label={`Note body for ${fileName}`}
        value={body}
        onChange={event => setBody(event.target.value)}
        placeholder="What should this image say?"
        rows={2}
      />
      <div className="project-reference-note-actions">
        <Button label="Cancel" text type="button" onClick={onCancel} />
        <Button
          type="submit"
          label="Save note"
          aria-label="Save note"
          disabled={!title.trim() || !body.trim()}
        />
      </div>
    </form>
  )
}
