import './EnvironmentMapViewer.css'

import { Button } from 'primereact/button'
import { Menubar } from 'primereact/menubar'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  useAddEnvironmentMapVariantWithFileMutation,
  useEnvironmentMapByIdQuery,
  useRegenerateEnvironmentMapThumbnailMutation,
  useSetEnvironmentMapCustomThumbnailMutation,
} from '@/features/environment-map/api/queries'
import { EnvironmentMapPreviewCanvas } from '@/features/environment-map/components/EnvironmentMapPreviewCanvas'
import {
  EnvironmentMapUploadDialog,
  type EnvironmentMapUploadDialogSubmitValues,
} from '@/features/environment-map/components/EnvironmentMapUploadDialog'
import {
  type EnvironmentMapPreviewOption,
  getEnvironmentMapPreviewOptions,
  getEnvironmentMapPrimaryPreviewUrl,
} from '@/features/environment-map/utils/environmentMapUtils'
import {
  type ExpandAction,
  PanelWrapper,
} from '@/features/model-viewer/components/PanelWrapper'
import { uploadFile } from '@/features/models/api/modelApi'
import { useTabUiState } from '@/hooks/useTabUiState'

interface EnvironmentMapViewerProps {
  environmentMapId: string
}

type ViewerPanelContent = 'information' | 'thumbnail' | null

interface ViewerCornerState {
  topLeft: 'vertical' | 'horizontal'
  topRight: 'vertical' | 'horizontal'
  bottomLeft: 'vertical' | 'horizontal'
  bottomRight: 'vertical' | 'horizontal'
}

