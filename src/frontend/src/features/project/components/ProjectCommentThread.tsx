import './ProjectCommentThread.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Toast } from 'primereact/toast'
import { type ReactNode, useRef, useState } from 'react'

import {
  createProjectComment,
  type ProjectCommentDto,
  type ProjectCommentRequest,
  type ProjectCommentTarget,
  updateProjectComment,
} from '@/features/project/api/projectStudioApi'
import { useProjectCommentsQuery } from '@/features/project/api/projectStudioQueries'
import {
  commentTarget,
  commentTargetFields,
  isCommentOn,
} from '@/features/project/commentTargets'

/** Open first, then resolved; each group keeps the server's pinned-then-recent order. */
function ordered(comments: ProjectCommentDto[]): ProjectCommentDto[] {
  return [
    ...comments.filter(comment => comment.status !== 'resolved'),
    ...comments.filter(comment => comment.status === 'resolved'),
  ]
}

/** One project's comments, its query key, and the two writes every thread needs. */
function useProjectComments(projectId: number) {
  const queryClient = useQueryClient()
  const query = useProjectCommentsQuery(projectId)
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['projects', projectId, 'comments'],
    })

  const create = useMutation({
    mutationFn: (request: ProjectCommentRequest) =>
      createProjectComment(projectId, request),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: (input: {
      comment: ProjectCommentDto
      changes: Partial<
        Pick<
          ProjectCommentRequest,
          'title' | 'body' | 'isPinned' | 'status' | 'resolution'
        >
      >
    }) =>
      // The update route replaces the whole comment, so its target is resent
      // or the comment would be detached from what it is about.
      updateProjectComment(projectId, input.comment.id, {
        ...commentTargetFields(commentTarget(input.comment)),
        title: input.comment.title,
        body: input.comment.body,
        isPinned: input.comment.isPinned,
        ...input.changes,
      }),
    onSuccess: invalidate,
  })

  return { query, create, update }
}

export interface ProjectCommentThreadProps {
  projectId: number
  /** What new comments are about; null is the project itself. */
  target: ProjectCommentTarget | null
  /** The target's name, for accessible labels ("Add comment to Crate"). */
  targetName: string
  heading?: string
  /**
   * List every comment in the project instead of the target's own - the
   * project overview. New comments still go to `target`.
   */
  listAll?: boolean
  /** A line under each comment saying what it is about, for `listAll`. */
  describeTarget?: (comment: ProjectCommentDto) => ReactNode
  /**
   * `always` keeps the composer open below the list (the comments panel);
   * `toggle` hides it behind the + button (inline sections).
   */
  composer?: 'always' | 'toggle'
  titlePlaceholder?: string
  bodyPlaceholder?: string
  /** `data-testid` of each comment row. */
  itemTestId?: string
}

/**
 * The one comment thread every project surface uses: an asset's comments
 * panel, a character's comments section, a reference card, the overview.
 *
 * Reads the project's whole comment list (one cached request) and filters it
 * to its target, so a badge count and the thread it opens can never disagree.
 */
