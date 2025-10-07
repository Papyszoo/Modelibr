import { useState, useRef, useEffect, ReactNode } from 'react'
import './FloatingWindow.css'

interface FloatingWindowProps {
  visible: boolean
  onClose: () => void
  title: string
  side?: 'left' | 'right'
  children: ReactNode
}

function FloatingWindow({
  visible,
  onClose,
  title,
  side = 'left',
  children,
}: FloatingWindowProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Position based on side
  const initialPosition =
    side === 'left' ? { x: 20, y: 80 } : { x: window.innerWidth - 370, y: 80 }
  const [position, setPosition] = useState(initialPosition)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const windowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) {
      setCollapsed(false)
    }
  }, [visible])

  // Reset position when side changes
  useEffect(() => {
    const newPosition =
      side === 'left' ? { x: 20, y: 80 } : { x: window.innerWidth - 370, y: 80 }
    setPosition(newPosition)
  }, [side])

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.floating-window-header')) {
      setDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      })
    }
  }

  useEffect(() => {
    if (dragging) {
      const handleMove = (e: MouseEvent) => {
        const windowWidth = window.innerWidth
        const windowElement = windowRef.current
        const windowElementWidth = windowElement?.offsetWidth || 350

        let newX = e.clientX - dragStart.x
        const newY = Math.max(0, e.clientY - dragStart.y)

        // Restrict dragging to the correct side
        if (side === 'left') {
          // Keep on left half
          newX = Math.max(
            0,
            Math.min(newX, windowWidth / 2 - windowElementWidth)
          )
        } else {
          // Keep on right half
          newX = Math.max(
            windowWidth / 2,
            Math.min(newX, windowWidth - windowElementWidth)
          )
        }

        setPosition({
          x: newX,
          y: newY,
        })
      }

      const handleUp = () => {
        setDragging(false)
      }

      document.addEventListener('mousemove', handleMove)
      document.addEventListener('mouseup', handleUp)
      return () => {
        document.removeEventListener('mousemove', handleMove)
        document.removeEventListener('mouseup', handleUp)
      }
    }
  }, [dragging, dragStart, side])

  if (!visible) return null

  return (
    <div
      ref={windowRef}
      className={`floating-window ${collapsed ? 'collapsed' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="floating-window-header">
        <span className="floating-window-title">{title}</span>
        <div className="floating-window-controls">
          <button
            className="floating-window-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <i
              className={`pi ${collapsed ? 'pi-chevron-down' : 'pi-chevron-up'}`}
            />
          </button>
          <button
            className="floating-window-btn"
            onClick={onClose}
            title="Close"
          >
            <i className="pi pi-times" />
          </button>
        </div>
      </div>
      {!collapsed && <div className="floating-window-content">{children}</div>}
    </div>
  )
}

export default FloatingWindow
