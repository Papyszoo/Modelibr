import './ScriptList.css'
import '@/shared/components/FilterPanel.css'

import { type ContextMenu } from 'primereact/contextmenu'
import { Dropdown } from 'primereact/dropdown'
import { ProgressSpinner } from 'primereact/progressspinner'
import { Toast } from 'primereact/toast'
import {
  type DragEvent,
  type MouseEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'

import { createScript } from '@/features/scripts/api/scriptApi'
import { useScriptListData } from '@/features/scripts/hooks/useScriptListData'
import { useScriptMutations } from '@/features/scripts/hooks/useScriptMutations'
import { useScriptUpload } from '@/features/scripts/hooks/useScriptUpload'
import { useTabContext } from '@/hooks/useTabContext'
import { CategoryTreePanel } from '@/shared/components/categories/CategoryTreePanel'
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarCount,
  ListToolbarPanel,
  ListToolbarRow,
  ListToolbarSearchInput,
  ListToolbarSelectionActions,
  ListToolbarSelectionBar,
  ListToolbarSelectionSummary,
  OptionsButton,
} from '@/shared/components/list-toolbar'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { type ScriptDto } from '@/types'
import {
  copyPathToClipboard,
  getCopyPathSuccessMessage,
  openInFileExplorer,
} from '@/utils/webdavUtils'

import { getLanguageLabel } from '../utils/languages'
import { ScriptCategoryManagerDialog } from './ScriptCategoryManagerDialog'
import { ScriptContextMenu } from './ScriptContextMenu'
import { ScriptCreateDialog } from './ScriptCreateDialog'
import { ScriptGridContent } from './ScriptGridContent'

const UNASSIGNED_CATEGORY_ID = -1