export function ProjectCommentThread({
  projectId,
  target,
  targetName,
  heading = 'Comments',
  listAll = false,
  describeTarget,
  composer = 'toggle',
  titlePlaceholder = 'Comment title',
  bodyPlaceholder = 'What should change, or what was decided?',
  itemTestId = 'project-comment',
}: ProjectCommentThreadProps) {
  const { query, create, update } = useProjectComments(projectId)
  const [composerOpen, setComposerOpen] = useState(false)
  const toast = useRef<Toast>(null)

  const comments = ordered(
    (query.data ?? []).filter(
      comment => listAll || isCommentOn(comment, target)
    )
  )
  const openCount = comments.filter(
    comment => comment.status !== 'resolved'
  ).length
  const showComposer = composer === 'always' || composerOpen

  return (
    <section
      className="project-comment-thread"
      data-testid="project-comment-thread"
      aria-label={`${heading} on ${targetName}`}
    >
      <Toast ref={toast} />
      <div className="project-comment-thread-header">
        <div className="project-comment-thread-title">
          <h5>{heading}</h5>
          <span
            className="project-comment-thread-count"
            data-testid="project-comment-open-count"
          >
            {openCount} open
          </span>
        </div>
        {composer === 'toggle' ? (
          <Button
            icon={composerOpen ? 'pi pi-times' : 'pi pi-plus'}
            text
            rounded
            aria-label={
              composerOpen
                ? 'Close the comment form'
                : `Add comment to ${targetName}`
            }
            title={composerOpen ? 'Close' : 'Add comment'}
            onClick={() => setComposerOpen(current => !current)}
          />
        ) : null}
      </div>

      {query.isLoading ? (
        <p className="project-comment-thread-empty">Loading comments…</p>
      ) : query.error ? (
        <p className="project-comment-thread-empty" role="alert">
          Comments could not be loaded.
        </p>
      ) : comments.length === 0 && !showComposer ? (
        <p className="project-comment-thread-empty">No comments yet.</p>
      ) : null}

      {comments.length > 0 ? (
        <div className="project-comment-list">
          {comments.map(comment => (
            <ProjectCommentItem
              key={comment.id}
              comment={comment}
              testId={itemTestId}
              meta={describeTarget?.(comment)}
              pending={update.isPending}
              onChange={changes => update.mutate({ comment, changes })}
            />
          ))}
        </div>
      ) : null}

      {showComposer ? (
        <CommentComposer
          targetName={targetName}
          titlePlaceholder={titlePlaceholder}
          bodyPlaceholder={bodyPlaceholder}
          pending={create.isPending}
          onCancel={
            composer === 'toggle' ? () => setComposerOpen(false) : undefined
          }
          onSubmit={async values => {
            try {
              await create.mutateAsync({
                ...commentTargetFields(target),
                ...values,
              })
              setComposerOpen(false)
              toast.current?.show({
                severity: 'success',
                summary: 'Comment added',
                detail: 'The comment was added.',
                life: 2500,
              })
            } catch (error) {
              toast.current?.show({
                severity: 'error',
                summary: 'Could not add comment',
                detail:
                  error instanceof Error
                    ? error.message
                    : 'The comment could not be added.',
                life: 4000,
              })
            }
          }}
        />
      ) : null}
    </section>
  )
}

function CommentComposer({
  targetName,
  titlePlaceholder,
  bodyPlaceholder,
  pending,
  onSubmit,
  onCancel,
}: {
  targetName: string
  titlePlaceholder: string
  bodyPlaceholder: string
  pending: boolean
  onSubmit: (values: {
    title: string
    body: string
    isPinned: boolean
  }) => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPinned, setIsPinned] = useState(false)
  const ready = title.trim().length > 0 && body.trim().length > 0

  return (
    <form
      className="project-comment-form"
      data-testid="project-comment-form"
      onSubmit={async event => {
        event.preventDefault()
        if (!ready || pending) return
        await onSubmit({ title: title.trim(), body: body.trim(), isPinned })
        setTitle('')
        setBody('')
        setIsPinned(false)
      }}
    >
      <InputText
        aria-label={`Comment title for ${targetName}`}
        value={title}
        onChange={event => setTitle(event.target.value)}
        placeholder={titlePlaceholder}
      />
      <InputTextarea
        aria-label={`Comment for ${targetName}`}
        value={body}
        onChange={event => setBody(event.target.value)}
        rows={2}
        autoResize
        placeholder={bodyPlaceholder}
      />
      <div className="project-comment-form-actions">
        <label className="project-comment-pin-toggle">
          <input
            type="checkbox"
            checked={isPinned}
            onChange={event => setIsPinned(event.target.checked)}
          />
          Pin as decision
        </label>
        {onCancel ? (
          <Button
            label="Cancel"
            text
            size="small"
            type="button"
            onClick={onCancel}
          />
        ) : null}
        <Button
          type="submit"
          label="Add comment"
          size="small"
          disabled={!ready || pending}
        />
      </div>
    </form>
  )
}

type CommentChanges = Partial<
  Pick<
    ProjectCommentRequest,
    'title' | 'body' | 'isPinned' | 'status' | 'resolution'
  >
>

/**
 * One comment: read, edit, pin as a decision, resolve with an optional
 * resolution, reopen. A resolved comment stays in the thread, quieter, so the
 * reason something changed is still there to read.
 */
