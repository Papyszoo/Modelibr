import './ModelGrid.css'

import { Button } from 'primereact/button'
import { ProgressBar } from 'primereact/progressbar'
import { Toast } from 'primereact/toast'
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { type GridComponents, VirtuosoGrid } from 'react-virtuoso'

import { useTabContext } from '@/hooks/useTabContext'
import { ThumbnailDisplay } from '@/shared/thumbnail'

import { AddModelDialog } from './AddModelDialog'
import {
  ModelContextMenu,
  type ModelContextMenuHandle,
} from './ModelContextMenu'
import { ModelsFilters } from './ModelsFilters'
import { type ModelGridProps } from './types'
import { useModelGrid } from './useModelGrid'

// VirtuosoGrid components with CSS Grid layout
const gridComponents: GridComponents<{ cardWidth: number }> = {
  List: forwardRef(({ children, context, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className="model-grid"
      style={{
        ...props.style,
        gridTemplateColumns: `repeat(auto-fill, minmax(${context?.cardWidth ?? 180}px, 1fr))`,
      }}
    >
      {children}
    </div>
  )),
  Item: ({ children, ...props }) => (
    <div {...props} style={props.style}>
      {children}
    </div>
  ),
}

export function ModelGrid({
  projectId,
  packId,
  textureSetId,
  onTotalCountChange,
}: ModelGridProps) {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null)
  const contextMenuRef = useRef<ModelContextMenuHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { openModelDetailsTab } = useTabContext()
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const isContainerContext = !!packId || !!projectId

  const openAddModelDialog = useCallback(() => {
    setShowAddModelDialog(true)
  }, [])

  const {
    filteredModels,
    loading,
    error,
    packs,
    projects,
    categories,
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
    selectedCategoryId,
    setSelectedCategoryId,
    hasConceptImages,
    setHasConceptImages,
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
      ref={setScrollParent}
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
      />

      <ModelsFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        packs={packs}
        projects={projects}
        categories={categories}
        selectedPackIds={effectivePackIds}
        selectedProjectIds={effectiveProjectIds}
        selectedCategoryId={selectedCategoryId}
        hasConceptImages={hasConceptImages}
        onPackFilterChange={handlePackFilterChange}
        onProjectFilterChange={handleProjectFilterChange}
        onCategoryChange={setSelectedCategoryId}
        onHasConceptImagesChange={setHasConceptImages}
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
        <VirtuosoGrid
          customScrollParent={scrollParent ?? undefined}
          totalCount={filteredModels.length + (isContainerContext ? 1 : 0)}
          overscan={200}
          components={gridComponents}
          context={{ cardWidth }}
          endReached={() => {
            if (pagination.hasMore && !isLoadingMore) {
              fetchModels(true)
            }
          }}
          itemContent={index => {
            // Last item is the "Add" card in container context
            if (isContainerContext && index === filteredModels.length) {
              return (
                <div
                  className="model-card model-card-add"
                  onClick={openAddModelDialog}
                >
                  <div className="model-card-add-content">
                    <i className="pi pi-plus" />
                    <span>Add Model</span>
                  </div>
                </div>
              )
            }

            const model = filteredModels[index]
            if (!model) return null

            return (
              <div
                className="model-card"
                data-model-id={model.id}
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
            )
          }}
        />
      )}

      {isContainerContext && (
        <AddModelDialog
          visible={showAddModelDialog}
          onHide={() => setShowAddModelDialog(false)}
          packId={packId}
          projectId={projectId}
          existingModelIds={filteredModels.map(m => String(m.id))}
          onModelsAdded={() => fetchModels()}
        />
      )}
    </div>
  )
}
