import './ProjectCommentsBadge.css'

import { type SyntheticEvent, useState } from 'react'

import { type ProjectCommentTarget } from '@/features/project/api/projectStudioApi'
import { useProjectCommentsQuery } from '@/features/project/api/projectStudioQueries'
import { isCommentOn } from '@/features/project/commentTargets'
import { Dialog } from '@/shared/components'

import { ProjectCommentThread } from './ProjectCommentThread'

export interface ProjectCommentsBadgeProps {
  projectId: number
  target: ProjectCommentTarget
  targetName: string
  /**
   * `overlay` sits on a card's thumbnail; `inline` sits in a row or header
   * next to other compact controls.
   */
  variant?: 'overlay' | 'inline'
}

/** Keeps a click inside the badge or its panel from reaching the card. */
const stop = (event: SyntheticEvent) => event.stopPropagation()

/**
 * The comments affordance on anything a project shows: a count of its open
 * comments that opens the thread in a panel.
 *
 * The panel is portalled to the body, but React still bubbles its events
 * through this component - so the host swallows them, or typing a comment
 * would open, drag or select the card underneath.
 */
export function ProjectCommentsBadge({
  projectId,
  target,
  targetName,
  variant = 'overlay',
}: ProjectCommentsBadgeProps) {
  const [open, setOpen] = useState(false)
  const { data } = useProjectCommentsQuery(projectId)
  const comments = (data ?? []).filter(comment => isCommentOn(comment, target))
  const openCount = comments.filter(
    comment => comment.status !== 'resolved'
  ).length

  const label =
    openCount > 0
      ? `Comments on ${targetName}: ${openCount} open`
      : `Comments on ${targetName}`

  return (
    <span
      className="project-comments-badge-host"
      onClick={stop}
      onMouseDown={stop}
      onPointerDown={stop}
      onDoubleClick={stop}
      onAuxClick={stop}
      onContextMenu={stop}
      onKeyDown={stop}
      onDragStart={stop}
    >
      <button
        type="button"
        className={[
          'project-comments-badge',
          `project-comments-badge--${variant}`,
          openCount > 0 ? 'has-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        title={label}
        data-testid="project-comments-badge"
        data-open-count={openCount}
        onClick={() => setOpen(true)}
      >
        <i className="pi pi-comment" aria-hidden="true" />
        {openCount > 0 ? (
          <span className="project-comments-badge-count">{openCount}</span>
        ) : null}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        header={`Comments - ${targetName}`}
        size="md"
        className="project-comments-dialog"
      >
        <ProjectCommentThread
          projectId={projectId}
          target={target}
          targetName={targetName}
          composer="always"
        />
      </Dialog>
    </span>
  )
}
