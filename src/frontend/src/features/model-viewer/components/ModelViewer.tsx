import './ModelViewer.css'

import { Stats } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { type JSX, useCallback, useRef } from 'react'
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
import { useModelViewerWindows } from '@/features/model-viewer/hooks/useModelViewerWindows'
import { useVersionSelection } from '@/features/model-viewer/hooks/useVersionSelection'
import { useTextureSetByIdQuery } from '@/features/texture-set/api/queries'
import { useModelThumbnailUpdates } from '@/shared/thumbnail'
import { regenerateThumbnail } from '@/shared/thumbnail/api/thumbnailApi'
import { useViewerSettingsStore } from '@/stores/viewerSettingsStore'
import { type ModelVersionDto, type TextureSetDto } from '@/types'
import { type Model } from '@/utils/fileUtils'

import { FileUploadModal } from './FileUploadModal'
import { ModelHierarchyWindow } from './ModelHierarchyWindow'
import { ModelInfoWindow } from './ModelInfoWindow'
import { Scene as ModelPreviewScene } from './ModelPreviewScene'
import { ModelVersionWindow } from './ModelVersionWindow'
import { TextureSetSelectorWindow } from './TextureSetSelectorWindow'
import { ThumbnailWindow } from './ThumbnailWindow'
import { UVMapWindow } from './UVMapWindow'
import { VersionStrip } from './VersionStrip'
import { ViewerSettingsWindow } from './ViewerSettingsWindow'

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
  const windows = useModelViewerWindows()
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
  const loading = !propModel && !!modelId && modelQuery.isLoading
  const error =
    modelQuery.error instanceof Error ? modelQuery.error.message : ''
  const buttonPosition = side === 'left' ? 'right' : 'left'

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
      toast.current?.show(opts)
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

  return (
    <div
      className="model-viewer model-viewer-tab"
      onDragOver={fileUpload.handleDragOver}
      onDragLeave={fileUpload.handleDragLeave}
      onDrop={fileUpload.handleDrop}
    >
      <Toast ref={toast} />

      {fileUpload.dragOver && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '3px dashed #3b82f6',
            borderRadius: '8px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: '#3b82f6',
              color: 'white',
              padding: '2rem 3rem',
              borderRadius: '8px',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
          >
            Drop file to upload
          </div>
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

      <ModelProvider>
        <input
          type="file"
          ref={fileUpload.fileInputRef}
          style={{ display: 'none' }}
          onChange={fileUpload.handleFileSelect}
          accept=".obj,.fbx,.gltf,.glb,.blend"
        />
        <div className="viewer-container">
          {/* Model name overlay */}
          <div className="viewer-model-name-overlay">
            <span>{model.name}</span>
          </div>
          {/* Floating action buttons for sidebar controls */}
          <div className={`viewer-controls viewer-controls-${buttonPosition}`}>
            <Button
              icon="pi pi-plus"
              className="p-button-rounded viewer-control-btn"
              onClick={fileUpload.handleUploadClick}
              tooltip="Add Version"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
              aria-label="Add Version"
            />
            <Button
              icon="pi pi-cog"
              className="p-button-rounded viewer-control-btn"
              onClick={() => windows.toggle('settings')}
              tooltip="Viewer Settings"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-info-circle"
              className="p-button-rounded viewer-control-btn"
              onClick={() => windows.toggle('info')}
              tooltip="Model Information"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-palette"
              className="p-button-rounded viewer-control-btn"
              onClick={() => windows.toggle('textureSet')}
              tooltip="Texture Sets"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-sitemap"
              className="p-button-rounded viewer-control-btn"
              onClick={() => windows.toggle('hierarchy')}
              tooltip="Model Hierarchy"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-image"
              className="p-button-rounded viewer-control-btn"
              onClick={() => windows.toggle('thumbnail')}
              tooltip="Thumbnail Details"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-map"
              className="p-button-rounded viewer-control-btn"
              onClick={() => windows.toggle('uvMap')}
              tooltip="UV Map"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
            <Button
              icon="pi pi-box"
              className="p-button-rounded viewer-control-btn"
              onClick={() => {
                if (model?.id) {
                  const versionParam = selectedVersion?.id
                    ? `&versionId=${selectedVersion.id}`
                    : ''
                  window.location.href = `modelibr://open?modelId=${model.id}${versionParam}`
                }
              }}
              tooltip="Open in Blender"
              tooltipOptions={{
                position: buttonPosition === 'left' ? 'right' : 'left',
              }}
            />
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
                  key={`scene-${model.id}-${side}-${selectedTextureSetId || 'none'}-${selectedVersion?.id || 'original'}-${defaultFileId || 'auto'}`}
                  model={versionModel || model}
                  settings={viewerSettings}
                  textureSet={selectedTextureSet}
                  defaultFileId={defaultFileId}
                />
              </Canvas>
              <div ref={statsContainerRef} className="stats-container" />
              {viewerSettings.showStats && statsContainerRef.current && (
                <Stats showPanel={0} parent={statsContainerRef} />
              )}
            </>
          )}
        </div>

        {/* Floating Windows */}
        <ViewerSettingsWindow
          visible={windows.visibility.settings}
          onClose={() => windows.close('settings')}
          side={side}
        />
        <ModelInfoWindow
          visible={windows.visibility.info}
          onClose={() => windows.close('info')}
          side={side}
          modelId={model.id}
          onModelUpdated={handleModelUpdated}
        />
        <TextureSetSelectorWindow
          visible={windows.visibility.textureSet}
          onClose={() => windows.close('textureSet')}
          side={side}
          modelId={model.id}
          modelVersionId={selectedVersion?.id || model.activeVersionId || null}
          selectedVersion={selectedVersion}
          selectedTextureSetId={selectedTextureSetId}
          onTextureSetSelect={handleTextureSetSelect}
          onModelUpdated={handleModelUpdated}
        />
        <ThumbnailWindow
          visible={windows.visibility.thumbnail}
          onClose={() => windows.close('thumbnail')}
          side={side}
          modelId={model.id}
          selectedVersion={selectedVersion}
          onRegenerate={handleRegenerateThumbnail}
        />
        <ModelHierarchyWindow
          visible={windows.visibility.hierarchy}
          onClose={() => windows.close('hierarchy')}
          side={side}
        />
        <UVMapWindow
          visible={windows.visibility.uvMap}
          onClose={() => windows.close('uvMap')}
          side={side}
          modelId={model.id}
        />
        <ModelVersionWindow
          visible={windows.visibility.version}
          onClose={() => windows.close('version')}
          side={side}
          modelId={model.id}
          onVersionSelect={handleVersionSelect}
          onDefaultFileChange={handleDefaultFileChange}
          onModelUpdate={handleModelUpdated}
          onRecycleVersion={handleRecycleVersion}
        />
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
