import { useCallback, useRef, useState } from 'react'

export type PanelSide = 'left' | 'right' | 'top' | 'bottom'

interface UseResizableOptions {
  initialSize: number
  minSize?: number
  maxSize?: number
  /** If true, moving the mouse in the positive direction shrinks the panel (used for right/bottom panels) */
  reverse?: boolean
  direction?: 'horizontal' | 'vertical'
}

interface UseResizableResult {
  size: number
  setSize: (size: number) => void
  startResize: (e: React.MouseEvent) => void
  isResizing: boolean
}

export function useResizable({
  initialSize,
  minSize = 150,
  maxSize = 600,
  reverse = false,
  direction = 'horizontal',
}: UseResizableOptions): UseResizableResult {
  const [size, setSize] = useState(initialSize)
  const [isResizing, setIsResizing] = useState(false)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
      startSize.current = size
      setIsResizing(true)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos =
          direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY
        const rawDelta = currentPos - startPos.current
        const delta = reverse ? -rawDelta : rawDelta
        const newSize = Math.max(
          minSize,
          Math.min(maxSize, startSize.current + delta)
        )
        setSize(newSize)
      }

      const handleMouseUp = () => {
        setIsResizing(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor =
        direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction, size, minSize, maxSize, reverse]
  )

  return { size, setSize, startResize, isResizing }
}
