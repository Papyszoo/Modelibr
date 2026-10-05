import './ProductionNoteItem.css'

import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { type ReactNode, useState } from 'react'

import type { ProductionNoteDto } from '@/features/project/api/projectStudioApi'

export interface ProductionNoteValues {
  title: string
  body: string
  isPinned: boolean
}

/**
 * One production note, editable in place.
 *
 * The studio, the reference board and the character card all list notes, and
 * each used to render a read-only copy: a note could be created but never
 * corrected, which is the one thing a note is for. The row lives once here -
 * view with a pin toggle and a pencil, edit title and body, save or cancel the
 * same way the abilities and variants edits do.
 *
 * The parent owns the mutation because each surface invalidates its own keys,
 * and because the update route needs the note's target ids resent with it.
 */
export function ProductionNoteItem({
  note,
  onSave,
  pending = false,
  meta,
  testId = 'production-note',
  className,
}: {
  note: ProductionNoteDto
  onSave: (values: ProductionNoteValues) => void
  pending?: boolean
  meta?: ReactNode
  testId?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)

  const startEdit = () => {
    // Start from the stored values so an abandoned edit never leaks into the
    // next one.
    setTitle(note.title)
    setBody(note.body)
    setEditing(true)
  }

  if (editing) {
    return (
      <form
        className="production-note-form"
        data-testid={`${testId}-edit`}
        onSubmit={event => {
          event.preventDefault()
          if (title.trim() && body.trim()) {
            onSave({
              title: title.trim(),
              body: body.trim(),
              isPinned: note.isPinned,
            })
            setEditing(false)
          }
        }}
      >
        <InputText
          aria-label="Edit note title"
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Note title"
        />
        <InputTextarea
          aria-label="Edit note body"
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={2}
          placeholder="What should the team remember?"
        />
        <div className="production-note-form-actions">
          <Button
            label="Cancel"
            text
            type="button"
            aria-label="Cancel note edit"
            onClick={() => setEditing(false)}
          />
          <Button
            type="submit"
            label="Save note"
            aria-label="Save note changes"
            disabled={!title.trim() || !body.trim() || pending}
          />
        </div>
      </form>
    )
  }

  return (
    <article
      className={`production-note${note.isPinned ? ' is-pinned' : ''}${
        className ? ` ${className}` : ''
      }`}
      data-testid={testId}
    >
      <div className="production-note-heading">
        <strong>{note.title}</strong>
        <div className="production-note-actions">
          <button
            type="button"
            className="production-note-icon"
            aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
            title={note.isPinned ? 'Unpin note' : 'Pin note'}
            onClick={() =>
              onSave({
                title: note.title,
                body: note.body,
                isPinned: !note.isPinned,
              })
            }
          >
            <i
              className={
                note.isPinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'
              }
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="production-note-icon"
            aria-label={`Edit note ${note.title}`}
            title="Edit note"
            onClick={startEdit}
          >
            <i className="pi pi-pencil" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p>{note.body}</p>
      {meta ? <small>{meta}</small> : null}
    </article>
  )
}