export function ScriptList() {
  const toast = useRef<Toast>(null)
  const contextMenuRef = useRef<ContextMenu>(null)
  const scriptGridRef = useRef<HTMLDivElement>(null)
  const { openScriptDetailsTab } = useTabContext()

  const showToast = useCallback(
    (opts: {
      severity: string
      summary: string
      detail: string
      life: number
    }) => {
      toast.current?.show(opts as Parameters<Toast['show']>[0])
    },
    []
  )

  const {
    scripts,
    categories,
    loading,
    totalCount,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    activeCategoryId,
    setActiveCategoryId,
    searchQuery,
    setSearchQuery,
    language,
    setLanguage,
    filteredScripts,
    invalidateScripts,
    loadCategories,
  } = useScriptListData(showToast)

  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [isCreatingScript, setIsCreatingScript] = useState(false)
  const [dragOverCategoryId, setDragOverCategoryId] = useState<number | null>(
    null
  )
  const [draggedScriptId, setDraggedScriptId] = useState<number | null>(null)
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<number>>(
    new Set()
  )
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const [contextMenuTarget, setContextMenuTarget] = useState<ScriptDto | null>(
    null
  )
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const hasActiveLanguageFilter = language != null

  // Languages present in the loaded scripts, for the filter dropdown.
  const languageOptions = useMemo(() => {
    const present = Array.from(new Set(scripts.map(s => s.language)))
    return present
      .sort()
      .map(value => ({ value, label: getLanguageLabel(value) }))
  }, [scripts])

  // Per-category counts for the tree sidebar (from the loaded scripts).
  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const s of scripts) {
      if (s.categoryId != null) {
        counts.set(s.categoryId, (counts.get(s.categoryId) ?? 0) + 1)
      }
    }
    return counts
  }, [scripts])

  const unassignedCount = useMemo(
    () => scripts.filter(s => s.categoryId == null).length,
    [scripts]
  )

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.scripts

  const { moveScriptsToCategoryMutation, recycleScriptsMutation } =
    useScriptMutations({
      showToast,
      loadScripts: invalidateScripts,
      loadCategories,
      activeCategoryId,
      setActiveCategoryId,
      categories,
      setSelectedScriptIds,
      setContextMenuTarget,
    })

  const {
    onDrop,
    onDragOver,
    onDragEnter,
    onDragLeave,
    fileInputRef,
    handleFileDrop,
  } = useScriptUpload({
    showToast,
    activeCategoryId,
    loadScripts: invalidateScripts,
  })

  const openScript = (script: ScriptDto) => {
    openScriptDetailsTab(String(script.id), script.name)
  }

  const handleCreateScript = async (values: {
    name: string
    language: string
    description?: string
    content?: string
  }) => {
    setIsCreatingScript(true)
    try {
      const categoryId =
        activeCategoryId !== null && activeCategoryId !== UNASSIGNED_CATEGORY_ID
          ? activeCategoryId
          : undefined
      const created = await createScript({
        name: values.name,
        language: values.language,
        content: values.content ?? '',
        categoryId,
        description: values.description,
      })
      await invalidateScripts()
      setShowCreateDialog(false)
      // Open the new script's editor tab so the user can write it immediately.
      openScriptDetailsTab(String(created.scriptId), created.name)
    } catch (error) {
      console.error('Failed to create script:', error)
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create script',
        life: 3000,
      })
    } finally {
      setIsCreatingScript(false)
    }
  }

  const toggleScriptSelection = (scriptId: number, e: MouseEvent) => {
    e.stopPropagation()
    setSelectedScriptIds(prev => {
      const next = new Set(prev)
      if (next.has(scriptId)) {
        next.delete(scriptId)
      } else {
        next.add(scriptId)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedScriptIds(new Set())
  }

  const handleGridMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('.script-card')) {
      return
    }
    if (scriptGridRef.current) {
      const rect = scriptGridRef.current.getBoundingClientRect()
      setIsAreaSelecting(true)
      setSelectionBox({
        startX: e.clientX - rect.left + scriptGridRef.current.scrollLeft,
        startY: e.clientY - rect.top + scriptGridRef.current.scrollTop,
        currentX: e.clientX - rect.left + scriptGridRef.current.scrollLeft,
        currentY: e.clientY - rect.top + scriptGridRef.current.scrollTop,
      })
    }
  }

  const handleGridMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isAreaSelecting || !selectionBox || !scriptGridRef.current) return
    const gridRef = scriptGridRef.current
    const rect = gridRef.getBoundingClientRect()
    setSelectionBox(prev =>
      prev
        ? {
            ...prev,
            currentX: e.clientX - rect.left + gridRef.scrollLeft,
            currentY: e.clientY - rect.top + gridRef.scrollTop,
          }
        : null
    )
  }

  const handleGridMouseUp = () => {
    if (isAreaSelecting && selectionBox && scriptGridRef.current) {
      const rect = scriptGridRef.current.getBoundingClientRect()
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

      const cards = scriptGridRef.current.querySelectorAll('.script-card')
      const newSelected = new Set<number>()

      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft =
          cardRect.left - rect.left + scriptGridRef.current!.scrollLeft
        const cardTop =
          cardRect.top - rect.top + scriptGridRef.current!.scrollTop
        const cardRight = cardLeft + cardRect.width
        const cardBottom = cardTop + cardRect.height

        if (
          cardRight >= selectionLeft &&
          cardLeft <= selectionRight &&
          cardBottom >= selectionTop &&
          cardTop <= selectionBottom
        ) {
          const scriptId = card.getAttribute('data-script-id')
          if (scriptId) {
            newSelected.add(parseInt(scriptId, 10))
          }
        }
      })

      if (newSelected.size > 0) {
        setSelectedScriptIds(newSelected)
      }
    }
    setIsAreaSelecting(false)
    setSelectionBox(null)
  }

  const handleScriptDragStart = (
    e: DragEvent<HTMLDivElement>,
    script: ScriptDto
  ) => {
    setDraggedScriptId(script.id)
    e.dataTransfer.effectAllowed = 'move'
    const scriptIdsToMove = selectedScriptIds.has(script.id)
      ? Array.from(selectedScriptIds)
      : [script.id]
    e.dataTransfer.setData('text/plain', scriptIdsToMove.join(','))
  }

  const handleScriptDragEnd = () => {
    setDraggedScriptId(null)
    setDragOverCategoryId(null)
  }

  const handleCategoryDragOver = (
    e: DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedScriptId !== null) {
      setDragOverCategoryId(categoryId)
    }
  }

  const handleCategoryDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategoryId(null)
  }

  const handleCategoryDrop = async (
    e: DragEvent<HTMLDivElement>,
    targetCategoryId: number | null
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCategoryId(null)

    if (draggedScriptId === null) return

    const newCategoryId =
      targetCategoryId === UNASSIGNED_CATEGORY_ID ? null : targetCategoryId

    const scriptIdsToMove = selectedScriptIds.has(draggedScriptId)
      ? Array.from(selectedScriptIds)
      : [draggedScriptId]

    const scriptsToMove = scripts.filter(
      s => scriptIdsToMove.includes(s.id) && s.categoryId !== newCategoryId
    )

    if (scriptsToMove.length === 0) {
      setDraggedScriptId(null)
      return
    }

    moveScriptsToCategoryMutation.mutate({
      scriptIds: scriptsToMove.map(s => s.id),
      categoryId: newCategoryId,
    })

    setDraggedScriptId(null)
  }

  const handleRecycleScripts = async () => {
    const scriptIdsToRecycle =
      selectedScriptIds.size > 0
        ? Array.from(selectedScriptIds)
        : contextMenuTarget
          ? [contextMenuTarget.id]
          : []

    if (scriptIdsToRecycle.length === 0) return

    recycleScriptsMutation.mutate(scriptIdsToRecycle)
  }

  const resolveCategoryFolder = (): string => {
    let virtualPath = 'Scripts'
    if (
      activeCategoryId !== null &&
      activeCategoryId !== UNASSIGNED_CATEGORY_ID
    ) {
      const category = categories.find(c => c.id === activeCategoryId)
      if (category) {
        virtualPath = `Scripts/${category.name}`
      }
    }
    return virtualPath
  }

  const handleShowInFolder = async () => {
    const result = await openInFileExplorer(resolveCategoryFolder())
    showToast({
      severity: result.success ? 'info' : 'warn',
      summary: result.success ? 'Opening' : 'Note',
      detail: result.message,
      life: 4000,
    })
  }

  const handleCopyPath = async () => {
    const result = await copyPathToClipboard(resolveCategoryFolder())

    showToast({
      severity: result.success ? 'success' : 'error',
      summary: result.success ? 'Copied' : 'Failed',
      detail: result.success
        ? getCopyPathSuccessMessage()
        : 'Failed to copy path to clipboard',
      life: 5000,
    })
  }

  const handleScriptContextMenu = (
    e: React.MouseEvent<HTMLDivElement>,
    script: ScriptDto
  ) => {
    e.preventDefault()
    // Right-click only targets the card for the menu; it does not change the
    // checkbox selection. Menu actions fall back to this target when nothing
    // is explicitly selected (see handleRecycleScripts).
    setContextMenuTarget(script)
    contextMenuRef.current?.show(e)
  }

  return (
    <div
      className="script-list"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
    >
      <Toast ref={toast} />
      <ScriptContextMenu
        contextMenuRef={contextMenuRef}
        selectedCount={selectedScriptIds.size}
        onShowInFolder={handleShowInFolder}
        onCopyPath={handleCopyPath}
        onRecycle={handleRecycleScripts}
      />

      <ListToolbar>
        <ListToolbarRow>
          <ListToolbarActions>
            <ListToolbarButton
              icon="pi pi-search"
              label="Search"
              active={isSearchOpen || searchQuery.trim().length > 0}
              onClick={() => setIsSearchOpen(open => !open)}
              ariaLabel="Search"
              ariaExpanded={isSearchOpen}
              ariaControls="script-list-search-panel"
            />
            <ListToolbarButton
              icon="pi pi-sliders-h"
              label="Filters"
              active={isFiltersOpen || hasActiveLanguageFilter}
              onClick={() => setIsFiltersOpen(open => !open)}
              ariaLabel="Filters"
              ariaExpanded={isFiltersOpen}
              ariaControls="script-list-filters-panel"
              badge={hasActiveLanguageFilter ? 1 : undefined}
            />
            <OptionsButton
              cardWidth={cardWidth}
              minCardWidth={200}
              maxCardWidth={500}
              onCardWidthChange={width => setCardWidth('scripts', width)}
              showThumbnailAnimation={false}
            />
            <ListToolbarButton
              icon="pi pi-refresh"
              label="Refresh"
              onClick={() => void invalidateScripts()}
              tooltip="Refresh list"
              ariaLabel="Refresh"
            />
            <ListToolbarButton
              icon="pi pi-file-edit"
              label="New Script"
              onClick={() => setShowCreateDialog(true)}
              tooltip="Write a new script in-app"
              ariaLabel="New Script"
            />
            <ListToolbarButton
              icon="pi pi-folder"
              label="Categories"
              onClick={() => setShowCategoryManager(true)}
              tooltip="Manage script categories"
              ariaLabel="Manage Categories"
            />
          </ListToolbarActions>

          <ListToolbarCount
            icon="pi pi-code"
            count={filteredScripts.length}
            unitLabel="script"
          />
        </ListToolbarRow>

        {selectedScriptIds.size > 0 ? (
          <ListToolbarSelectionBar>
            <ListToolbarSelectionSummary>
              {selectedScriptIds.size} script
              {selectedScriptIds.size === 1 ? '' : 's'} selected.
            </ListToolbarSelectionSummary>
            <ListToolbarSelectionActions>
              <ListToolbarButton
                icon="pi pi-times"
                label="Clear"
                onClick={clearSelection}
              />
            </ListToolbarSelectionActions>
          </ListToolbarSelectionBar>
        ) : null}

        <ListToolbarPanel id="script-list-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search scripts..."
          />
        </ListToolbarPanel>

        <ListToolbarPanel id="script-list-filters-panel" open={isFiltersOpen}>
          <div className="list-filters-row">
            <div
              className="list-filters-switch"
              data-testid="script-language-filter"
            >
              <span>Language</span>
              <Dropdown
                value={language}
                options={languageOptions}
                onChange={e => setLanguage(e.value ?? null)}
                placeholder="All languages"
                showClear
                data-testid="language-filter"
              />
            </div>
          </div>
        </ListToolbarPanel>
      </ListToolbar>

      <div className="script-list-body">
        <CategoryTreePanel
          categories={categories}
          activeCategoryId={activeCategoryId}
          dragOverCategoryId={dragOverCategoryId}
          categoryCounts={categoryCounts}
          unassignedCount={unassignedCount}
          onCategoryChange={setActiveCategoryId}
          onCategoryDragOver={handleCategoryDragOver}
          onCategoryDragLeave={handleCategoryDragLeave}
          onCategoryDrop={handleCategoryDrop}
          unassignedCategoryId={UNASSIGNED_CATEGORY_ID}
          unassignedLabel="All scripts"
        />

        <div className="script-list-main">
          {loading ? (
            <div className="script-list-loading">
              <ProgressSpinner />
            </div>
          ) : (
            <ScriptGridContent
              filteredScripts={filteredScripts}
              cardWidth={cardWidth}
              selectedScriptIds={selectedScriptIds}
              draggedScriptId={draggedScriptId}
              scriptGridRef={scriptGridRef}
              isAreaSelecting={isAreaSelecting}
              selectionBox={selectionBox}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              totalCount={totalCount}
              totalScriptsCount={scripts.length}
              onToggleSelection={toggleScriptSelection}
              onScriptClick={openScript}
              onContextMenu={handleScriptContextMenu}
              onScriptDragStart={handleScriptDragStart}
              onScriptDragEnd={handleScriptDragEnd}
              onGridMouseDown={handleGridMouseDown}
              onGridMouseMove={handleGridMouseMove}
              onGridMouseUp={handleGridMouseUp}
              onLoadMore={() => fetchNextPage()}
            />
          )}
        </div>
      </div>

      <div className="script-drop-overlay">
        <i className="pi pi-upload" />
        <span>Drop source-code files here</span>
      </div>

      <ScriptCategoryManagerDialog
        visible={showCategoryManager}
        categories={categories}
        onHide={() => setShowCategoryManager(false)}
      />

      <ScriptCreateDialog
        visible={showCreateDialog}
        saving={isCreatingScript}
        onHide={() => setShowCreateDialog(false)}
        onCreate={handleCreateScript}
      />

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".js,.jsx,.mjs,.cjs,.ts,.tsx,.py,.cs,.cpp,.cc,.cxx,.c,.h,.hpp,.lua,.java,.go,.rs,.rb,.php,.sh,.sql,.json,.yaml,.yml,.xml,.glsl,.vert,.frag,.hlsl,.shader,.gd"
        multiple
        onChange={e => {
          if (e.target.files) {
            handleFileDrop(e.target.files)
          }
        }}
      />
    </div>
  )
}
