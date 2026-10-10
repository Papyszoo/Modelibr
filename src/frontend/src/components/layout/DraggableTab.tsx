import './DraggableTab.css'

import { Tooltip } from 'primereact/tooltip'
import { type JSX, useRef } from 'react'

import { getWindowId } from '@/stores/navigationStore'
import { type Tab } from '@/types'

import { TabGlyph } from './TabGlyph'
import { getTabIcon } from './tabIcons'

const getTabTooltip = (tab: Tab): string => {
  switch (tab.type) {
    case 'newTab':
      return 'New Tab'
    case 'modelList':
      return 'Models List'
    case 'modelViewer':
      return `Model: ${tab.label || tab.modelId || 'Unknown'}`
    case 'globalMaterials':
      return 'Global Materials'
    case 'pbrMaterials':
      return 'PBR Materials'
    case 'modelTextures':
      return 'Multi-Model Textures'
    case 'textureSetViewer': {
      return `Texture Set: ${tab.label || tab.setId || 'Unknown'}`
    }
    case 'environmentMaps':
      return 'Environment Maps'
    case 'environmentMapViewer':
      return `Environment Map: ${tab.label || tab.environmentMapId || 'Unknown'}`
    case 'packs':
      return 'Packs'
    case 'packViewer': {
      return `Pack: ${tab.label || tab.packId || 'Unknown'}`
    }
    case 'projects':
      return 'Projects'
    case 'projectViewer':
      return `Project: ${tab.label || tab.projectId || 'Unknown'}`
    case 'assetStore':
      return 'Asset Store'
    case 'settings':
      return 'Settings'
    case 'history':
      return 'Upload History'
    case 'recycledFiles':
      return 'Recycled Files'
    case 'sprites':
      return 'Sprites'
    case 'sounds':
      return 'Sounds'
    case 'scripts':
      return 'Scripts'
    case 'stageEditor':
      return 'Stage Editor'
    case 'stageList':
      return 'Stages List'
    case 'scenes':
      return 'Scenes'
    case 'sceneEditor':
      return `Scene: ${tab.label || tab.sceneId || 'Unknown'}`
    case 'vfxList':
      return 'VFX'
    case 'vfxEditor':
      return `Effect: ${tab.label || tab.params.vfxId || 'Unknown'}`
    default:
      return tab.label || 'Unknown Tab'
  }
}

interface DraggableTabProps {
  tab: Tab
  isActive: boolean
  onSelect: () => void
  onClose: () => void
  onDragStart: (tab: Tab) => boolean
  onDragEnd: () => void
  /** Where the tooltip should appear relative to the tab. */
  tooltipPosition?: 'left' | 'right' | 'top' | 'bottom'
  /**
   * False for a pinned page in the main dock: it stays in its slot, so it has
   * no close button and middle-click does not close it.
   */
  closable?: boolean
}

export function DraggableTab({
  tab,
  isActive,
  onSelect,
  onClose,
  onDragStart,
  onDragEnd,
  tooltipPosition = 'right',
  closable = true,
}: DraggableTabProps): JSX.Element {
  const tabRef = useRef<HTMLDivElement | null>(null)

  // PrimeReact's Tooltip hides via a `mouseleave` listener on the target. If
  // the target is removed from the DOM mid-show (close click while hovered),
  // mouseleave never fires and the portaled tooltip element is orphaned on
  // <body>. Dispatching mouseleave synchronously before unmount lets the
  // tooltip's hide path run in the same React batch as the tab removal.
  const dismissTooltip = (): void => {
    tabRef.current?.dispatchEvent(new MouseEvent('mouseleave'))
  }

  const handleDragStart = (e: React.DragEvent): void => {
    if (onDragStart(tab) === false) {
      e.preventDefault()
      return
    }

    e.dataTransfer.effectAllowed = 'move'
    // Legacy plain text for intra-window drags
    e.dataTransfer.setData('text/plain', tab.id)
    // Full tab config for cross-window drags
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        tab,
        sourceWindowId: getWindowId(),
      })
    )
  }

  const handleDragEnd = (): void => {
    onDragEnd()
  }

  const handleClick = (): void => {
    // Clicking a tab opens its content but leaves the pointer on the icon, so
    // the tooltip would stay up over the page. Dismiss it the same way the
    // close button does.
    dismissTooltip()
    onSelect()
  }

  const handleCloseClick = (e: React.MouseEvent): void => {
    e.stopPropagation() // Prevent tab selection when clicking close
    dismissTooltip()
    onClose()
  }

  const handleMouseDown = (e: React.MouseEvent): void => {
    // Middle button click (button === 1) should close the tab
    // This follows browser tab conventions and doesn't interfere with:
    // - Left button (0): used for selection and dragging
    // - Right button (2): used for context menu
    if (e.button === 1) {
      e.preventDefault() // Prevent default middle button behavior (e.g., auto-scroll)
      e.stopPropagation() // Prevent tab selection when closing
      if (!closable) return
      dismissTooltip()
      onClose()
    }
  }

  const tooltipId = `tab-tooltip-${tab.id}`

  return (
    <>
      <Tooltip
        target={`#${CSS.escape(tooltipId)}`}
        showDelay={0}
        hideDelay={0}
      />
      <div
        ref={tabRef}
        id={tooltipId}
        className={`draggable-tab ${isActive ? 'active' : ''}`}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        data-tab-type={tab.type}
        aria-label={getTabTooltip(tab)}
        data-pr-tooltip={getTabTooltip(tab)}
        data-pr-position={tooltipPosition}
      >
        <TabGlyph tab={tab} icon={getTabIcon(tab.type)} />

        {/* Close button in top right corner */}
        {closable && (
          <button
            className="tab-close-btn p-component"
            onClick={handleCloseClick}
            aria-label="Close tab"
          >
            ×
          </button>
        )}
      </div>
    </>
  )
}
