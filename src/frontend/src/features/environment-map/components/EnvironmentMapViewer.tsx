import './EnvironmentMapViewer.css'

import { Menubar } from 'primereact/menubar'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  useAddEnvironmentMapVariantWithFileMutation,
  useEnvironmentMapByIdQuery,
  useRegenerateEnvironmentMapThumbnailMutation,
  useSetEnvironmentMapCustomThumbnailMutation,
} from '@/features/environment-map/api/queries'
import { EnvironmentMapInformationPanel } from '@/features/environment-map/components/EnvironmentMapInformationPanel'
import { EnvironmentMapPreviewCanvas } from '@/features/environment-map/components/EnvironmentMapPreviewCanvas'
import { EnvironmentMapThumbnailPanel } from '@/features/environment-map/components/EnvironmentMapThumbnailPanel'
import {
  EnvironmentMapUploadDialog,
  type EnvironmentMapUploadDialogSubmitValues,
} from '@/features/environment-map/components/EnvironmentMapUploadDialog'
import {
  PANEL_OPTIONS,
  useEnvironmentMapViewerState,
  type ViewerPanelContent,
} from '@/features/environment-map/hooks/useEnvironmentMapViewerState'
import {
  buildDownloadName,
  downloadFromUrl,
  getFileExtension,
} from '@/features/environment-map/utils/downloadUtils'
import {
  type EnvironmentMapPreviewOption,
  getEnvironmentMapPreviewOptions,
  getEnvironmentMapPrimaryPreviewUrl,
} from '@/features/environment-map/utils/environmentMapUtils'
import { PanelWrapper } from '@/features/model-viewer/components/PanelWrapper'
import { uploadFile } from '@/features/models/api/modelApi'

interface EnvironmentMapViewerProps {
  environmentMapId: string
}

export function EnvironmentMapViewer({
  environmentMapId,
}: EnvironmentMapViewerProps) {
  const toast = useRef<Toast>(null)
  const parsedEnvironmentMapId = Number(environmentMapId)
  const stableTabId = `environment-map-${environmentMapId}`

  const {
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
  } = useEnvironmentMapViewerState(stableTabId)

  const [selectedPreviewKey, setSelectedPreviewKey] = useState<string>('')
  const [showVariantDialog, setShowVariantDialog] = useState(false)

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

    return (
      <div
        className={`environment-map-viewer-panel-slot environment-map-viewer-panel-slot-${side}`}
      >
        <PanelWrapper
          title={panel === 'information' ? 'Informations' : 'Thumbnail'}
          side={side}
          onClose={() => handlePanelChange(side, null)}
          expandActions={getExpandActions(side)}
        >
          {panel === 'information' ? (
            <EnvironmentMapInformationPanel
              selectedPreview={selectedPreview}
              environmentMap={environmentMap}
            />
          ) : (
            <EnvironmentMapThumbnailPanel
              thumbnailUrl={thumbnailUrl}
              environmentMapName={environmentMap.name}
              isThumbnailUploading={setThumbnailMutation.isPending}
              isRegenerating={regenerateThumbnailMutation.isPending}
              onUpload={file => void handleThumbnailUpload(file)}
              onRegenerate={() => void handleThumbnailRegenerate()}
            />
          )}
        </PanelWrapper>
      </div>
    )
  }

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
    ...PANEL_OPTIONS.map(option => ({
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
