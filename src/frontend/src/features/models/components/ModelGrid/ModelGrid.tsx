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

import { ImportSuggestionsBanner } from '@/features/metadata'
import { useTabContext } from '@/hooks/useTabContext'
import { CategoryTreePanel } from '@/shared/components/categories/CategoryTreePanel'
import { EmptyState } from '@/shared/components/feedback'
import { AreaSelectionBox } from '@/shared/components/selection'
import { useGridAreaSelection, useListSelection } from '@/shared/hooks'
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
  renderCardAccessory,
}: ModelGridProps) {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null)
  const contextMenuRef = useRef<ModelContextMenuHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
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
    uploadFolder,
    uploadZip,
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
    allCount,
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
    uvStatus,
    setUvStatus,
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
    onOpenModel: id => openModelDetailsTab(String(id)),
  })

  const selectedModels = useMemo(
    () =>
      filteredModels.filter(model => selectedModelIds.has(String(model.id))),
    [filteredModels, selectedModelIds]
  )

  // --- Selection (shared model: click / Ctrl+click / Shift range / Ctrl+A) ---
  const orderedModelIds = useMemo(
    () => filteredModels.map(model => String(model.id)),
    [filteredModels]
  )
  const selection = useListSelection({
    orderedIds: orderedModelIds,
    selectedIds: selectedModelIds,
    onChange: setSelectedModelIdsState,
    enabled: isSelectionEnabled,
  })
  const {
    surfaceRef: selectionSurfaceRef,
    isAreaSelecting,
    selectionBox,
    surfaceProps: selectionSurfaceProps,
  } = useGridAreaSelection<string>({
    enabled: isSelectionEnabled,
    cardSelector: '.model-card[data-model-id]',
    getCardId: card => card.getAttribute('data-model-id'),
    onSelect: setSelectedModelIdsState,
  })

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
      // Deliberately do NOT mutate selection here - a mid-drag layout shift can
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

  const handleModelSelect = (model: { id: string; name: string }) => {
    openModelDetailsTab(model.id, model.name)
  }

  const toggleModelSelection = useCallback(
    (modelId: string, event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      selection.toggle(modelId, event)
    },
    [selection]
  )

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

  const handleFolderInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadFolder(e.target.files)
        e.target.value = ''
      }
    },
    [uploadFolder]
  )

  const handleZipInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        uploadZip(e.target.files[0])
        e.target.value = ''
      }
    },
    [uploadZip]
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
      ref={selection.containerRef}
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

      {/* Folder picker for multi-file glTF (external .bin + textures). webkitdirectory
          is a non-standard attribute, set imperatively so the ref stays typed. */}
      <input
        type="file"
        ref={el => {
          folderInputRef.current = el
          if (el) {
            el.setAttribute('webkitdirectory', '')
            el.setAttribute('directory', '')
          }
        }}
        style={{ display: 'none' }}
        multiple
        onChange={handleFolderInputChange}
      />

      <input
        type="file"
        ref={zipInputRef}
        style={{ display: 'none' }}
        accept=".zip"
        onChange={handleZipInputChange}
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
        uvStatus={uvStatus}
        onPackFilterChange={handlePackFilterChange}
        onProjectFilterChange={handleProjectFilterChange}
        onTagChange={setSelectedTagNames}
        onHasConceptImagesChange={setHasConceptImages}
        onAnimatedOnlyChange={setAnimatedOnly}
        onMinTriangleCountChange={setMinTriangleCount}
        onMaxTriangleCountChange={setMaxTriangleCount}
        onUvStatusChange={setUvStatus}
        packFilterDisabled={packFilterDisabled}
        projectFilterDisabled={projectFilterDisabled}
        cardWidth={cardWidth}
        onCardWidthChange={handleCardWidthChange}
        modelCount={pagination.totalCount}
        selectedModelCount={selectedModels.length}
        onUploadClick={() => fileInputRef.current?.click()}
        onUploadFolderClick={() => folderInputRef.current?.click()}
        onUploadZipClick={() => zipInputRef.current?.click()}
        onRefreshClick={handleRefresh}
        onBulkActionsClick={handleBulkActionsClick}
        onSelectAllClick={selection.selectAll}
        onDeselectAllClick={selection.deselectAll}
        visibleModelCount={filteredModels.length}
        showCategoryToggle={showCategorySidebar}
        isCategoryPanelOpen={isCategoryPanelOpen}
        onCategoryPanelToggle={() => setIsCategoryPanelOpen(open => !open)}
        categoryFilterActive={
          activeCategoryId != null && activeCategoryId !== ALL_CATEGORIES_ID
        }
      />

      {/* What the import guessed, waiting for a person. Renders nothing when the
          queue is empty, which is the normal state. */}
      <ImportSuggestionsBanner />

      <div className="model-grid-body">
        {showCategorySidebar && isCategoryPanelOpen && (
          <aside className="model-category-sidebar">
            <CategoryTreePanel
              categories={categories}
              activeCategoryId={activeCategoryId}
              dragOverCategoryId={dragOverCategoryId}
              categoryCounts={categoryCounts}
              unassignedCount={unassignedCount}
              allCount={allCount}
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
              onMouseDown={selectionSurfaceProps.onMouseDown}
              onMouseMove={selectionSurfaceProps.onMouseMove}
              onMouseUp={selectionSurfaceProps.onMouseUp}
              onMouseLeave={selectionSurfaceProps.onMouseUp}
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
                          {renderCardAccessory ? (
                            <div className="model-card-accessory">
                              {renderCardAccessory(model)}
                            </div>
                          ) : null}
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
                <AreaSelectionBox
                  box={selectionBox}
                  className="model-grid-selection-box"
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
