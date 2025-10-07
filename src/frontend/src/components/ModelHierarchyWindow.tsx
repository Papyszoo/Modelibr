import { useState, useRef, useEffect } from 'react'
import { useModelObject } from '../hooks/useModelObject'
import { useModelHierarchy } from '../hooks/useModelHierarchy'
import ModelHierarchy from './ModelHierarchy'
import './ModelHierarchyWindow.css'

interface ModelHierarchyWindowProps {
  visible: boolean
  onClose: () => void
}

function ModelHierarchyWindow({ visible, onClose }: ModelHierarchyWindowProps) {
  const { modelObject } = useModelObject()
  const hierarchy = useModelHierarchy(modelObject)
  const [collapsed, setCollapsed] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 80 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const windowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) {
      setCollapsed(false)
    }
  }, [visible])

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.hierarchy-window-header')) {
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
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
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
  }, [dragging, dragStart])

  if (!visible) return null

  return (
    <div
      ref={windowRef}
      className={`hierarchy-window ${collapsed ? 'collapsed' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="hierarchy-window-header">
        <span className="hierarchy-window-title">Model Hierarchy</span>
        <div className="hierarchy-window-controls">
          <button
            className="hierarchy-window-btn"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <i
              className={`pi ${collapsed ? 'pi-chevron-down' : 'pi-chevron-up'}`}
            />
          </button>
          <button
            className="hierarchy-window-btn"
            onClick={onClose}
            title="Close"
          >
            <i className="pi pi-times" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="hierarchy-window-content">
          <ModelHierarchy hierarchy={hierarchy} />
        </div>
      )}
    </div>
  )
}

export default ModelHierarchyWindow
