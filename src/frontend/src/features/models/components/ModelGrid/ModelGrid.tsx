import './ModelGrid.css'

import { Button } from 'primereact/button'
import { ProgressBar } from 'primereact/progressbar'
import { Toast } from 'primereact/toast'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type GridComponents, VirtuosoGrid } from 'react-virtuoso'

import { useTabContext } from '@/hooks/useTabContext'
import {
  DEFAULT_MODEL_LIST_VIEW_STATE,
  useModelListViewStore,
} from '@/stores/modelListViewStore'
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
  viewStateScope,
  onTotalCountChange,
}: ModelGridProps) {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null)
  const contextMenuRef = useRef<ModelContextMenuHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectionSurfaceRef = useRef<HTMLDivElement | null>(null)
  const { openModelDetailsTab } = useTabContext()
  const [showAddModelDialog, setShowAddModelDialog] = useState(false)
  const persistedViewState = useModelListViewStore(state =>
    viewStateScope
      ? (state.views[viewStateScope] ?? DEFAULT_MODEL_LIST_VIEW_STATE)
      : null
  )
  const setPersistedViewState = useModelListViewStore(
    state => state.setViewState
  )
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    () => new Set(persistedViewState?.selectedModelIds ?? [])
  )
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const isContainerContext = !!packId || !!projectId
  const isSelectionEnabled = !isContainerContext && !textureSetId

  const areSelectionSetsEqual = useCallback(
    (left: Set<string>, right: Set<string>) => {
      if (left.size !== right.size) {
        return false
      }

      for (const value of left) {
        if (!right.has(value)) {
          return false
        }
      }

      return true
    },
    []
  )

  const updatePersistedViewState = useCallback(
    (patch: Partial<typeof DEFAULT_MODEL_LIST_VIEW_STATE>) => {
      if (!viewStateScope) {
        return
      }

      setPersistedViewState(viewStateScope, patch)
    },
    [setPersistedViewState, viewStateScope]
  )

  const setSelectedModelIdsState = useCallback(
    (updater: Set<string> | ((previous: Set<string>) => Set<string>)) => {
      setSelectedModelIds(previous => {
        const next = typeof updater === 'function' ? updater(previous) : updater

        if (next === previous || areSelectionSetsEqual(previous, next)) {
          return previous
        }

        updatePersistedViewState({ selectedModelIds: [...next] })
        return next
      })
    },
    [areSelectionSetsEqual, updatePersistedViewState]
  )

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
    tags,
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
    selectedCategoryKeys,
    setSelectedCategoryKeys,
    selectedCategoryIds,
    selectedTagNames,
    setSelectedTagNames,
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
    getModelName,
    buildPathPrefix,
    toast,
    isSearchOpen,
    setIsSearchOpen,
    isFiltersOpen,
    setIsFiltersOpen,
  } = useModelGrid({
    projectId,
    packId,
    textureSetId,
    persistedViewState,
    onPersistedViewStateChange: updatePersistedViewState,
  })

  const selectedModels = useMemo(
    () =>
      filteredModels.filter(model => selectedModelIds.has(String(model.id))),
    [filteredModels, selectedModelIds]
  )

  // Report total count to parent when pagination changes
  useEffect(() => {
    onTotalCountChange?.(pagination.totalCount)
  }, [pagination.totalCount, onTotalCountChange])

  useEffect(() => {
    if (isSelectionEnabled) {
      return
    }

    setSelectedModelIdsState(new Set())
  }, [isSelectionEnabled])

  useEffect(() => {
    if (!isSelectionEnabled) {
      return
    }

    const visibleIds = new Set(filteredModels.map(model => String(model.id)))
    setSelectedModelIdsState(previous => {
      const next = new Set(
        [...previous].filter(modelId => visibleIds.has(modelId))
      )

      return next.size === previous.size ? previous : next
    })
  }, [filteredModels, isSelectionEnabled, setSelectedModelIdsState])

  const handleModelSelect = (model: { id: string; name: string }) => {
    openModelDetailsTab(model.id, model.name)
  }

  const toggleModelSelection = useCallback(
    (modelId: string, event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      setSelectedModelIdsState(previous => {
        const next = new Set(previous)
        if (next.has(modelId)) {
          next.delete(modelId)
        } else {
          next.add(modelId)
        }
        return next
      })
    },
    [setSelectedModelIdsState]
  )

  const handleGridMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        !isSelectionEnabled ||
        !selectionSurfaceRef.current ||
        !scrollParent
      ) {
        return
      }

      const target = event.target as HTMLElement
      if (target.closest('.model-card')) {
        return
      }

      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      setIsAreaSelecting(true)
      setSelectionBox({
        startX: event.clientX - rect.left + scrollParent.scrollLeft,
        startY: event.clientY - rect.top + scrollParent.scrollTop,
        currentX: event.clientX - rect.left + scrollParent.scrollLeft,
        currentY: event.clientY - rect.top + scrollParent.scrollTop,
      })
    },
    [isSelectionEnabled, scrollParent]
  )

  const handleGridMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        !isSelectionEnabled ||
        !isAreaSelecting ||
        !selectionBox ||
        !selectionSurfaceRef.current ||
        !scrollParent
      ) {
        return
      }

      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      setSelectionBox(previous =>
        previous
          ? {
              ...previous,
              currentX: event.clientX - rect.left + scrollParent.scrollLeft,
              currentY: event.clientY - rect.top + scrollParent.scrollTop,
            }
          : null
      )
    },
    [isAreaSelecting, isSelectionEnabled, scrollParent, selectionBox]
  )

  const handleGridMouseUp = useCallback(() => {
    if (
      isSelectionEnabled &&
      isAreaSelecting &&
      selectionBox &&
      selectionSurfaceRef.current &&
      scrollParent
    ) {
      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      const selectionLeft = Math.min(selectionBox.startX, selectionBox.currentX)
      const selectionTop = Math.min(selectionBox.startY, selectionBox.currentY)
      const selectionRight = Math.max(
        selectionBox.startX,
        selectionBox.currentX
      )
      const selectionBottom = Math.max(
        selectionBox.startY,
        selectionBox.currentY
      )

      const cards = selectionSurfaceRef.current.querySelectorAll<HTMLElement>(
        '.model-card[data-model-id]'
      )
      const nextSelected = new Set<string>()

      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft = cardRect.left - rect.left + scrollParent.scrollLeft
        const cardTop = cardRect.top - rect.top + scrollParent.scrollTop
        const cardRight = cardLeft + cardRect.width
        const cardBottom = cardTop + cardRect.height

        if (
          cardRight >= selectionLeft &&
          cardLeft <= selectionRight &&
          cardBottom >= selectionTop &&
          cardTop <= selectionBottom
        ) {
          const modelId = card.getAttribute('data-model-id')
          if (modelId) {
            nextSelected.add(modelId)
          }
        }
      })

      if (nextSelected.size > 0) {
        setSelectedModelIdsState(nextSelected)
      }
    }

    setIsAreaSelecting(false)
    setSelectionBox(null)
  }, [
    isAreaSelecting,
    isSelectionEnabled,
    scrollParent,
    selectionBox,
    setSelectedModelIdsState,
  ])

  const handleSelectAll = useCallback(() => {
    setSelectedModelIdsState(
      new Set(filteredModels.map(model => String(model.id)))
    )
  }, [filteredModels, setSelectedModelIdsState])

  const handleDeselectAll = useCallback(() => {
    setSelectedModelIdsState(new Set())
  }, [setSelectedModelIdsState])

  const handleBulkActionsClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isSelectionEnabled || selectedModels.length === 0) {
        return
      }

      contextMenuRef.current?.show(event, {
        models: selectedModels,
        mode: 'bulk',
      })
    },
    [isSelectionEnabled, selectedModels]
  )

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
        hideAddToPack={!!packId}
        hideAddToProject={!!projectId}
        allowCategoryChange={isSelectionEnabled}
        categories={categories}
        packId={packId}
        projectId={projectId}
        pathPrefix={buildPathPrefix()}
      />

      <ModelsFilters
        isSearchOpen={isSearchOpen}
        onSearchToggle={setIsSearchOpen}
        isFiltersOpen={isFiltersOpen}
        onFiltersToggle={setIsFiltersOpen}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        packs={packs}
        projects={projects}
        categories={categories}
        tags={tags}
        selectedPackIds={effectivePackIds}
        selectedProjectIds={effectiveProjectIds}
        selectedCategoryKeys={selectedCategoryKeys}
        selectedCategoryIds={selectedCategoryIds}
        selectedTagNames={selectedTagNames}
        hasConceptImages={hasConceptImages}
        onPackFilterChange={handlePackFilterChange}
        onProjectFilterChange={handleProjectFilterChange}
        onCategoryChange={setSelectedCategoryKeys}
        onTagChange={setSelectedTagNames}
        onHasConceptImagesChange={setHasConceptImages}
        packFilterDisabled={packFilterDisabled}
        projectFilterDisabled={projectFilterDisabled}
        cardWidth={cardWidth}
        onCardWidthChange={handleCardWidthChange}
        modelCount={pagination.totalCount}
        selectedModelCount={selectedModels.length}
        onUploadClick={() => fileInputRef.current?.click()}
        onRefreshClick={handleRefresh}
        onBulkActionsClick={handleBulkActionsClick}
        onSelectAllClick={handleSelectAll}
        onDeselectAllClick={handleDeselectAll}
        visibleModelCount={filteredModels.length}
      />

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
        <div
          ref={selectionSurfaceRef}
          className={`model-grid-selection-surface${isAreaSelecting ? ' is-selecting' : ''}`}
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
          onMouseLeave={handleGridMouseUp}
        >
          <div className="model-grid-selection-content">
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

                const modelId = String(model.id)
                const isSelected = selectedModelIds.has(modelId)
                const modelName = getModelName(model)

                return (
                  <div
                    className={`model-card${isSelected ? ' selected' : ''}`}
                    data-model-id={model.id}
                    onClick={() => handleModelSelect(model)}
                    onContextMenu={event => {
                      if (isSelectionEnabled && selectedModels.length > 1) {
                        contextMenuRef.current?.show(event, {
                          models: selectedModels,
                          mode: 'bulk',
                        })
                        return
                      }

                      contextMenuRef.current?.show(event, {
                        models: [model],
                        mode: 'single',
                      })
                    }}
                  >
                    <div className="model-card-thumbnail">
                      {isSelectionEnabled ? (
                        <button
                          type="button"
                          className="model-select-checkbox"
                          onMouseDown={event => event.stopPropagation()}
                          onClick={event =>
                            toggleModelSelection(modelId, event)
                          }
                          aria-label={`${isSelected ? 'Deselect' : 'Select'} ${modelName}`}
                          aria-pressed={isSelected}
                        >
                          <i
                            className={`pi ${isSelected ? 'pi-check-square' : 'pi-stop'}`}
                          />
                        </button>
                      ) : null}

                      <ThumbnailDisplay
                        modelId={model.id}
                        modelName={model.name}
                      />
                      <div className="model-card-overlay">
                        <span className="model-card-name">{modelName}</span>
                      </div>
                    </div>
                  </div>
                )
              }}
            />
          </div>

          {isSelectionEnabled && isAreaSelecting && selectionBox ? (
            <div
              className="model-grid-selection-box"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
              }}
            />
          ) : null}
        </div>
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
