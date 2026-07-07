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
import { CategoryTreePanel } from '@/shared/components/categories/CategoryTreePanel'
import { EmptyState } from '@/shared/components/feedback'
import { ThumbnailDisplay } from '@/shared/thumbnail'
import {
  ALL_CATEGORIES_ID,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'
import {
  DEFAULT_MODEL_LIST_VIEW_STATE,
  useModelListViewStore,
} from '@/stores/modelListViewStore'
import { type Model } from '@/utils/fileUtils'

import { AddModelDialog } from './AddModelDialog'
import {
  ModelContextMenu,
  type ModelContextMenuHandle,
} from './ModelContextMenu'
import { ModelsFilters } from './ModelsFilters'
import { type ModelGridProps } from './types'
import { useModelCategoryMutations } from './useModelCategoryMutations'
import { useModelGrid } from './useModelGrid'

// VirtuosoGrid components with CSS Grid layout.
// cardWidth is exposed as a CSS variable instead of a hard-coded
// grid-template-columns inline style so that responsive @media rules can
// reshape the layout (e.g. clamp to never go below 2 columns on phones)
// without losing the slider's effect entirely.
interface ModelGridContext {
  cardWidth: number
  isLoadingMore: boolean
}

const gridComponents: GridComponents<ModelGridContext> = {
  List: forwardRef(({ children, context, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className="model-grid"
      style={
        {
          ...props.style,
          '--model-card-width': `${context?.cardWidth ?? 180}px`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )),
  Item: ({ children, ...props }) => (
    <div {...props} style={props.style}>
      {children}
    </div>
  ),
  Footer: ({ context }) =>
    context?.isLoadingMore ? (
      <div className="model-grid-loading-more" aria-live="polite">
        <i className="pi pi-spin pi-spinner" />
        <span>Loading more…</span>
      </div>
    ) : null,
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
  const [draggedModelId, setDraggedModelId] = useState<string | null>(null)
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(
    null
  )
  const isContainerContext = !!packId || !!projectId
  const isSelectionEnabled = !isContainerContext && !textureSetId
  const [isCategoryPanelOpen, setIsCategoryPanelOpen] = useState(true)
  // The category sidebar (single active category + management) is the primary
  // Models-tab navigation; embedded pack/project/texture-set model grids keep
  // their scoped behavior without it.
  const showCategorySidebar = isSelectionEnabled

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
    models,
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
    activeCategoryId,
    setActiveCategoryId,
    categoryCounts,
    unassignedCount,
    selectedTagNames,
    setSelectedTagNames,
    hasConceptImages,
    setHasConceptImages,
    animatedOnly,
    setAnimatedOnly,
    minTriangleCount,
    setMinTriangleCount,
    maxTriangleCount,
    setMaxTriangleCount,
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

  const {
    createCategoryMutation,
    renameCategoryMutation,
    deleteCategoryMutation,
    moveToCategoryMutation,
  } = useModelCategoryMutations({
    showToast: opts =>
      toast.current?.show(opts as Parameters<Toast['show']>[0]),
    activeCategoryId,
    setActiveCategoryId,
    categories,
    clearSelection: () => setSelectedModelIdsState(new Set()),
  })

  // --- Drag a card onto a category to (re)assign it ---
  const handleCardDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>, model: Model) => {
      if (!isSelectionEnabled) return
      // Deliberately do NOT mutate selection here — a mid-drag layout shift can
      // make Chromium cancel the drag before drop fires (see SoundList).
      setDraggedModelId(String(model.id))
      event.dataTransfer.effectAllowed = 'move'
      const idsToMove = selectedModelIds.has(String(model.id))
        ? [...selectedModelIds]
        : [String(model.id)]
      event.dataTransfer.setData('text/plain', idsToMove.join(','))
    },
    [isSelectionEnabled, selectedModelIds]
  )

  const handleCardDragEnd = useCallback(() => {
    setDraggedModelId(null)
    setDragOverCategoryId(null)
  }, [])

  const handleCategoryDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>, categoryId: number | null) => {
      event.preventDefault()
      event.stopPropagation()
      if (draggedModelId !== null) {
        setDragOverCategoryId(categoryId)
      }
    },
    [draggedModelId]
  )

  const handleCategoryDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setDragOverCategoryId(null)
    },
    []
  )

  const handleCategoryDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      targetCategoryId: number | null
    ) => {
      event.preventDefault()
      event.stopPropagation()
      setDragOverCategoryId(null)

      if (draggedModelId === null) return

      const newCategoryId =
        targetCategoryId === UNASSIGNED_CATEGORY_ID ? null : targetCategoryId

      const idsToMove = selectedModelIds.has(draggedModelId)
        ? [...selectedModelIds]
        : [draggedModelId]
      const modelsToMove = filteredModels.filter(
        model =>
          idsToMove.includes(String(model.id)) &&
          model.categoryId !== newCategoryId
      )

      setDraggedModelId(null)
      if (modelsToMove.length === 0) return

      moveToCategoryMutation.mutate({
        models: modelsToMove,
        categoryId: newCategoryId,
      })
    },
    [draggedModelId, filteredModels, moveToCategoryMutation, selectedModelIds]
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

      // Coordinates are relative to the selection surface's live bounding
      // rect, which already shifts with the scroll position — so no
      // scrollTop/scrollLeft offset is added here (doing so double-counts the
      // scroll and the box would start away from the cursor). The selection
      // box is absolutely positioned inside the surface, so these surface-
      // relative coords map directly to its left/top.
      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      setIsAreaSelecting(true)
      setSelectionBox({
        startX: event.clientX - rect.left,
        startY: event.clientY - rect.top,
        currentX: event.clientX - rect.left,
        currentY: event.clientY - rect.top,
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
              currentX: event.clientX - rect.left,
              currentY: event.clientY - rect.top,
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
        const cardLeft = cardRect.left - rect.left
        const cardTop = cardRect.top - rect.top
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
        accept=".glb,.gltf,.fbx,.obj,.stl,.3mf"
        onChange={handleFileInputChange}
      />

      <ModelContextMenu
        ref={contextMenuRef}
        hideAddToPack={!!packId}
        hideAddToProject={!!projectId}
        allowCategoryChange={isSelectionEnabled}
        categories={categories}
        tags={tags}
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
        tags={tags}
        selectedPackIds={effectivePackIds}
        selectedProjectIds={effectiveProjectIds}
        selectedTagNames={selectedTagNames}
        hasConceptImages={hasConceptImages}
        animatedOnly={animatedOnly}
        minTriangleCount={minTriangleCount}
        maxTriangleCount={maxTriangleCount}
        onPackFilterChange={handlePackFilterChange}
        onProjectFilterChange={handleProjectFilterChange}
        onTagChange={setSelectedTagNames}
        onHasConceptImagesChange={setHasConceptImages}
        onAnimatedOnlyChange={setAnimatedOnly}
        onMinTriangleCountChange={setMinTriangleCount}
        onMaxTriangleCountChange={setMaxTriangleCount}
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
        showCategoryToggle={showCategorySidebar}
        isCategoryPanelOpen={isCategoryPanelOpen}
        onCategoryPanelToggle={() => setIsCategoryPanelOpen(open => !open)}
        categoryFilterActive={
          activeCategoryId != null && activeCategoryId !== ALL_CATEGORIES_ID
        }
      />

      <div className="model-grid-body">
        {showCategorySidebar && isCategoryPanelOpen && (
          <aside className="model-category-sidebar">
            <CategoryTreePanel
              categories={categories}
              activeCategoryId={activeCategoryId}
              dragOverCategoryId={dragOverCategoryId}
              categoryCounts={categoryCounts}
              unassignedCount={unassignedCount}
              allCount={models.length}
              allCategoryId={ALL_CATEGORIES_ID}
              unassignedCategoryId={UNASSIGNED_CATEGORY_ID}
              unassignedLabel="Unassigned"
              itemNoun="model"
              onCategoryChange={setActiveCategoryId}
              onCategoryDragOver={handleCategoryDragOver}
              onCategoryDragLeave={handleCategoryDragLeave}
              onCategoryDrop={handleCategoryDrop}
              onCreateCategory={(name, parentId) =>
                createCategoryMutation.mutate({ name, parentId })
              }
              onRenameCategory={(category, name) =>
                renameCategoryMutation.mutate({ category, name })
              }
              onDeleteCategory={category =>
                deleteCategoryMutation.mutate(category.id)
              }
            />
          </aside>
        )}

        <div ref={setScrollParent} className="model-grid-main">
          {uploading && (
            <div className="upload-progress">
              <p>Uploading files...</p>
              <ProgressBar value={uploadProgress} />
            </div>
          )}

          {filteredModels.length === 0 && !isContainerContext ? (
            <EmptyState
              className="no-results"
              icon={searchQuery ? 'pi-search' : 'pi-box'}
              title={
                searchQuery
                  ? `No models found matching "${searchQuery}"`
                  : 'No models found'
              }
              message={
                searchQuery ? undefined : 'Drag & drop files here to upload.'
              }
            />
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
                  totalCount={
                    filteredModels.length + (isContainerContext ? 1 : 0)
                  }
                  overscan={200}
                  components={gridComponents}
                  context={{ cardWidth, isLoadingMore }}
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
                    const isDragging = draggedModelId === modelId

                    return (
                      <div
                        className={`model-card${isSelected ? ' selected' : ''}${isDragging ? ' dragging' : ''}`}
                        data-model-id={model.id}
                        draggable={isSelectionEnabled}
                        onDragStart={event => handleCardDragStart(event, model)}
                        onDragEnd={handleCardDragEnd}
                        onClick={() => handleModelSelect(model)}
                        onMouseDown={event => {
                          // Suppress middle-click autoscroll so we can use it
                          // to open the model in a background tab.
                          if (event.button === 1) {
                            event.preventDefault()
                          }
                        }}
                        onAuxClick={event => {
                          if (event.button !== 1) {
                            return
                          }
                          event.preventDefault()
                          openModelDetailsTab(model.id, model.name, {
                            activate: false,
                          })
                        }}
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
                          {(model.animationCount ?? 0) > 0 ? (
                            <span
                              className="model-card-badge model-card-badge-animated"
                              title={`${model.animationCount} animation${model.animationCount === 1 ? '' : 's'}`}
                              data-testid="model-animated-badge"
                            >
                              <i className="pi pi-play-circle" />
                            </span>
                          ) : null}
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
                    width: Math.abs(
                      selectionBox.currentX - selectionBox.startX
                    ),
                    height: Math.abs(
                      selectionBox.currentY - selectionBox.startY
                    ),
                  }}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

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
