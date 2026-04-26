import { forwardRef, ReactNode } from 'react'

import { useDragAndDrop } from '@/shared/hooks/useFileUpload'

import './UploadDropZone.css'

interface UploadDropZoneProps {
  onFilesDropped: (files: File[]) => void
  children: ReactNode
  className?: string
  disabled?: boolean
}

/**
 * Canonical drop-zone wrapper. Provides a single visual treatment (dashed
 * primary-color border + subtle background) for file drag-and-drop across
 * the app, and routes drops to `onFilesDropped`.
 *
 * The wrapped element receives `.upload-drop-zone` plus any caller-provided
 * `className` for layout, and toggles `.drag-over` while a file drag is over
 * it. Tab drags and other non-file drags are ignored at the hook level.
 *
 * Pass `disabled` to opt out (e.g. while a modal owns drag handling).
 */
export const UploadDropZone = forwardRef<HTMLDivElement, UploadDropZoneProps>(
  function UploadDropZone(
    { onFilesDropped, children, className, disabled = false },
    ref
  ) {
    const handlers = useDragAndDrop(onFilesDropped)
    const dragHandlers = disabled ? {} : handlers

    return (
      <div
        ref={ref}
        className={
          className ? `upload-drop-zone ${className}` : 'upload-drop-zone'
        }
        {...dragHandlers}
      >
        {children}
      </div>
    )
  }
)

export default UploadDropZone
