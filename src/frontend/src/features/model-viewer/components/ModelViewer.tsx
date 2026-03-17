import './ModelViewer.css'

import { Stats } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useQueryClient } from '@tanstack/react-query'
import { Toast } from 'primereact/toast'
import { type JSX, useCallback, useMemo, useRef, useState } from 'react'
import type * as THREE from 'three'

import { ModelProvider } from '@/contexts/ModelContext'
import {
  setActiveVersion,
  softDeleteModelVersion,
} from '@/features/model-viewer/api/modelVersionApi'
import {
  useModelByIdQuery,
  useModelVersionsQuery,
} from '@/features/model-viewer/api/queries'
import { useFileUploadHandlers } from '@/features/model-viewer/hooks/useFileUploadHandlers'
import { useVersionSelection } from '@/features/model-viewer/hooks/useVersionSelection'
import { useTextureSetByIdQuery } from '@/features/texture-set/api/queries'
import { useTextureSetsByModelVersionQuery } from '@/features/texture-set/api/queries'
import { useModelThumbnailUpdates } from '@/shared/thumbnail'
import { regenerateThumbnail } from '@/shared/thumbnail/api/thumbnailApi'
import { useViewerSettingsStore } from '@/stores/viewerSettingsStore'
import { type ModelVersionDto, type TextureSetDto } from '@/types'
import { type Model } from '@/utils/fileUtils'

import { type MaterialTextureSets } from './TexturedModel'

import { FileUploadModal } from './FileUploadModal'
import { Scene as ModelPreviewScene } from './ModelPreviewScene'
import { PanelWrapper, type ExpandAction } from './PanelWrapper'
import { CanvasErrorBoundary } from './CanvasErrorBoundary'
import { VersionStrip } from './VersionStrip'
import { type PanelContent, ViewerMenubar } from './ViewerMenubar'
import { ViewerSidePanel } from './ViewerSidePanel'

interface ModelViewerProps {
  model?: Model
  modelId?: string
  side?: 'left' | 'right'
}

