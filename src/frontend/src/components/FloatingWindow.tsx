import { useState, useRef, useEffect, ReactNode } from 'react'
import { usePanelStore } from '../stores/panelStore'
import './FloatingWindow.css'

interface FloatingWindowProps {
  visible: boolean
  onClose: () => void
  title: string
  side?: 'left' | 'right'
  children: ReactNode
  windowId: string
}

function FloatingWindow({
  visible,
  onClose,
  title,
  side = 'left',
  children,
  windowId,
}: FloatingWindowProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Get panel sizes and active window from store
  const { leftPanelWidth, activeWindowId, setActiveWindow } = usePanelStore()

  // Position based on side
  const initialPosition =
    side === 'left' ? { x: 20, y: 80 } : { x: window.innerWidth - 370, y: 80 }
  const [position, setPosition] = useState(initialPosition)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const windowRef = useRef<HTMLDivElement>(null)

  // Calculate z-index based on whether this window is active
  const isActive = activeWindowId === windowId
  const zIndex = isActive ? 1001 : 1000

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

  // Set this window as active when it becomes visible or is clicked
  useEffect(() => {
    if (visible) {
      setActiveWindow(windowId)
    }
  }, [visible, windowId, setActiveWindow])

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.floating-window-header')) {
      setDragging(true)
      setActiveWindow(windowId) // Set as active when dragging starts
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      })
    }
  }

  const handleWindowClick = () => {
    if (!isActive) {
      setActiveWindow(windowId)
    }
  }

  useEffect(() => {
    if (dragging) {
      const handleMove = (e: MouseEvent) => {
        const windowElement = windowRef.current
        const windowElementWidth = windowElement?.offsetWidth || 350

        let newX = e.clientX - dragStart.x
        const newY = Math.max(0, e.clientY - dragStart.y)

        // Restrict dragging based on actual panel widths from zustand store
        if (side === 'left') {
          // Keep on left panel
          newX = Math.max(
            0,
            Math.min(newX, leftPanelWidth - windowElementWidth)
          )
        } else {
          // Keep on right panel
          const rightPanelStart = leftPanelWidth
          newX = Math.max(
            rightPanelStart,
            Math.min(newX, window.innerWidth - windowElementWidth)
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
  }, [dragging, dragStart, side, leftPanelWidth])

  if (!visible) return null

  return (
    <div
      ref={windowRef}
      className={`floating-window ${collapsed ? 'collapsed' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleWindowClick}
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
