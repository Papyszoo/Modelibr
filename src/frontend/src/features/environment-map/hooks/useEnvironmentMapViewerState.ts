import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  type ExpandAction,
  type PanelSide,
} from '@/features/model-viewer/components/PanelWrapper'
import { useTabUiState } from '@/hooks/useTabUiState'

export type ViewerPanelContent = 'information' | 'thumbnail' | null

export interface ViewerCornerState {
  topLeft: 'vertical' | 'horizontal'
  topRight: 'vertical' | 'horizontal'
  bottomLeft: 'vertical' | 'horizontal'
  bottomRight: 'vertical' | 'horizontal'
}

export interface ViewerPanelSizes {
  left: number
  right: number
  top: number
  bottom: number
}

interface ViewerLayoutState {
  leftPanel: ViewerPanelContent
  rightPanel: ViewerPanelContent
  topPanel: ViewerPanelContent
  bottomPanel: ViewerPanelContent
  corners: ViewerCornerState
  panelSizes: ViewerPanelSizes
}

const DEFAULT_VIEWER_CORNERS: ViewerCornerState = {
  topLeft: 'vertical',
  topRight: 'vertical',
  bottomLeft: 'vertical',
  bottomRight: 'vertical',
}

const DEFAULT_PANEL_SIZES: ViewerPanelSizes = {
  left: 280,
  right: 320,
  top: 220,
  bottom: 260,
}

const DEFAULT_VIEWER_LAYOUT: ViewerLayoutState = {
  leftPanel: null,
  rightPanel: null,
  topPanel: null,
  bottomPanel: null,
  corners: DEFAULT_VIEWER_CORNERS,
  panelSizes: DEFAULT_PANEL_SIZES,
}

export const PANEL_OPTIONS: Array<{
  label: string
  value: ViewerPanelContent
  icon: string
}> = [
  { label: 'Informations', value: 'information', icon: 'pi pi-info-circle' },
  { label: 'Thumbnail', value: 'thumbnail', icon: 'pi pi-image' },
]

