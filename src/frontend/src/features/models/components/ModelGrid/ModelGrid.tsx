import { useRef, useEffect, useState, useCallback } from 'react'
import './ModelGrid.css'
import { Toast } from 'primereact/toast'
import { Button } from 'primereact/button'
import { ProgressBar } from 'primereact/progressbar'
import { ThumbnailDisplay } from '@/shared/thumbnail'
import { useTabContext } from '@/hooks/useTabContext'
import { Model } from '@/utils/fileUtils'
import { getModelsPaginated } from '@/features/models/api/modelApi'
import { ModelGridProps } from './types'
import { useModelGrid } from './useModelGrid'
import { ModelsFilters } from './ModelsFilters'
import { ModelContextMenu, ModelContextMenuHandle } from './ModelContextMenu'
import { AddModelDialog } from './AddModelDialog'

export function ModelGrid({
  projectId,
  packId,
  textureSetId,
  onTotalCountChange,
}: ModelGridProps) {
  const contextMenuRef = useRef<ModelContextMenuHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { openModelDetailsTab } = useTabContext()
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const [preloadedModels, setPreloadedModels] = useState<Model[]>([])
  const isContainerContext = !!packId || !!projectId

  const openAddModelDialog = useCallback(async () => {
    try {
      const response = await getModelsPaginated({
        page: 1,
        pageSize: 200,
      })
      setPreloadedModels(response.items)
    } catch (error) {
      console.error('Failed to pre-load models:', error)
      setPreloadedModels([])
    }
    setShowAddModelDialog(true)
  }, [])

  const {
    filteredModels,
    loading,
    error,
    packs,
    projects,
    pagination,
    isLoadingMore,
    uploading,
    uploadProgress,
    uploadMultipleFiles,
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
    searchQuery,
    setSearchQuery,
    effectivePackIds,
    effectiveProjectIds,
    handlePackFilterChange,
    handleProjectFilterChange,
    packFilterDisabled,
    projectFilterDisabled,
    cardWidth,
    handleCardWidthChange,
    fetchModels,
    handleRefresh,
    handleModelRecycled,
    getModelName,
    buildPathPrefix,
    toast,
  } = useModelGrid({ projectId, packId, textureSetId })

  // Report total count to parent when pagination changes
  useEffect(() => {
    onTotalCountChange?.(pagination.totalCount)
  }, [pagination.totalCount, onTotalCountChange])

  const handleModelSelect = (model: { id: string; name: string }) => {
    openModelDetailsTab(model.id, model.name)
  }

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadMultipleFiles(e.target.files)
        e.target.value = '' // Reset so same file can be re-uploaded
      }
    },
    [uploadMultipleFiles]
  )

  if (loading) {
    return (
      <div className="model-grid-container">
        <div className="model-grid-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading models...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="model-grid-container">
        <div className="model-grid-error">
          <i
            className="pi pi-exclamation-triangle"
            style={{ fontSize: '2rem' }}
          />
          <p>{error}</p>
          <Button
            label="Retry"
            icon="pi pi-refresh"
            className="p-button-outlined"
            onClick={() => fetchModels()}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className="model-grid-container"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        accept=".glb,.gltf,.fbx,.obj,.stl"
        onChange={handleFileInputChange}
      />

      <ModelContextMenu
        ref={contextMenuRef}
        onModelRecycled={handleModelRecycled}
        onModelRemoved={handleModelRecycled}
        hideAddToPack={!!packId}
        hideAddToProject={!!projectId}
        packId={packId}
        projectId={projectId}
        pathPrefix={buildPathPrefix()}
        packs={packs}
        projects={projects}
      />

      <ModelsFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        packs={packs}
        projects={projects}
        selectedPackIds={effectivePackIds}
        selectedProjectIds={effectiveProjectIds}
        onPackFilterChange={handlePackFilterChange}
        onProjectFilterChange={handleProjectFilterChange}
        packFilterDisabled={packFilterDisabled}
        projectFilterDisabled={projectFilterDisabled}
        cardWidth={cardWidth}
        onCardWidthChange={handleCardWidthChange}
      />

      <div className="model-grid-actions">
        <Button
          icon="pi pi-upload"
          className="p-button-text p-button-sm"
          onClick={() => fileInputRef.current?.click()}
          tooltip="Upload models"
          tooltipOptions={{ position: 'bottom' }}
          aria-label="Upload models"
        />
        <Button
          icon="pi pi-refresh"
          className="p-button-text p-button-sm"
          onClick={handleRefresh}
          tooltip="Refresh models"
          tooltipOptions={{ position: 'bottom' }}
          aria-label="Refresh models"
        />
      </div>

      {uploading && (
        <div className="upload-progress">
          <p>Uploading files...</p>
          <ProgressBar value={uploadProgress} />
        </div>
      )}

      {filteredModels.length === 0 && !isContainerContext ? (
        <div className="no-results">
          <i className="pi pi-search" />
          <p>
            {searchQuery
              ? `No models found matching "${searchQuery}"`
              : 'No models found. Drag & drop files here to upload.'}
          </p>
        </div>
      ) : (
        <>
          <div
            className="model-grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            }}
          >
            {filteredModels.map(model => (
              <div
                key={model.id}
                className="model-card"
                onClick={() => handleModelSelect(model)}
                onContextMenu={e => {
                  contextMenuRef.current?.show(e, model)
                }}
              >
                <div className="model-card-thumbnail">
                  <ThumbnailDisplay modelId={model.id} modelName={model.name} />
                  <div className="model-card-overlay">
                    <span className="model-card-name">
                      {getModelName(model)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {isContainerContext && (
              <div
                className="model-card model-card-add"
                onClick={openAddModelDialog}
              >
                <div className="model-card-add-content">
                  <i className="pi pi-plus" />
                  <span>Add Model</span>
                </div>
              </div>
            )}
          </div>

          {pagination.hasMore && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: '16px',
              }}
            >
              <Button
                label={
                  isLoadingMore
                    ? 'Loading...'
                    : `Load More (${filteredModels.length} of ${pagination.totalCount})`
                }
                icon={
                  isLoadingMore ? 'pi pi-spinner pi-spin' : 'pi pi-chevron-down'
                }
                onClick={() => fetchModels(true)}
                disabled={isLoadingMore}
                className="p-button-outlined"
              />
            </div>
          )}
        </>
      )}

      {isContainerContext && (
        <AddModelDialog
          visible={showAddModelDialog}
          onHide={() => setShowAddModelDialog(false)}
          packId={packId}
          projectId={projectId}
          existingModelIds={filteredModels.map(m => String(m.id))}
          onModelsAdded={() => fetchModels()}
          preloadedModels={preloadedModels}
        />
      )}
    </div>
  )
}
