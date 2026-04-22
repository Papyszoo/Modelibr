import {
  Dialog as PrimeDialog,
  type DialogProps as PrimeDialogProps,
} from 'primereact/dialog'
import type { CSSProperties } from 'react'

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const SIZE_TO_WIDTH: Record<DialogSize, string> = {
  sm: '420px',
  md: '560px',
  lg: '760px',
  xl: '960px',
  full: '92vw',
}

export interface DialogProps
  extends Omit<PrimeDialogProps, 'visible' | 'onHide' | 'style'> {
  /** Controlled open state. */
  open: boolean
  /** Called when the user dismisses the dialog (close button, escape, mask click). */
  onClose: () => void
  /** Width preset. Use `style.width` to override. */
  size?: DialogSize
  /** Optional inline style. Merges with the size preset. */
  style?: CSSProperties
}

/**
 * Opinionated wrapper around PrimeReact's `Dialog`.
 *
 * Defaults that match the Modelibr conventions:
 *   - modal + non-draggable + non-resizable
 *   - dismissable on mask click and escape
 *   - width from a size preset (overridable via `style.width`)
 *
 * Use this in place of `import { Dialog } from 'primereact/dialog'`
 * so dialog look-and-feel stays consistent app-wide.
 */
export function Dialog({
  open,
  onClose,
  size = 'md',
  style,
  draggable = false,
  resizable = false,
  modal = true,
  dismissableMask = true,
  closeOnEscape = true,
  ...rest
}: DialogProps) {
  return (
    <PrimeDialog
      visible={open}
      onHide={onClose}
      modal={modal}
      draggable={draggable}
      resizable={resizable}
      dismissableMask={dismissableMask}
      closeOnEscape={closeOnEscape}
      style={{ width: SIZE_TO_WIDTH[size], ...style }}
      {...rest}
    />
  )
}