interface ViewerPanelSizes {
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

function getFileExtension(source?: string | null) {
  if (!source) {
    return ''
  }

  const withoutQuery = source.split('?')[0]
  const extension = withoutQuery.split('.').pop()?.toLowerCase()
  return extension || ''
}

function getExtensionFromContentType(contentType: string | null) {
  switch (contentType?.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/vnd.radiance':
      return 'hdr'
    case 'image/x-exr':
    case 'application/octet-stream':
      return 'exr'
    default:
      return ''
  }
}

function sanitizeFileStem(value: string) {
  return value
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildDownloadName(
  baseName: string,
  variantLabel: string,
  extension: string
) {
  const suffix = sanitizeFileStem(variantLabel || 'environment')
  const stem = `${sanitizeFileStem(baseName)}-${suffix}`
  return extension ? `${stem}.${extension}` : stem
}

function triggerDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

async function downloadFromUrl(
  url: string,
  fileName: string,
  explicitExtension?: string
) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}.`)
  }

  const blob = await response.blob()
  const extension =
    explicitExtension ||
    getFileExtension(fileName) ||
    getExtensionFromContentType(response.headers.get('content-type')) ||
    'bin'
  const normalizedFileName = fileName.includes('.')
    ? fileName
    : `${fileName}.${extension}`

  triggerDownload(blob, normalizedFileName)
}

export function EnvironmentMapViewer({
  environmentMapId,
}: EnvironmentMapViewerProps) {
  const toast = useRef<Toast>(null)
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null)
  const parsedEnvironmentMapId = Number(environmentMapId)
  const stableTabId = `environment-map-${environmentMapId}`
  const [savedLayout, setSavedLayout] = useTabUiState<ViewerLayoutState>(
    stableTabId,
    'environmentMapViewerLayout',
    DEFAULT_VIEWER_LAYOUT
  )
  const [selectedPreviewKey, setSelectedPreviewKey] = useState<string>('')
  const [showVariantDialog, setShowVariantDialog] = useState(false)
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

  const environmentMapQuery = useEnvironmentMapByIdQuery({
    environmentMapId: parsedEnvironmentMapId,
    queryConfig: {
      enabled: !Number.isNaN(parsedEnvironmentMapId),
    },
  })
  const addVariantMutation = useAddEnvironmentMapVariantWithFileMutation(
    parsedEnvironmentMapId
  )
  const setThumbnailMutation = useSetEnvironmentMapCustomThumbnailMutation()
  const regenerateThumbnailMutation =
    useRegenerateEnvironmentMapThumbnailMutation()

  const environmentMap = environmentMapQuery.data ?? null
  const previewOptions = useMemo(
    () => getEnvironmentMapPreviewOptions(environmentMap),
    [environmentMap]
  )

  useEffect(() => {
    if (previewOptions.length === 0) {
      setSelectedPreviewKey('')
      return
    }

    if (previewOptions.some(option => option.key === selectedPreviewKey)) {
      return
    }

    const previewVariantOption = environmentMap?.previewVariantId
      ? previewOptions.find(option =>
          option.key.startsWith(`variant-${environmentMap.previewVariantId}-`)
        )
      : null

    setSelectedPreviewKey(previewVariantOption?.key ?? previewOptions[0].key)
  }, [environmentMap?.previewVariantId, previewOptions, selectedPreviewKey])

  const selectedPreview =
    previewOptions.find(option => option.key === selectedPreviewKey) ??
    previewOptions[0] ??
    null

  const thumbnailUrl = getEnvironmentMapPrimaryPreviewUrl(environmentMap)

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
    (side: 'left' | 'right' | 'top' | 'bottom', value: ViewerPanelContent) => {
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

  const handleDownload = async (option: EnvironmentMapPreviewOption | null) => {
    if (!environmentMap || !option) {
      return
    }

    try {
      if (option.assetUrl) {
        await downloadFromUrl(
          option.assetUrl,
          buildDownloadName(
            environmentMap.name,
            option.label,
            getFileExtension(option.fileName ?? option.assetUrl)
          )
        )
      } else if (option.cubeFaceUrls) {
        const faces = Object.entries(option.cubeFaceUrls).filter(
          (entry): entry is [string, string] => Boolean(entry[1])
        )

        for (const [face, url] of faces) {
          await downloadFromUrl(
            url,
            buildDownloadName(
              `${environmentMap.name}-${face}`,
              option.label,
              getFileExtension(url)
            )
          )
        }
      } else {
        throw new Error('No downloadable source is available for this variant.')
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Download started',
        detail: option.cubeFaceUrls
          ? 'Cube face downloads started.'
          : 'Environment map download started.',
        life: 2500,
      })
    } catch (error) {
      toast.current?.show({
        severity: 'error',
        summary: 'Download failed',
        detail:
          error instanceof Error
            ? error.message
            : 'Failed to download environment map.',
        life: 4000,
      })
    }
  }

  const handleVariantUpload = async (
    values: EnvironmentMapUploadDialogSubmitValues
  ) => {
    try {
      await addVariantMutation.mutateAsync({
        file: values.file,
        cubeFaces: values.cubeFaces,
        options: {
          sizeLabel: values.sizeLabel,
          sourceType: values.cubeFaces ? 'cube' : 'single',
          projectionType: values.cubeFaces ? 'cube' : 'equirectangular',
        },
      })

      setSelectedPreviewKey('')
      toast.current?.show({
        severity: 'success',
        summary: 'Variant added',
        detail: `${values.sizeLabel ?? 'New'} variant uploaded successfully.`,
        life: 3000,
      })
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Failed to upload variant.'

      toast.current?.show({
        severity: 'error',
        summary: 'Upload failed',
        detail,
        life: 4000,
      })
      throw error
    }
  }

  const handleThumbnailUpload = async (file: File | null) => {
    try {
      if (file === null) {
        await setThumbnailMutation.mutateAsync({
          environmentMapId: parsedEnvironmentMapId,
          fileId: null,
        })
      } else {
        const upload = await uploadFile(file, { uploadType: 'file' })
        await setThumbnailMutation.mutateAsync({
          environmentMapId: parsedEnvironmentMapId,
          fileId: upload.fileId,
        })
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Updated',
        detail: 'Environment map thumbnail updated.',
        life: 2500,
      })
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Failed to update thumbnail.'

      toast.current?.show({
        severity: 'error',
        summary: 'Update failed',
        detail,
        life: 4000,
      })
    }
  }

  const handleThumbnailRegenerate = async () => {
    try {
      await regenerateThumbnailMutation.mutateAsync({
        environmentMapId: parsedEnvironmentMapId,
        variantId: selectedPreview?.variantId,
      })
      toast.current?.show({
        severity: 'success',
        summary: 'Thumbnail updated',
        detail: 'Generated thumbnail refreshed.',
        life: 2500,
      })
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : 'Failed to regenerate thumbnail.'

      toast.current?.show({
        severity: 'error',
        summary: 'Request failed',
        detail,
        life: 4000,
      })
    }
  }

  if (environmentMapQuery.isLoading) {
    return (
      <div className="environment-map-viewer">Loading environment map...</div>
    )
  }

  if (environmentMapQuery.error instanceof Error) {
    return (
      <div className="environment-map-viewer">
        Error loading environment map: {environmentMapQuery.error.message}
      </div>
    )
  }

  if (!environmentMap) {
    return (
      <div className="environment-map-viewer">Environment map not found.</div>
    )
  }

  const renderPanelContent = (
    panel: ViewerPanelContent,
    side: 'left' | 'right' | 'top' | 'bottom'
  ) => {
    if (!panel) {
      return null
    }

    const closePanel = () => {
      handlePanelChange(side, null)
    }

    const hasLeft = leftPanel !== null
    const hasRight = rightPanel !== null
    const hasTop = topPanel !== null
    const hasBottom = bottomPanel !== null

    const getExpandActions = (): ExpandAction[] => {
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

    if (panel === 'information') {
      return (
        <div
          className={`environment-map-viewer-panel-slot environment-map-viewer-panel-slot-${side}`}
        >
          <PanelWrapper
            title="Informations"
            side={side}
            onClose={closePanel}
            expandActions={getExpandActions()}
          >
            <div className="environment-map-viewer-panel-body">
              <dl className="environment-map-detail-list">
                <div>
                  <dt>Preview size</dt>
                  <dd>{selectedPreview?.label ?? 'Original'}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedPreview?.sourceType ?? 'Single'}</dd>
                </div>
                <div>
                  <dt>Projection</dt>
                  <dd>
                    {selectedPreview?.projectionType ?? 'Equirectangular'}
                  </dd>
                </div>
                <div>
                  <dt>Variants</dt>
                  <dd>{environmentMap.variantCount}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{new Date(environmentMap.updatedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>
          </PanelWrapper>
        </div>
      )
    }

    return (
      <div
        className={`environment-map-viewer-panel-slot environment-map-viewer-panel-slot-${side}`}
      >
        <PanelWrapper
          title="Thumbnail"
          side={side}
          onClose={closePanel}
          expandActions={getExpandActions()}
        >
          <div className="environment-map-viewer-panel-body environment-map-thumbnail-panel">
            <div className="environment-map-thumbnail-card">
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt={environmentMap.name} />
              ) : (
                <div className="environment-map-thumbnail-placeholder">
                  <i className="pi pi-image" />
                  <span>No thumbnail available</span>
                </div>
              )}
            </div>

            <div className="environment-map-thumbnail-actions">
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={event => {
                  const file = event.target.files?.[0] ?? null
                  void handleThumbnailUpload(file)
                  event.target.value = ''
                }}
              />
              <Button
                label="Upload"
                icon="pi pi-upload"
                className="p-button-outlined"
                onClick={() => thumbnailInputRef.current?.click()}
                disabled={
                  setThumbnailMutation.isPending ||
                  regenerateThumbnailMutation.isPending
                }
              />
              <Button
                label="Generate"
                icon="pi pi-refresh"
                onClick={() => void handleThumbnailRegenerate()}
                loading={regenerateThumbnailMutation.isPending}
                disabled={setThumbnailMutation.isPending}
              />
            </div>
          </div>
        </PanelWrapper>
      </div>
    )
  }

  const panelOptions: Array<{
    label: string
    value: ViewerPanelContent
    icon: string
  }> = [
    { label: 'Informations', value: 'information', icon: 'pi pi-info-circle' },
    { label: 'Thumbnail', value: 'thumbnail', icon: 'pi pi-image' },
  ]

  const getPanelMenuItems = (
    currentPanel: ViewerPanelContent,
    onChange: (value: ViewerPanelContent) => void
  ): MenuItem[] => [
    {
      label: 'None',
      icon: 'pi pi-minus',
      className:
        currentPanel === null
          ? 'environment-map-panel-menu-item-active'
          : undefined,
      command: () => onChange(null),
    },
    { separator: true },
    ...panelOptions.map(option => ({
      label: option.label,
      icon: option.icon,
      className:
        currentPanel === option.value
          ? 'environment-map-panel-menu-item-active'
          : undefined,
      command: () =>
        onChange(currentPanel === option.value ? null : option.value),
    })),
  ]

  const menuItems: MenuItem[] = [
    {
      label: 'File',
      icon: 'pi pi-file',
      items: [
        {
          label: 'Add Variant',
          icon: 'pi pi-plus',
          command: () => setShowVariantDialog(true),
        },
        {
          label: 'Download',
          icon: 'pi pi-download',
          command: () => void handleDownload(selectedPreview),
        },
      ],
    },
    {
      label: 'Variants',
      icon: 'pi pi-images',
      items: previewOptions.map(option => ({
        label: option.label,
        icon: 'pi pi-image',
        className:
          selectedPreview?.key === option.key
            ? 'environment-map-variant-menu-item-active'
            : undefined,
        command: () => setSelectedPreviewKey(option.key),
      })),
    },
    {
      label: 'Left Panel',
      icon: 'pi pi-arrow-left',
      items: getPanelMenuItems(leftPanel, value =>
        handlePanelChange('left', value)
      ),
    },
    {
      label: 'Right Panel',
      icon: 'pi pi-arrow-right',
      items: getPanelMenuItems(rightPanel, value =>
        handlePanelChange('right', value)
      ),
    },
    {
      label: 'Top Panel',
      icon: 'pi pi-arrow-up',
      items: getPanelMenuItems(topPanel, value =>
        handlePanelChange('top', value)
      ),
    },
    {
      label: 'Bottom Panel',
      icon: 'pi pi-arrow-down',
      items: getPanelMenuItems(bottomPanel, value =>
        handlePanelChange('bottom', value)
      ),
    },
  ]

  const hasLeftPanel = leftPanel !== null
  const hasRightPanel = rightPanel !== null
  const hasTopPanel = topPanel !== null
  const hasBottomPanel = bottomPanel !== null
  const leftRowStart = hasTopPanel && corners.topLeft === 'horizontal' ? 3 : 1
  const leftRowEnd =
    hasBottomPanel && corners.bottomLeft === 'horizontal' ? 4 : 6
  const rightRowStart = hasTopPanel && corners.topRight === 'horizontal' ? 3 : 1
  const rightRowEnd =
    hasBottomPanel && corners.bottomRight === 'horizontal' ? 4 : 6
  const topColumnStart = hasLeftPanel && corners.topLeft === 'vertical' ? 3 : 1
  const topColumnEnd = hasRightPanel && corners.topRight === 'vertical' ? 4 : 6
  const bottomColumnStart =
    hasLeftPanel && corners.bottomLeft === 'vertical' ? 3 : 1
  const bottomColumnEnd =
    hasRightPanel && corners.bottomRight === 'vertical' ? 4 : 6
  const stageStyle = {
    gridTemplateColumns: `${hasLeftPanel ? `${panelSizes.left}px` : '0px'} ${hasLeftPanel ? '4px' : '0px'} minmax(0, 1fr) ${hasRightPanel ? '4px' : '0px'} ${hasRightPanel ? `${panelSizes.right}px` : '0px'}`,
    gridTemplateRows: `${hasTopPanel ? `${panelSizes.top}px` : '0px'} ${hasTopPanel ? '4px' : '0px'} minmax(0, 1fr) ${hasBottomPanel ? '4px' : '0px'} ${hasBottomPanel ? `${panelSizes.bottom}px` : '0px'}`,
  }

  return (
    <div className="environment-map-viewer">
      <Toast ref={toast} />

      <EnvironmentMapUploadDialog
        visible={showVariantDialog}
        title="Add Environment Map Variant"
        submitLabel="Upload Variant"
        mode="variant"
        loading={addVariantMutation.isPending}
        onHide={() => setShowVariantDialog(false)}
        onSubmit={handleVariantUpload}
      />

      <Menubar
        model={menuItems}
        className="viewer-menubar environment-map-menubar"
        data-testid="environment-map-viewer-menubar"
      />

      <div className="environment-map-viewer-stage" style={stageStyle}>
        {hasTopPanel ? (
          <div
            style={{
              gridColumn: `${topColumnStart} / ${topColumnEnd}`,
              gridRow: '1 / 2',
              minHeight: 0,
            }}
            className="environment-map-viewer-grid-slot"
          >
            {renderPanelContent(topPanel, 'top')}
          </div>
        ) : null}

        {hasTopPanel ? (
          <div
            className={`viewer-resize-divider viewer-resize-divider-v ${resizing === 'top' ? 'resizing' : ''}`}
            style={{
              gridColumn: `${topColumnStart} / ${topColumnEnd}`,
              gridRow: '2 / 3',
            }}
            onMouseDown={event => startResize('top', event)}
          />
        ) : null}

        {hasLeftPanel ? (
          <div
            style={{
              gridColumn: '1 / 2',
              gridRow: `${leftRowStart} / ${leftRowEnd}`,
              minHeight: 0,
            }}
            className="environment-map-viewer-grid-slot"
          >
            {renderPanelContent(leftPanel, 'left')}
          </div>
        ) : null}

        {hasLeftPanel ? (
          <div
            className={`viewer-resize-divider viewer-resize-divider-h ${resizing === 'left' ? 'resizing' : ''}`}
            style={{
              gridColumn: '2 / 3',
              gridRow: `${leftRowStart} / ${leftRowEnd}`,
            }}
            onMouseDown={event => startResize('left', event)}
          />
        ) : null}

        <section
          className="environment-map-viewer-main"
          style={{ gridColumn: '3 / 4', gridRow: '3 / 4' }}
        >
          <div className="environment-map-preview-surface">
            <EnvironmentMapPreviewCanvas option={selectedPreview} />
          </div>
        </section>

        {hasRightPanel ? (
          <div
            style={{
              gridColumn: '5 / 6',
              gridRow: `${rightRowStart} / ${rightRowEnd}`,
              minHeight: 0,
            }}
            className="environment-map-viewer-grid-slot"
          >
            {renderPanelContent(rightPanel, 'right')}
          </div>
        ) : null}

        {hasRightPanel ? (
          <div
            className={`viewer-resize-divider viewer-resize-divider-h ${resizing === 'right' ? 'resizing' : ''}`}
            style={{
              gridColumn: '4 / 5',
              gridRow: `${rightRowStart} / ${rightRowEnd}`,
            }}
            onMouseDown={event => startResize('right', event)}
          />
        ) : null}

        {hasBottomPanel ? (
          <div
            className={`viewer-resize-divider viewer-resize-divider-v ${resizing === 'bottom' ? 'resizing' : ''}`}
            style={{
              gridColumn: `${bottomColumnStart} / ${bottomColumnEnd}`,
              gridRow: '4 / 5',
            }}
            onMouseDown={event => startResize('bottom', event)}
          />
        ) : null}

        {hasBottomPanel ? (
          <div
            style={{
              gridColumn: `${bottomColumnStart} / ${bottomColumnEnd}`,
              gridRow: '5 / 6',
              minHeight: 0,
            }}
            className="environment-map-viewer-grid-slot"
          >
            {renderPanelContent(bottomPanel, 'bottom')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