export function ModelViewer({
  model: propModel,
  modelId,
  side = 'left',
}: ModelViewerProps): JSX.Element {
  const viewerSettings = useViewerSettingsStore(s => s.settings)
  const toast = useRef<Toast>(null)
  const statsContainerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // --- Panel state ---
  const [leftPanel, setLeftPanel] = useState<PanelContent>(null)
  const [rightPanel, setRightPanel] = useState<PanelContent>(null)
  const [topPanel, setTopPanel] = useState<PanelContent>(null)
  const [bottomPanel, setBottomPanel] = useState<PanelContent>(null)

  // Panel open order tracking (for corner ownership defaults)
  const panelOpenOrder = useRef<string[]>([])

  // Corner ownership: which panel owns each corner
  // 'vertical' means the side panel (left/right) owns the corner
  // 'horizontal' means the top/bottom panel owns the corner
  const [corners, setCorners] = useState({
    topLeft: 'vertical' as 'vertical' | 'horizontal',
    topRight: 'vertical' as 'vertical' | 'horizontal',
    bottomLeft: 'vertical' as 'vertical' | 'horizontal',
    bottomRight: 'vertical' as 'vertical' | 'horizontal',
  })

  // Panel sizes (pixels)
  const [panelSizes, setPanelSizes] = useState({
    left: 250,
    right: 280,
    top: 200,
    bottom: 200,
  })
  const [resizing, setResizing] = useState<string | null>(null)
  const resizeStart = useRef({ pos: 0, size: 0 })

  // Panel open/close handlers with corner ownership tracking
  const handlePanelChange = useCallback(
    (side: 'left' | 'right' | 'top' | 'bottom', value: PanelContent) => {
      const setters = {
        left: setLeftPanel,
        right: setRightPanel,
        top: setTopPanel,
        bottom: setBottomPanel,
      }
      const getters = {
        left: leftPanel,
        right: rightPanel,
        top: topPanel,
        bottom: bottomPanel,
      }

      if (value === null) {
        // Closing panel - remove from order
        panelOpenOrder.current = panelOpenOrder.current.filter(s => s !== side)
      } else if (getters[side] === null) {
        // Opening new panel - add to order, set corner defaults
        panelOpenOrder.current.push(side)

        // When opening horizontal panel (top/bottom), side panels get corners by default
        // because they were (likely) opened first
        if (side === 'top') {
          setCorners(prev => ({
            ...prev,
            topLeft: leftPanel ? 'vertical' : 'horizontal',
            topRight: rightPanel ? 'vertical' : 'horizontal',
          }))
        } else if (side === 'bottom') {
          setCorners(prev => ({
            ...prev,
            bottomLeft: leftPanel ? 'vertical' : 'horizontal',
            bottomRight: rightPanel ? 'vertical' : 'horizontal',
          }))
        } else if (side === 'left') {
          setCorners(prev => ({
            ...prev,
            topLeft: topPanel ? 'horizontal' : 'vertical',
            bottomLeft: bottomPanel ? 'horizontal' : 'vertical',
          }))
        } else if (side === 'right') {
          setCorners(prev => ({
            ...prev,
            topRight: topPanel ? 'horizontal' : 'vertical',
            bottomRight: bottomPanel ? 'horizontal' : 'vertical',
          }))
        }
      }

      setters[side](value)
    },
    [leftPanel, rightPanel, topPanel, bottomPanel]
  )

  // Resize divider mouse handlers
  const startResize = useCallback(
    (side: string, e: React.MouseEvent) => {
      e.preventDefault()
      const isHorizontal = side === 'left' || side === 'right'
      resizeStart.current = {
        pos: isHorizontal ? e.clientX : e.clientY,
        size: panelSizes[side as keyof typeof panelSizes],
      }
      setResizing(side)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = isHorizontal ? moveEvent.clientX : moveEvent.clientY
        const rawDelta = currentPos - resizeStart.current.pos
        const reverse = side === 'right' || side === 'bottom'
        const delta = reverse ? -rawDelta : rawDelta
        const newSize = Math.max(
          150,
          Math.min(600, resizeStart.current.size + delta)
        )
        setPanelSizes(prev => ({ ...prev, [side]: newSize }))
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

  // --- Data queries ---
  const modelQuery = useModelByIdQuery({
    modelId: modelId || '',
    queryConfig: {
      enabled: !propModel && !!modelId,
    },
  })
  const model: Model | null = propModel || modelQuery.data || null
  const modelNumericId = model?.id ? parseInt(model.id) : null
  const versionsQuery = useModelVersionsQuery({
    modelId: modelNumericId ?? 0,
    queryConfig: {
      enabled: modelNumericId !== null,
    },
  })
  const versions: ModelVersionDto[] = versionsQuery.data ?? []

  // --- Extracted hooks ---
  const versionSelection = useVersionSelection(model, versions)
  const {
    selectedVersion,
    versionModel,
    defaultFileId,
    selectedTextureSetId,
    handleVersionSelect,
    handleDefaultFileChange,
    handleTextureSetSelect,
  } = versionSelection

  const textureSetQuery = useTextureSetByIdQuery({
    textureSetId: selectedTextureSetId ?? 0,
    queryConfig: {
      enabled: selectedTextureSetId !== null,
    },
  })
  const selectedTextureSet: TextureSetDto | null =
    selectedTextureSetId !== null ? (textureSetQuery.data ?? null) : null

  // --- Variant selection + per-material texture sets ---
  const [selectedVariant, setSelectedVariant] = useState<string>('')

  // Sync selectedVariant when version changes
  const currentVersionId = selectedVersion?.id
  const currentMainVariant = selectedVersion?.mainVariantName ?? ''
  const prevVersionIdRef = useRef<number | null>(null)
  if (currentVersionId !== prevVersionIdRef.current) {
    prevVersionIdRef.current = currentVersionId ?? null
    if (currentMainVariant !== selectedVariant) {
      setSelectedVariant(currentMainVariant)
    }
  }

  const handleVariantChange = useCallback((variantName: string) => {
    setSelectedVariant(variantName)
  }, [])

  // Fetch all texture sets for this version so we can build the material map
  const versionTextureSetsQuery = useTextureSetsByModelVersionQuery({
    modelVersionId: selectedVersion?.id ?? 0,
    queryConfig: {
      enabled: selectedVersion !== null,
    },
  })
  const versionTextureSets = versionTextureSetsQuery.data ?? []

  // Build materialTextureSets from textureMappings filtered by selected variant
  const materialTextureSets = useMemo<MaterialTextureSets>(() => {
    if (!selectedVersion) return {}

    const mappings = selectedVersion.textureMappings ?? []
    const variantMappings = mappings.filter(
      m => m.variantName === selectedVariant || m.variantName === ''
    )

    // If no texture mappings exist, fall back to the single selectedTextureSet (legacy/simple case)
    if (variantMappings.length === 0 && selectedTextureSet) {
      return { '': selectedTextureSet }
    }

    // Build a lookup from textureSetId -> TextureSetDto
    const tsById = new Map<number, TextureSetDto>()
    for (const ts of versionTextureSets) {
      tsById.set(ts.id, ts)
    }
    // Also include selectedTextureSet if loaded individually
    if (selectedTextureSet) {
      tsById.set(selectedTextureSet.id, selectedTextureSet)
    }

    const result: MaterialTextureSets = {}
    for (const mapping of variantMappings) {
      const ts = tsById.get(mapping.textureSetId)
      if (ts) {
        result[mapping.materialName] = ts
      }
    }
    return result
  }, [selectedVersion, selectedVariant, versionTextureSets, selectedTextureSet])
  const loading = !propModel && !!modelId && modelQuery.isLoading
  const error =
    modelQuery.error instanceof Error ? modelQuery.error.message : ''

  // --- Thumbnail subscription ---
  useModelThumbnailUpdates(
    model?.id ? parseInt(model.id) : null,
    undefined,
    undefined,
    event => {
      if (versions.length === 0) return
      const isThisModelsVersion = versions.some(
        v => v.id === event.modelVersionId
      )
      if (event.status === 'Ready' && isThisModelsVersion) {
        void versionsQuery.refetch()
      }
    }
  )

  // --- Handlers ---
  const handleModelUpdated = useCallback(async () => {
    if (modelId && !propModel) {
      await modelQuery.refetch()
    }
    await queryClient.invalidateQueries({ queryKey: ['modelVersions'] })
    await versionsQuery.refetch()
  }, [modelId, propModel, modelQuery, queryClient, versionsQuery])

  const handleRegenerateThumbnail = useCallback(async () => {
    if (!model) return
    try {
      await regenerateThumbnail(model.id.toString(), selectedVersion?.id)
      const versionInfo = selectedVersion
        ? ` version #${selectedVersion.id}`
        : ''
      toast.current?.show({
        severity: 'success',
        summary: 'Thumbnail Regeneration',
        detail: `Thumbnail regeneration queued for model #${model.id}${versionInfo}`,
        life: 3000,
      })
    } catch (err) {
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to regenerate thumbnail: ${err instanceof Error ? err.message : 'Unknown error'}`,
        life: 5000,
      })
    }
  }, [model, selectedVersion])

  const handleSetActiveVersion = useCallback(
    async (versionId: number) => {
      if (!model) return
      try {
        await setActiveVersion(parseInt(model.id), versionId)
        await versionsQuery.refetch()
        if (modelId && !propModel) {
          await modelQuery.refetch()
        }
      } catch (error) {
        console.error('Failed to set active version:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to set active version',
          life: 3000,
        })
      }
    },
    [model, modelId, propModel, versionsQuery, modelQuery]
  )

  const handleRecycleVersion = useCallback(
    async (versionId: number) => {
      if (!model) return
      try {
        await softDeleteModelVersion(parseInt(model.id), versionId)
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Model version recycled successfully',
          life: 3000,
        })
        if (modelId && !propModel) {
          await modelQuery.refetch()
        }
        await versionsQuery.refetch()
      } catch (error) {
        console.error('Failed to recycle version:', error)
        const errorMessage =
          error instanceof Error &&
          error.message.includes('last remaining version')
            ? 'Cannot delete the last version. A model must have at least one version.'
            : 'Failed to recycle model version'
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 3000,
        })
      }
    },
    [model, modelId, propModel, versionsQuery, modelQuery]
  )

  const showToast = useCallback(
    (opts: {
      severity: string
      summary: string
      detail: string
      life: number
    }) => {
      toast.current?.show(
        opts as Parameters<NonNullable<typeof toast.current>['show']>[0]
      )
    },
    []
  )

  const fileUpload = useFileUploadHandlers({
    model,
    versions,
    selectedVersion,
    onSuccess: async () => {
      await versionsQuery.refetch()
      if (modelId && !propModel) {
        await modelQuery.refetch()
      }
      await handleModelUpdated()
    },
    showToast,
    refetchVersions: versionsQuery.refetch,
  })

  // --- Early returns ---
  if (loading) {
    return <div className="model-viewer-loading">Loading model...</div>
  }

  if (error) {
    return <div className="model-viewer-error">Error: {error}</div>
  }

  if (!model) {
    return <div className="model-viewer-error">No model data available</div>
  }

  // --- Grid layout computation ---
  const hasLeft = leftPanel !== null
  const hasRight = rightPanel !== null
  const hasTop = topPanel !== null
  const hasBottom = bottomPanel !== null

  // Compute grid row/column for each panel based on corner ownership
  // Grid: 5 cols x 5 rows
  // Col indices: 1=left, 2=leftDiv, 3=center, 4=rightDiv, 5=right
  // Row indices: 1=top, 2=topDiv, 3=center, 4=bottomDiv, 5=bottom
  const leftRowStart = hasTop && corners.topLeft === 'horizontal' ? 3 : 1
  const leftRowEnd = hasBottom && corners.bottomLeft === 'horizontal' ? 4 : 6
  const rightRowStart = hasTop && corners.topRight === 'horizontal' ? 3 : 1
  const rightRowEnd = hasBottom && corners.bottomRight === 'horizontal' ? 4 : 6
  const topColStart = hasLeft && corners.topLeft === 'vertical' ? 3 : 1
  const topColEnd = hasRight && corners.topRight === 'vertical' ? 4 : 6
  const bottomColStart = hasLeft && corners.bottomLeft === 'vertical' ? 3 : 1
  const bottomColEnd = hasRight && corners.bottomRight === 'vertical' ? 4 : 6

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${hasLeft ? panelSizes.left + 'px' : '0px'} ${hasLeft ? '4px' : '0px'} 1fr ${hasRight ? '4px' : '0px'} ${hasRight ? panelSizes.right + 'px' : '0px'}`,
    gridTemplateRows: `${hasTop ? panelSizes.top + 'px' : '0px'} ${hasTop ? '4px' : '0px'} 1fr ${hasBottom ? '4px' : '0px'} ${hasBottom ? panelSizes.bottom + 'px' : '0px'}`,
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  }

  // Panel title map
  const panelTitles: Record<string, string> = {
    hierarchy: 'Hierarchy',
    materials: 'Materials',
    modelInfo: 'Model Info',
    uvMap: 'UV Map',
    thumbnail: 'Thumbnail Details',
  }

  // Expand actions for panels
  const getLeftExpandActions = (): ExpandAction[] => {
    const actions: ExpandAction[] = []
    if (hasTop && corners.topLeft === 'horizontal') {
      actions.push({
        direction: 'up',
        tooltip: 'Expand to top-left corner',
        onClick: () => setCorners(prev => ({ ...prev, topLeft: 'vertical' })),
      })
    }
    if (hasBottom && corners.bottomLeft === 'horizontal') {
      actions.push({
        direction: 'down',
        tooltip: 'Expand to bottom-left corner',
        onClick: () =>
          setCorners(prev => ({ ...prev, bottomLeft: 'vertical' })),
      })
    }
    return actions
  }

  const getRightExpandActions = (): ExpandAction[] => {
    const actions: ExpandAction[] = []
    if (hasTop && corners.topRight === 'horizontal') {
      actions.push({
        direction: 'up',
        tooltip: 'Expand to top-right corner',
        onClick: () => setCorners(prev => ({ ...prev, topRight: 'vertical' })),
      })
    }
    if (hasBottom && corners.bottomRight === 'horizontal') {
      actions.push({
        direction: 'down',
        tooltip: 'Expand to bottom-right corner',
        onClick: () =>
          setCorners(prev => ({ ...prev, bottomRight: 'vertical' })),
      })
    }
    return actions
  }

  const getTopExpandActions = (): ExpandAction[] => {
    const actions: ExpandAction[] = []
    if (hasLeft && corners.topLeft === 'vertical') {
      actions.push({
        direction: 'left',
        tooltip: 'Expand to top-left corner',
        onClick: () => setCorners(prev => ({ ...prev, topLeft: 'horizontal' })),
      })
    }
    if (hasRight && corners.topRight === 'vertical') {
      actions.push({
        direction: 'right',
        tooltip: 'Expand to top-right corner',
        onClick: () =>
          setCorners(prev => ({ ...prev, topRight: 'horizontal' })),
      })
    }
    return actions
  }

  const getBottomExpandActions = (): ExpandAction[] => {
    const actions: ExpandAction[] = []
    if (hasLeft && corners.bottomLeft === 'vertical') {
      actions.push({
        direction: 'left',
        tooltip: 'Expand to bottom-left corner',
        onClick: () =>
          setCorners(prev => ({ ...prev, bottomLeft: 'horizontal' })),
      })
    }
    if (hasRight && corners.bottomRight === 'vertical') {
      actions.push({
        direction: 'right',
        tooltip: 'Expand to bottom-right corner',
        onClick: () =>
          setCorners(prev => ({ ...prev, bottomRight: 'horizontal' })),
      })
    }
    return actions
  }

  const sidePanelProps = {
    model,
    modelVersionId: selectedVersion?.id ?? null,
    selectedVersion,
    selectedTextureSetId,
    onTextureSetSelect: handleTextureSetSelect,
    onVariantChange: handleVariantChange,
    onModelUpdated: handleModelUpdated,
    onRegenerate: handleRegenerateThumbnail,
  }

  return (
    <div
      className="model-viewer model-viewer-tab"
      onDragOver={fileUpload.handleDragOver}
      onDragLeave={fileUpload.handleDragLeave}
      onDrop={fileUpload.handleDrop}
    >
      <Toast ref={toast} />

      {fileUpload.dragOver && (
        <div className="viewer-drag-overlay">
          <div className="viewer-drag-message">Drop file to upload</div>
        </div>
      )}

      <header className="viewer-header-tab viewer-header-compact">
        <VersionStrip
          model={model}
          versions={versions}
          selectedVersion={selectedVersion}
          onVersionSelect={handleVersionSelect}
          onSetActiveVersion={handleSetActiveVersion}
          onRecycleVersion={handleRecycleVersion}
          defaultFileId={defaultFileId}
          onDefaultFileChange={handleDefaultFileChange}
        />
      </header>

      <ViewerMenubar
        leftPanel={leftPanel}
        rightPanel={rightPanel}
        topPanel={topPanel}
        bottomPanel={bottomPanel}
        onLeftPanelChange={v => handlePanelChange('left', v)}
        onRightPanelChange={v => handlePanelChange('right', v)}
        onTopPanelChange={v => handlePanelChange('top', v)}
        onBottomPanelChange={v => handlePanelChange('bottom', v)}
        onAddVersion={fileUpload.handleUploadClick}
      />

      <ModelProvider>
        <input
          type="file"
          ref={fileUpload.fileInputRef}
          style={{ display: 'none' }}
          onChange={fileUpload.handleFileSelect}
          accept=".obj,.fbx,.gltf,.glb,.blend"
        />

        <div className="viewer-layout" style={gridStyle}>
          {/* Left Panel */}
          {hasLeft && (
            <div
              className="viewer-panel"
              style={{
                gridColumn: '1 / 2',
                gridRow: `${leftRowStart} / ${leftRowEnd}`,
              }}
            >
              <PanelWrapper
                title={panelTitles[leftPanel!] ?? 'Panel'}
                side="left"
                onClose={() => handlePanelChange('left', null)}
                expandActions={getLeftExpandActions()}
              >
                <ViewerSidePanel content={leftPanel} {...sidePanelProps} />
              </PanelWrapper>
            </div>
          )}

          {/* Left divider */}
          {hasLeft && (
            <div
              className={`viewer-resize-divider viewer-resize-divider-h ${resizing === 'left' ? 'resizing' : ''}`}
              style={{
                gridColumn: '2 / 3',
                gridRow: `${leftRowStart} / ${leftRowEnd}`,
              }}
              onMouseDown={e => startResize('left', e)}
            />
          )}

          {/* Top Panel */}
          {hasTop && (
            <div
              className="viewer-panel"
              style={{
                gridColumn: `${topColStart} / ${topColEnd}`,
                gridRow: '1 / 2',
              }}
            >
              <PanelWrapper
                title={panelTitles[topPanel!] ?? 'Panel'}
                side="top"
                onClose={() => handlePanelChange('top', null)}
                expandActions={getTopExpandActions()}
              >
                <ViewerSidePanel content={topPanel} {...sidePanelProps} />
              </PanelWrapper>
            </div>
          )}

          {/* Top divider */}
          {hasTop && (
            <div
              className={`viewer-resize-divider viewer-resize-divider-v ${resizing === 'top' ? 'resizing' : ''}`}
              style={{
                gridColumn: `${topColStart} / ${topColEnd}`,
                gridRow: '2 / 3',
              }}
              onMouseDown={e => startResize('top', e)}
            />
          )}

          {/* Canvas (always center cell: col 3, row 3) */}
          <div
            className="viewer-canvas-panel"
            style={{ gridColumn: '3 / 4', gridRow: '3 / 4' }}
          >
            <div className="viewer-container">
              <div className="viewer-model-name-overlay">
                <span>{model.name}</span>
              </div>
              <div
                className="viewer-controls-info"
                title={
                  'Mouse: Rotate view\nScroll: Zoom in/out\nRight-click + drag: Pan view'
                }
              >
                <i className="pi pi-info-circle" />
              </div>

              {error ? (
                <div className="viewer-error">
                  <h3>Failed to load model</h3>
                  <p>{error}</p>
                  <button
                    onClick={() => void modelQuery.refetch()}
                    className="retry-button"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <CanvasErrorBoundary>
                    <Canvas
                      key={`canvas-${model.id}-${side}-${selectedVersion?.id || 'original'}-${defaultFileId || 'auto'}`}
                      shadows
                      className="viewer-canvas"
                      data-testid="model-viewer-canvas"
                      gl={{
                        antialias: true,
                        alpha: true,
                        powerPreference: 'high-performance',
                      }}
                      dpr={Math.min(window.devicePixelRatio, 2)}
                      onCreated={state => {
                        if (typeof window !== 'undefined') {
                          ;(
                            window as Window & {
                              __THREE_SCENE__?: THREE.Scene
                              __THREE_STATE__?: typeof state
                            }
                          ).__THREE_SCENE__ = state.scene
                          ;(
                            window as Window & {
                              __THREE_SCENE__?: THREE.Scene
                              __THREE_STATE__?: typeof state
                            }
                          ).__THREE_STATE__ = state
                        }
                      }}
                    >
                      <ModelPreviewScene
                        key={`scene-${model.id}-${side}-${selectedVariant}-${selectedVersion?.id || 'original'}-${defaultFileId || 'auto'}`}
                        model={versionModel || model}
                        settings={viewerSettings}
                        materialTextureSets={materialTextureSets}
                        defaultFileId={defaultFileId}
                      />
                    </Canvas>
                  </CanvasErrorBoundary>
                  <div ref={statsContainerRef} className="stats-container" />
                  {viewerSettings.showStats && statsContainerRef.current && (
                    <Stats
                      showPanel={0}
                      parent={
                        statsContainerRef as unknown as React.RefObject<HTMLElement>
                      }
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Bottom divider */}
          {hasBottom && (
            <div
              className={`viewer-resize-divider viewer-resize-divider-v ${resizing === 'bottom' ? 'resizing' : ''}`}
              style={{
                gridColumn: `${bottomColStart} / ${bottomColEnd}`,
                gridRow: '4 / 5',
              }}
              onMouseDown={e => startResize('bottom', e)}
            />
          )}

          {/* Bottom Panel */}
          {hasBottom && (
            <div
              className="viewer-panel"
              style={{
                gridColumn: `${bottomColStart} / ${bottomColEnd}`,
                gridRow: '5 / 6',
              }}
            >
              <PanelWrapper
                title={panelTitles[bottomPanel!] ?? 'Panel'}
                side="bottom"
                onClose={() => handlePanelChange('bottom', null)}
                expandActions={getBottomExpandActions()}
              >
                <ViewerSidePanel content={bottomPanel} {...sidePanelProps} />
              </PanelWrapper>
            </div>
          )}

          {/* Right divider */}
          {hasRight && (
            <div
              className={`viewer-resize-divider viewer-resize-divider-h ${resizing === 'right' ? 'resizing' : ''}`}
              style={{
                gridColumn: '4 / 5',
                gridRow: `${rightRowStart} / ${rightRowEnd}`,
              }}
              onMouseDown={e => startResize('right', e)}
            />
          )}

          {/* Right Panel */}
          {hasRight && (
            <div
              className="viewer-panel"
              style={{
                gridColumn: '5 / 6',
                gridRow: `${rightRowStart} / ${rightRowEnd}`,
              }}
            >
              <PanelWrapper
                title={panelTitles[rightPanel!] ?? 'Panel'}
                side="right"
                onClose={() => handlePanelChange('right', null)}
                expandActions={getRightExpandActions()}
              >
                <ViewerSidePanel content={rightPanel} {...sidePanelProps} />
              </PanelWrapper>
            </div>
          )}
        </div>
      </ModelProvider>

      {/* File Upload Modal */}
      <FileUploadModal
        visible={fileUpload.uploadModalVisible}
        onHide={fileUpload.hideUploadModal}
        file={fileUpload.droppedFile}
        modelId={model?.id ? parseInt(model.id) : 0}
        versions={versions}
        selectedVersion={selectedVersion}
        onUpload={fileUpload.handleFileUpload}
      />
    </div>
  )
}