export function useEnvironmentMapViewerState(stableTabId: string) {
  const [savedLayout, setSavedLayout] = useTabUiState<ViewerLayoutState>(
    stableTabId,
    'environmentMapViewerLayout',
    DEFAULT_VIEWER_LAYOUT
  )
  const [leftPanel, setLeftPanel] = useState<ViewerPanelContent>(
    savedLayout.leftPanel
  )
  const [rightPanel, setRightPanel] = useState<ViewerPanelContent>(
    savedLayout.rightPanel
  )
  const [topPanel, setTopPanel] = useState<ViewerPanelContent>(
    savedLayout.topPanel
  )
  const [bottomPanel, setBottomPanel] = useState<ViewerPanelContent>(
    savedLayout.bottomPanel
  )
  const [corners, setCorners] = useState<ViewerCornerState>(savedLayout.corners)
  const [panelSizes, setPanelSizes] = useState<ViewerPanelSizes>(
    savedLayout.panelSizes
  )
  const [resizing, setResizing] = useState<string | null>(null)
  const resizeStart = useRef({ pos: 0, size: 0 })
  const panelOpenOrder = useRef<string[]>([])

  useEffect(() => {
    setSavedLayout({
      leftPanel,
      rightPanel,
      topPanel,
      bottomPanel,
      corners,
      panelSizes,
    })
  }, [
    bottomPanel,
    corners,
    leftPanel,
    panelSizes,
    rightPanel,
    setSavedLayout,
    topPanel,
  ])

  const handlePanelChange = useCallback(
    (side: PanelSide, value: ViewerPanelContent) => {
      const setters = {
        left: setLeftPanel,
        right: setRightPanel,
        top: setTopPanel,
        bottom: setBottomPanel,
      }
      const currentPanels = {
        left: leftPanel,
        right: rightPanel,
        top: topPanel,
        bottom: bottomPanel,
      }

      if (value === null) {
        panelOpenOrder.current = panelOpenOrder.current.filter(
          panelSide => panelSide !== side
        )
      } else if (currentPanels[side] === null) {
        panelOpenOrder.current.push(side)

        if (side === 'top') {
          setCorners(previous => ({
            ...previous,
            topLeft: leftPanel ? 'vertical' : 'horizontal',
            topRight: rightPanel ? 'vertical' : 'horizontal',
          }))
        } else if (side === 'bottom') {
          setCorners(previous => ({
            ...previous,
            bottomLeft: leftPanel ? 'vertical' : 'horizontal',
            bottomRight: rightPanel ? 'vertical' : 'horizontal',
          }))
        } else if (side === 'left') {
          setCorners(previous => ({
            ...previous,
            topLeft: topPanel ? 'horizontal' : 'vertical',
            bottomLeft: bottomPanel ? 'horizontal' : 'vertical',
          }))
        } else if (side === 'right') {
          setCorners(previous => ({
            ...previous,
            topRight: topPanel ? 'horizontal' : 'vertical',
            bottomRight: bottomPanel ? 'horizontal' : 'vertical',
          }))
        }
      }

      setters[side](value)
    },
    [bottomPanel, leftPanel, rightPanel, topPanel]
  )

  const startResize = useCallback(
    (side: keyof ViewerPanelSizes, event: ReactMouseEvent) => {
      event.preventDefault()
      const isHorizontal = side === 'left' || side === 'right'
      resizeStart.current = {
        pos: isHorizontal ? event.clientX : event.clientY,
        size: panelSizes[side],
      }
      setResizing(side)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY
        const rawDelta = currentPos - resizeStart.current.pos
        const reverse = side === 'right' || side === 'bottom'
        const delta = reverse ? -rawDelta : rawDelta
        const nextSize = Math.max(
          180,
          Math.min(640, resizeStart.current.size + delta)
        )

        setPanelSizes(previous => ({ ...previous, [side]: nextSize }))
      }

      const handleMouseUp = () => {
        setResizing(null)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [panelSizes]
  )

  const getExpandActions = (side: PanelSide): ExpandAction[] => {
    const hasLeft = leftPanel !== null
    const hasRight = rightPanel !== null
    const hasTop = topPanel !== null
    const hasBottom = bottomPanel !== null

    switch (side) {
      case 'left':
        return [
          ...(hasTop && corners.topLeft === 'horizontal'
            ? [
                {
                  direction: 'up' as const,
                  tooltip: 'Expand to top-left corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      topLeft: 'vertical',
                    })),
                },
              ]
            : []),
          ...(hasBottom && corners.bottomLeft === 'horizontal'
            ? [
                {
                  direction: 'down' as const,
                  tooltip: 'Expand to bottom-left corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      bottomLeft: 'vertical',
                    })),
                },
              ]
            : []),
        ]
      case 'right':
        return [
          ...(hasTop && corners.topRight === 'horizontal'
            ? [
                {
                  direction: 'up' as const,
                  tooltip: 'Expand to top-right corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      topRight: 'vertical',
                    })),
                },
              ]
            : []),
          ...(hasBottom && corners.bottomRight === 'horizontal'
            ? [
                {
                  direction: 'down' as const,
                  tooltip: 'Expand to bottom-right corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      bottomRight: 'vertical',
                    })),
                },
              ]
            : []),
        ]
      case 'top':
        return [
          ...(hasLeft && corners.topLeft === 'vertical'
            ? [
                {
                  direction: 'left' as const,
                  tooltip: 'Expand to top-left corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      topLeft: 'horizontal',
                    })),
                },
              ]
            : []),
          ...(hasRight && corners.topRight === 'vertical'
            ? [
                {
                  direction: 'right' as const,
                  tooltip: 'Expand to top-right corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      topRight: 'horizontal',
                    })),
                },
              ]
            : []),
        ]
      case 'bottom':
        return [
          ...(hasLeft && corners.bottomLeft === 'vertical'
            ? [
                {
                  direction: 'left' as const,
                  tooltip: 'Expand to bottom-left corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      bottomLeft: 'horizontal',
                    })),
                },
              ]
            : []),
          ...(hasRight && corners.bottomRight === 'vertical'
            ? [
                {
                  direction: 'right' as const,
                  tooltip: 'Expand to bottom-right corner',
                  onClick: () =>
                    setCorners(previous => ({
                      ...previous,
                      bottomRight: 'horizontal',
                    })),
                },
              ]
            : []),
        ]
    }
  }

  return {
    leftPanel,
    rightPanel,
    topPanel,
    bottomPanel,
    corners,
    panelSizes,
    resizing,
    handlePanelChange,
    startResize,
    getExpandActions,
  }
}