function ProjectCommentItem({
  comment,
  testId,
  meta,
  pending,
  onChange,
}: {
  comment: ProjectCommentDto
  testId: string
  meta?: ReactNode
  pending: boolean
  onChange: (changes: CommentChanges) => void
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'resolve'>('view')
  const [title, setTitle] = useState(comment.title)
  const [body, setBody] = useState(comment.body)
  const [resolution, setResolution] = useState('')
  const resolved = comment.status === 'resolved'

  const className = [
    'project-comment',
    resolved ? 'is-resolved' : '',
    comment.isPinned ? 'is-pinned' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (mode === 'edit') {
    return (
      <form
        className="project-comment-form"
        data-testid={`${testId}-edit`}
        onSubmit={event => {
          event.preventDefault()
          if (!title.trim() || !body.trim()) return
          onChange({ title: title.trim(), body: body.trim() })
          setMode('view')
        }}
      >
        <InputText
          aria-label="Edit comment title"
          value={title}
          onChange={event => setTitle(event.target.value)}
        />
        <InputTextarea
          aria-label="Edit comment"
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={2}
          autoResize
        />
        <div className="project-comment-form-actions">
          <Button
            label="Cancel"
            text
            size="small"
            type="button"
            onClick={() => setMode('view')}
          />
          <Button
            type="submit"
            label="Save"
            size="small"
            disabled={!title.trim() || !body.trim() || pending}
          />
        </div>
      </form>
    )
  }

  return (
    <article
      className={className}
      data-testid={testId}
      data-comment-title={comment.title}
      data-status={comment.status}
    >
      <div className="project-comment-heading">
        <strong className="project-comment-title">{comment.title}</strong>
        {comment.isPinned ? (
          <span className="project-comment-chip is-decision">Decision</span>
        ) : null}
        {resolved ? (
          <span className="project-comment-chip is-resolved">Resolved</span>
        ) : null}
        <div className="project-comment-actions">
          <button
            type="button"
            className="project-comment-icon"
            aria-label={
              comment.isPinned
                ? `Unpin ${comment.title}`
                : `Pin ${comment.title} as a decision`
            }
            title={comment.isPinned ? 'Unpin' : 'Pin as decision'}
            onClick={() => onChange({ isPinned: !comment.isPinned })}
          >
            <i
              className={
                comment.isPinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark'
              }
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="project-comment-icon"
            aria-label={`Edit ${comment.title}`}
            title="Edit"
            onClick={() => {
              // Start from the stored text so an abandoned edit never leaks
              // into the next one.
              setTitle(comment.title)
              setBody(comment.body)
              setMode('edit')
            }}
          >
            <i className="pi pi-pencil" aria-hidden="true" />
          </button>
          {resolved ? (
            <button
              type="button"
              className="project-comment-icon"
              aria-label={`Reopen ${comment.title}`}
              title="Reopen"
              disabled={pending}
              onClick={() => onChange({ status: 'open', resolution: null })}
            >
              <i className="pi pi-replay" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="project-comment-icon is-resolve"
              aria-label={`Resolve ${comment.title}`}
              title="Resolve"
              onClick={() => {
                setResolution('')
                setMode(current => (current === 'resolve' ? 'view' : 'resolve'))
              }}
            >
              <i className="pi pi-check-circle" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <p className="project-comment-body">{comment.body}</p>
      {resolved && comment.resolution ? (
        <p
          className="project-comment-resolution"
          data-testid="project-comment-resolution"
        >
          <i className="pi pi-check" aria-hidden="true" />
          <span>{comment.resolution}</span>
        </p>
      ) : null}
      {meta ? <small className="project-comment-meta">{meta}</small> : null}
      {mode === 'resolve' ? (
        <form
          className="project-comment-resolve-form"
          onSubmit={event => {
            event.preventDefault()
            onChange({
              status: 'resolved',
              resolution: resolution.trim() || null,
            })
            setMode('view')
          }}
        >
          <InputTextarea
            aria-label={`Resolution for ${comment.title}`}
            value={resolution}
            onChange={event => setResolution(event.target.value)}
            rows={1}
            autoResize
            placeholder="What changed? (optional)"
          />
          <div className="project-comment-form-actions">
            <Button
              label="Cancel"
              text
              size="small"
              type="button"
              onClick={() => setMode('view')}
            />
            <Button
              type="submit"
              label="Resolve"
              icon="pi pi-check"
              size="small"
              disabled={pending}
            />
          </div>
        </form>
      ) : null}
    </article>
  )
}
