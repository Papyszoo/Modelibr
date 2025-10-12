import { useState, useRef, useEffect, ReactNode } from 'react'
import { usePanelStore } from '../stores/panelStore'
import './FloatingWindow.css'

interface FloatingWindowProps {
  visible: boolean
  onClose: () => void
  title: string
  side?: 'left' | 'right' | 'none'
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
  const getInitialPosition = () => {
    if (side === 'none') {
      // Center of screen
      return {
        x: (window.innerWidth - 450) / 2,
        y: (window.innerHeight - 400) / 2,
      }
    }
    return side === 'left'
      ? { x: 20, y: 80 }
      : { x: window.innerWidth - 370, y: 80 }
  }

  const [position, setPosition] = useState(getInitialPosition())
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
    const TAB_BAR_WIDTH = 60
    let newPosition
    if (side === 'none') {
      newPosition = {
        x: (window.innerWidth - 450) / 2,
        y: (window.innerHeight - 400) / 2,
      }
    } else if (side === 'left') {
      newPosition = { x: 80, y: 80 }
    } else {
      newPosition = { x: window.innerWidth - 370 - TAB_BAR_WIDTH, y: 80 }
    }
    setPosition(newPosition)
  }, [side])

  // Reposition window if it ends up on wrong panel after splitter resize
  // Only apply this logic for left/right sides, not for 'none'
  useEffect(() => {
    if (side === 'none') return // Skip panel repositioning for 'none' side

    const windowElement = windowRef.current
    const windowElementWidth = windowElement?.offsetWidth || 350
    const TAB_BAR_WIDTH = 60

    // Check if window is on wrong side
    if (side === 'left' && position.x >= leftPanelWidth) {
      // Window is on right panel but should be on left
      setPosition({ x: 80, y: position.y })
    } else if (
      side === 'right' &&
      position.x + windowElementWidth <= leftPanelWidth
    ) {
      // Window is on left panel but should be on right
      const newX = Math.max(
        leftPanelWidth,
        window.innerWidth - windowElementWidth - TAB_BAR_WIDTH - 20
      )
      setPosition({ x: newX, y: position.y })
    }
  }, [leftPanelWidth, side, position.x, position.y])

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
        const windowElementHeight = windowElement?.offsetHeight || 300

        let newX = e.clientX - dragStart.x
        let newY = e.clientY - dragStart.y

        // Restrict Y position to keep window on screen (top and bottom)
        newY = Math.max(
          0,
          Math.min(newY, window.innerHeight - windowElementHeight)
        )

        if (side === 'none') {
          // For 'none' side, allow movement anywhere on screen
          newX = Math.max(0, Math.min(newX, window.innerWidth - windowElementWidth))
        } else {
          // Restrict dragging based on actual panel widths from zustand store
          // Account for 60px tab bar on both left and right panels
          const TAB_BAR_WIDTH = 60
          if (side === 'left') {
            // Keep on left panel - starts at tab bar (60px) and ends at panel width
            newX = Math.max(
              TAB_BAR_WIDTH,
              Math.min(newX, leftPanelWidth - windowElementWidth)
            )
          } else {
            // Keep on right panel - starts at panel boundary and ends before tab bar
            const rightPanelStart = leftPanelWidth
            newX = Math.max(
              rightPanelStart,
              Math.min(
                newX,
                window.innerWidth - windowElementWidth - TAB_BAR_WIDTH
              )
            )
          }
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
