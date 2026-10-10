import './RecycleToastContent.css'

import { type JSX } from 'react'

/**
 * How long an Undo toast stays on screen. Every toast that offers an Undo
 * action uses this, so a mis-click is equally recoverable wherever it happens.
 * Longer than a plain confirmation: the user has to notice the mistake, read
 * the action and reach for it.
 */
export const UNDO_TOAST_LIFE_MS = 8000

/**
 * The body of a "recycled" success toast: an icon, what was recycled, and an
 * Undo action that restores it.
 *
 * The same shape model and material cards show after Recycle, shared so every
 * recycle path offers the same one-click way back. Returned from a function
 * (not a component) so the recycle mutations that live in `.ts` hooks can pass
 * it straight to a PrimeReact toast's `content` without JSX in those files.
 */
export function recycleToastContent(
  message: string,
  onUndo: () => void,
  testId = 'recycle-undo'
): JSX.Element {
  return (
    <div className="recycle-toast">
      <i className="pi pi-trash" aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        className="p-button p-button-text p-button-sm"
        data-testid={testId}
        onClick={onUndo}
      >
        Undo
      </button>
    </div>
  )
}
