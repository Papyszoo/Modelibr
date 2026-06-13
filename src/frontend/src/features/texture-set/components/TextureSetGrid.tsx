import './TextureSetGrid.css'

import { useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { Tag } from 'primereact/tag'
import { Toast } from 'primereact/toast'
import {
  forwardRef,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type GridComponents, VirtuosoGrid } from 'react-virtuoso'

import { getFilePreviewUrl } from '@/features/models/api/modelApi'
import { addTextureSetToPack } from '@/features/pack/api/packApi'
import { addTextureSetToProject } from '@/features/project/api/projectApi'
import {
  addTextureToSetEndpoint,
  hardDeleteTextureSet,
  regenerateTextureSetThumbnail,
  softDeleteTextureSet,
  updateTextureSet,
} from '@/features/texture-set/api/textureSetApi'
import { TextureSetCategoryManagerDialog } from '@/features/texture-set/components/TextureSetCategoryManagerDialog'
import { ChangeTextureSetCategoryDialog } from '@/features/texture-set/dialogs/ChangeTextureSetCategoryDialog'
import { CreateTextureSetDialog } from '@/features/texture-set/dialogs/CreateTextureSetDialog'
import { MergeTextureSetDialog } from '@/features/texture-set/dialogs/MergeTextureSetDialog'
import { useTabContext } from '@/hooks/useTabContext'
import { baseURL } from '@/lib/apiBase'
import { SelectPackDialog } from '@/shared/components/dialogs/SelectPackDialog'
import { SelectProjectDialog } from '@/shared/components/dialogs/SelectProjectDialog'
import { useTagVocabulary } from '@/shared/hooks/useTagVocabulary'
import {
  type TextureChannel,
  type TextureSetDto,
  TextureSetKind,
  TextureType,
} from '@/types'
import {
  copyPathToClipboard,
  getCopyPathSuccessMessage,
  openInFileExplorer,
} from '@/utils/webdavUtils'

import { TexturesFilters } from './TexturesFilters'
import { useTextureSetGrid } from './useTextureSetGrid'

interface ChannelMergeRequest {
  fileId: number
  mappings: Array<{
    channel: TextureChannel
    textureType: TextureType
  }>
}

const ALL_PROXY_SIZES = [256, 512, 1024, 2048]

interface GridContext {
  cardWidth: number
  isLoadingMore: boolean
}

const gridComponents: GridComponents<GridContext> = {
  List: forwardRef(({ children, context, ...props }, ref) => (
    <div
      ref={ref}
      {...props}
      className="texture-set-grid"
      style={
        {
          ...props.style,
          '--texture-set-card-width': `${context?.cardWidth ?? 200}px`,
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
      <div className="texture-set-grid-loading-more" aria-live="polite">
        <i className="pi pi-spin pi-spinner" />
        <span>Loading more…</span>
      </div>
    ) : null,
}

interface TextureSetGridProps {
  kind?: TextureSetKind
  viewStateScope?: string
}

export function TextureSetGrid({ kind, viewStateScope }: TextureSetGridProps) {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showPackDialog, setShowPackDialog] = useState(false)
  const [showProjectDialog, setShowProjectDialog] = useState(false)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showChangeCategory, setShowChangeCategory] = useState(false)
  const [draggedTextureSet, setDraggedTextureSet] =
    useState<TextureSetDto | null>(null)
  const [dropTargetTextureSet, setDropTargetTextureSet] =
    useState<TextureSetDto | null>(null)
  const [dragOverCardId, setDragOverCardId] = useState<number | null>(null)
  const [activeContextSet, setActiveContextSet] =
    useState<TextureSetDto | null>(null)
  const [contextMode, setContextMode] = useState<'single' | 'bulk'>('single')

  // Area-drag (lasso) selection state. Card-drag-to-merge uses HTML5 native
  // drag (a separate event stream) so the two don't conflict — we only
  // start the lasso when the mousedown originates *outside* a card.
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const contextMenu = useRef<ContextMenu>(null)
  const isShowingMergeDialog = useRef(false)
  const selectionSurfaceRef = useRef<HTMLDivElement | null>(null)

  const { openTextureSetDetailsTab } = useTabContext()
  const queryClient = useQueryClient()

  const {
    textureSets,
    filteredTextureSets,
    totalCount,
    isLoading,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    packs,
    projects,
    categories,
    categoriesKind,
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    isFiltersOpen,
    setIsFiltersOpen,
    selectedPackIds,
    setSelectedPackIds,
    selectedProjectIds,
    setSelectedProjectIds,
    selectedCategoryKeys,
    setSelectedCategoryKeys,
    selectedTextureTypes,
    setSelectedTextureTypes,
    selectedTagNames,
    setSelectedTagNames,
    selectedTextureSetIds,
    setSelectedTextureSetIds,
    cardWidth,
    handleCardWidthChange,
    handleRefresh,
    handleCreateTextureSet,
    invalidateTextureSets,
    dragHandlers,
    handleFileDrop,
    toast,
  } = useTextureSetGrid({ kind, viewStateScope })

  const tagVocabulary = useTagVocabulary()

  const selectedIdSet = useMemo(
    () => new Set(selectedTextureSetIds),
    [selectedTextureSetIds]
  )

  const selectedTextureSets = useMemo(
    () => filteredTextureSets.filter(set => selectedIdSet.has(set.id)),
    [filteredTextureSets, selectedIdSet]
  )

  // --- Page identity (count chip label) ---
  const unitLabel =
    kind === TextureSetKind.Universal
      ? 'material'
      : kind === TextureSetKind.ModelSpecific
        ? 'texture'
        : 'set'

  // --- Selection helpers ---
  const toggleSelection = useCallback(
    (id: number) => {
      const next = new Set(selectedTextureSetIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setSelectedTextureSetIds([...next])
    },
    [selectedTextureSetIds, setSelectedTextureSetIds]
  )

  const handleSelectAll = useCallback(() => {
    setSelectedTextureSetIds(filteredTextureSets.map(s => s.id))
  }, [filteredTextureSets, setSelectedTextureSetIds])

  const handleDeselectAll = useCallback(() => {
    setSelectedTextureSetIds([])
  }, [setSelectedTextureSetIds])

  // --- Area-drag (lasso) selection ---
  const handleGridMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionSurfaceRef.current || !scrollParent) return
      // Card-drag-to-merge starts on the card itself; ignore those so we
      // don't fight HTML5 drag.
      const target = event.target as HTMLElement
      if (target.closest('.texture-set-card')) return
      // Only react to primary-button drags.
      if (event.button !== 0) return

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
    [scrollParent]
  )

  const handleGridMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        !isAreaSelecting ||
        !selectionBox ||
        !selectionSurfaceRef.current ||
        !scrollParent
      ) {
        return
      }
      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      setSelectionBox(prev =>
        prev
          ? {
              ...prev,
              currentX: event.clientX - rect.left,
              currentY: event.clientY - rect.top,
            }
          : null
      )
    },
    [isAreaSelecting, scrollParent, selectionBox]
  )

  const handleGridMouseUp = useCallback(() => {
    if (
      isAreaSelecting &&
      selectionBox &&
      selectionSurfaceRef.current &&
      scrollParent
    ) {
      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      const left = Math.min(selectionBox.startX, selectionBox.currentX)
      const top = Math.min(selectionBox.startY, selectionBox.currentY)
      const right = Math.max(selectionBox.startX, selectionBox.currentX)
      const bottom = Math.max(selectionBox.startY, selectionBox.currentY)

      const cards = selectionSurfaceRef.current.querySelectorAll<HTMLElement>(
        '.texture-set-card[data-texture-set-id]'
      )
      const next = new Set<number>()
      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft = cardRect.left - rect.left
        const cardTop = cardRect.top - rect.top
        const cardRight = cardLeft + cardRect.width
        const cardBottom = cardTop + cardRect.height
        if (
          cardRight >= left &&
          cardLeft <= right &&
          cardBottom >= top &&
          cardTop <= bottom
        ) {
          const id = Number(card.getAttribute('data-texture-set-id'))
          if (!Number.isNaN(id)) next.add(id)
        }
      })

      if (next.size > 0) {
        setSelectedTextureSetIds([...next])
      }
    }
    setIsAreaSelecting(false)
    setSelectionBox(null)
  }, [isAreaSelecting, scrollParent, selectionBox, setSelectedTextureSetIds])

  // --- File upload (toolbar button) ---
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileDrop(e.target.files)
        e.target.value = ''
      }
    },
    [handleFileDrop]
  )

  // --- Card drag-to-merge ---
  const handleCardDragStart = (
    e: React.DragEvent,
    textureSet: TextureSetDto
  ) => {
    e.stopPropagation()
    setDraggedTextureSet(textureSet)
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(
      'application/x-texture-set-id',
      textureSet.id.toString()
    )
  }

  const handleCardDragEnd = (e: React.DragEvent) => {
    e.stopPropagation()
    if (!isShowingMergeDialog.current) {
      setDraggedTextureSet(null)
    }
    setDragOverCardId(null)
  }

  const handleCardDragOver = (
    e: React.DragEvent,
    textureSet: TextureSetDto
  ) => {
    if (e.dataTransfer.types.includes('application/x-texture-set-id')) {
      e.preventDefault()
      e.stopPropagation()
      setDragOverCardId(textureSet.id)
    }
  }

  const handleCardDragLeave = (
    e: React.DragEvent,
    textureSet: TextureSetDto
  ) => {
    e.stopPropagation()
    if (dragOverCardId === textureSet.id) {
      setDragOverCardId(null)
    }
  }

  const handleCardDrop = (e: React.DragEvent, target: TextureSetDto) => {
    e.preventDefault()
    e.stopPropagation()

    const draggedSetId = e.dataTransfer.getData('application/x-texture-set-id')
    if (!draggedSetId || !draggedTextureSet) {
      setDragOverCardId(null)
      return
    }

    if (draggedTextureSet.id === target.id) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Cannot merge a texture set with itself',
        life: 3000,
      })
      setDraggedTextureSet(null)
      setDragOverCardId(null)
      return
    }

    if (
      !draggedTextureSet.textures ||
      draggedTextureSet.textures.length === 0
    ) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Source texture set has no textures to merge',
        life: 3000,
      })
      setDraggedTextureSet(null)
      setDragOverCardId(null)
      return
    }

    isShowingMergeDialog.current = true
    setDropTargetTextureSet(target)
    setShowMergeDialog(true)
    setDragOverCardId(null)
  }

  const handleMergeTextureSets = async (requests: ChannelMergeRequest[]) => {
    if (!draggedTextureSet || !dropTargetTextureSet) return

    try {
      for (const request of requests) {
        for (const mapping of request.mappings) {
          await addTextureToSetEndpoint(dropTargetTextureSet.id, {
            fileId: request.fileId,
            textureType: mapping.textureType,
            sourceChannel: mapping.channel,
          })
        }
      }
      await hardDeleteTextureSet(draggedTextureSet.id)
      const textureCount = requests.reduce(
        (sum, r) => sum + r.mappings.length,
        0
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: `Merged ${textureCount} texture${textureCount !== 1 ? 's' : ''} successfully`,
        life: 3000,
      })
      invalidateTextureSets()
      setShowMergeDialog(false)
      setDraggedTextureSet(null)
      setDropTargetTextureSet(null)
    } catch (error) {
      console.error('Failed to merge texture sets:', error)
      throw error
    }
  }

  const handleMergeDialogHide = () => {
    setShowMergeDialog(false)
    setDraggedTextureSet(null)
    setDropTargetTextureSet(null)
    isShowingMergeDialog.current = false
  }

  // --- Thumbnails ---
  const getAlbedoTextureUrl = (textureSet: TextureSetDto) => {
    if (
      textureSet.kind === TextureSetKind.Universal &&
      textureSet.thumbnailPath
    ) {
      return `${baseURL}/texture-sets/${textureSet.id}/thumbnail/file`
    }
    const albedo = textureSet.textures?.find(
      t => t.textureType === TextureType.Albedo
    )
    if (albedo) return getFilePreviewUrl(albedo.fileId.toString())
    return null
  }

  // --- Context menu actions ---
  const targetSets = (): TextureSetDto[] => {
    if (contextMode === 'bulk') return selectedTextureSets
    return activeContextSet ? [activeContextSet] : []
  }

  const handleShowInFolder = async () => {
    const result = await openInFileExplorer('TextureSets')
    toast.current?.show({
      severity: result.success ? 'info' : 'warn',
      summary: result.success ? 'Opening' : 'Note',
      detail: result.message,
      life: 4000,
    })
  }

  const handleCopyPath = async () => {
    const result = await copyPathToClipboard('TextureSets')
    toast.current?.show({
      severity: result.success ? 'success' : 'error',
      summary: result.success ? 'Copied' : 'Failed',
      detail: result.success
        ? getCopyPathSuccessMessage()
        : 'Failed to copy path to clipboard',
      life: 5000,
    })
  }

  const handleRegenerateThumbnail = async () => {
    const sets = targetSets().filter(s => s.kind === TextureSetKind.Universal)
    if (sets.length === 0) return
    let okCount = 0
    for (const set of sets) {
      try {
        await regenerateTextureSetThumbnail(set.id)
        okCount += 1
      } catch (error) {
        console.error('Failed to regenerate thumbnail:', error)
      }
    }
    // Single-item: keep the original message text — the e2e tests assert on it.
    const detail =
      sets.length === 1
        ? okCount === 1
          ? 'Thumbnail regeneration started'
          : 'Failed to regenerate thumbnail'
        : `Regeneration started for ${okCount} of ${sets.length} sets`
    toast.current?.show({
      severity: okCount > 0 ? 'success' : 'error',
      summary: 'Thumbnail',
      detail,
      life: 3000,
    })
    invalidateTextureSets()
  }

  const handleGenerateProxy = async (size: number) => {
    const sets = targetSets().filter(s => s.kind === TextureSetKind.Universal)
    if (sets.length === 0) return
    let okCount = 0
    for (const set of sets) {
      try {
        await regenerateTextureSetThumbnail(set.id, { proxySize: size })
        okCount += 1
      } catch (error) {
        console.error('Failed to generate proxy:', error)
      }
    }
    toast.current?.show({
      severity: okCount > 0 ? 'success' : 'error',
      summary: 'Proxy Generation',
      detail: `${size}px proxy started for ${okCount} of ${sets.length} set${sets.length === 1 ? '' : 's'}`,
      life: 3000,
    })
    invalidateTextureSets()
  }

  // After mutating a pack/project association, refresh both list-level and
  // container-viewer caches so an open Pack/Project tab updates live. Also
  // bust `all-textureSets-for-container` so the next "Add ..." dialog open
  // doesn't show the just-added set as still-available.
  const invalidateContainerCaches = (target: 'pack' | 'project') => {
    queryClient.invalidateQueries({
      queryKey: [target === 'pack' ? 'packs' : 'projects'],
    })
    queryClient.invalidateQueries({ queryKey: ['container'] })
    queryClient.invalidateQueries({ queryKey: ['container-textureSets'] })
    queryClient.invalidateQueries({
      queryKey: ['all-textureSets-for-container'],
    })
  }

  const handleAddToPack = async (packId: number) => {
    const sets = targetSets()
    let okCount = 0
    for (const set of sets) {
      try {
        await addTextureSetToPack(packId, set.id)
        okCount += 1
      } catch (error) {
        console.error('Failed to add texture set to pack:', error)
      }
    }
    toast.current?.show({
      severity: okCount === sets.length ? 'success' : 'warn',
      summary: 'Add to pack',
      detail: `Added ${okCount} of ${sets.length} set${sets.length === 1 ? '' : 's'}`,
      life: 3000,
    })
    setShowPackDialog(false)
    invalidateContainerCaches('pack')
  }

  const handleAddToProject = async (projectId: number) => {
    const sets = targetSets()
    let okCount = 0
    for (const set of sets) {
      try {
        await addTextureSetToProject(projectId, set.id)
        okCount += 1
      } catch (error) {
        console.error('Failed to add texture set to project:', error)
      }
    }
    toast.current?.show({
      severity: okCount === sets.length ? 'success' : 'warn',
      summary: 'Add to project',
      detail: `Added ${okCount} of ${sets.length} set${sets.length === 1 ? '' : 's'}`,
      life: 3000,
    })
    setShowProjectDialog(false)
    invalidateContainerCaches('project')
  }

  const handleChangeCategory = async (categoryId: number) => {
    const allSets = targetSets()
    // ModelOwned sets don't participate in the shared category system; the
    // backend would reject them with CategoryKindMismatch. Filter them out
    // up front and surface the skip in the toast so the user isn't left
    // wondering why N-1 of N succeeded.
    const eligible = allSets.filter(s => s.kind !== TextureSetKind.ModelOwned)
    const skipped = allSets.length - eligible.length

    // Issue updates in parallel — they're independent.
    const results = await Promise.allSettled(
      eligible.map(set =>
        updateTextureSet(set.id, { name: set.name, categoryId })
      )
    )
    const okCount = results.filter(r => r.status === 'fulfilled').length
    const failedCount = eligible.length - okCount

    if (failedCount > 0) {
      console.error(
        'Failed to change category for some texture sets:',
        results.filter(r => r.status === 'rejected')
      )
    }

    const detailParts = [
      `Updated ${okCount} of ${eligible.length} ${unitLabel}${eligible.length === 1 ? '' : 's'}`,
    ]
    if (skipped > 0) {
      detailParts.push(`skipped ${skipped} model-owned`)
    }
    toast.current?.show({
      severity:
        okCount === eligible.length && eligible.length > 0
          ? 'success'
          : okCount === 0
            ? 'error'
            : 'warn',
      summary: 'Category changed',
      detail: detailParts.join(' — '),
      life: 3000,
    })
    invalidateTextureSets()

    // Surface total failure to the dialog so it can keep the user's
    // selection rather than closing.
    if (eligible.length > 0 && okCount === 0) {
      throw new Error('All category assignments failed')
    }
  }

  const handleRecycle = async () => {
    const sets = targetSets()
    let okCount = 0
    for (const set of sets) {
      try {
        await softDeleteTextureSet(set.id)
        okCount += 1
      } catch (error) {
        console.error('Failed to recycle texture set:', error)
      }
    }
    // Single-item: preserve the original message text — e2e tests assert on it.
    const detail =
      sets.length === 1
        ? okCount === 1
          ? 'Texture set moved to recycled files'
          : 'Failed to move texture set to recycled files'
        : `Moved ${okCount} of ${sets.length} sets to recycled files`
    toast.current?.show({
      severity: okCount === sets.length ? 'success' : 'warn',
      summary: 'Recycled',
      detail,
      life: 3000,
    })
    invalidateTextureSets()
    queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
    if (contextMode === 'bulk') {
      setSelectedTextureSetIds([])
    }
  }

  const contextMenuItems: MenuItem[] = useMemo(() => {
    const sets =
      contextMode === 'bulk'
        ? selectedTextureSets
        : activeContextSet
          ? [activeContextSet]
          : []
    const allUniversal =
      sets.length > 0 && sets.every(s => s.kind === TextureSetKind.Universal)
    const selectedCountLabel = `${sets.length} ${unitLabel}${sets.length === 1 ? '' : 's'}`
    return [
      {
        disabled: true,
        visible: contextMode === 'bulk',
        template: () => (
          <div className="texture-set-context-menu-title">
            Selected {selectedCountLabel}
          </div>
        ),
      },
      { separator: true, visible: contextMode === 'bulk' },
      {
        label: 'Show in Folder',
        icon: 'pi pi-folder-open',
        command: handleShowInFolder,
        visible: contextMode === 'single',
      },
      {
        label: 'Copy Folder Path',
        icon: 'pi pi-copy',
        command: handleCopyPath,
        visible: contextMode === 'single',
      },
      { separator: true, visible: contextMode === 'single' },
      {
        label:
          contextMode === 'bulk'
            ? `Regenerate Thumbnails (${sets.length})`
            : 'Regenerate Thumbnail',
        icon: 'pi pi-refresh',
        command: handleRegenerateThumbnail,
        visible: allUniversal,
      },
      {
        label: 'Generate Proxies',
        icon: 'pi pi-images',
        visible: allUniversal,
        items: ALL_PROXY_SIZES.map(size => ({
          label: `${size}px`,
          command: () => handleGenerateProxy(size),
        })),
      },
      {
        label: 'Change Category',
        icon: 'pi pi-sitemap',
        command: () => setShowChangeCategory(true),
      },
      {
        label:
          contextMode === 'bulk' ? `Add ${sets.length} to pack` : 'Add to pack',
        icon: 'pi pi-box',
        command: () => setShowPackDialog(true),
      },
      {
        label:
          contextMode === 'bulk'
            ? `Add ${sets.length} to Project`
            : 'Add to Project',
        icon: 'pi pi-folder',
        command: () => setShowProjectDialog(true),
      },
      {
        label: contextMode === 'bulk' ? `Recycle ${sets.length}` : 'Recycle',
        icon: 'pi pi-trash',
        command: handleRecycle,
      },
    ]
    // Handlers are component-local closures that read the same state
    // captured below — including them would trigger a new menu identity on
    // every render and drop the open menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMode, activeContextSet, selectedTextureSets, unitLabel])

  const handleBulkActionsClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (selectedTextureSets.length === 0) return
      setContextMode('bulk')
      setActiveContextSet(null)
      contextMenu.current?.show(event as unknown as React.MouseEvent)
    },
    [selectedTextureSets.length]
  )

  // --- Card click + middle-click handlers ---
  const handleCardClick = (set: TextureSetDto) => {
    openTextureSetDetailsTab(set.id, set.name)
  }

  const handleCardAuxClick = (event: React.MouseEvent, set: TextureSetDto) => {
    if (event.button !== 1) return
    event.preventDefault()
    openTextureSetDetailsTab(set.id, set.name, { activate: false })
  }

  const handleCardContextMenu = (
    event: React.MouseEvent,
    set: TextureSetDto
  ) => {
    event.preventDefault()
    if (selectedIdSet.size > 1 && selectedIdSet.has(set.id)) {
      setContextMode('bulk')
      setActiveContextSet(null)
    } else {
      setContextMode('single')
      setActiveContextSet(set)
    }
    contextMenu.current?.show(event)
  }

  // --- Render ---
  // The toolbar stays mounted across loading / error / empty states so the
  // search input does not lose focus mid-typing when the query key changes.

  return (
    <div
      ref={setScrollParent}
      className="texture-set-grid-container"
      onDrop={dragHandlers.onDrop}
      onDragOver={dragHandlers.onDragOver}
      onDragEnter={dragHandlers.onDragEnter}
      onDragLeave={dragHandlers.onDragLeave}
    >
      <Toast ref={toast} />
      <ContextMenu model={contextMenuItems} ref={contextMenu} />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*,.exr,.tga,.bmp,.tif,.tiff"
        multiple
        style={{ display: 'none' }}
        data-testid="texture-upload-input"
      />

      <TexturesFilters
        isSearchOpen={isSearchOpen}
        onSearchToggle={setIsSearchOpen}
        isFiltersOpen={isFiltersOpen}
        onFiltersToggle={setIsFiltersOpen}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        packs={packs}
        projects={projects}
        categories={categories}
        selectedPackIds={selectedPackIds}
        selectedProjectIds={selectedProjectIds}
        selectedCategoryKeys={selectedCategoryKeys}
        selectedTextureTypes={selectedTextureTypes}
        availableTags={tagVocabulary.data ?? []}
        selectedTagNames={selectedTagNames}
        onPackFilterChange={setSelectedPackIds}
        onProjectFilterChange={setSelectedProjectIds}
        onCategoryChange={setSelectedCategoryKeys}
        onManageCategoriesClick={() => setShowCategoryManager(true)}
        onTextureTypesChange={setSelectedTextureTypes}
        onTagChange={setSelectedTagNames}
        cardWidth={cardWidth}
        onCardWidthChange={handleCardWidthChange}
        count={totalCount || filteredTextureSets.length}
        unitLabel={unitLabel}
        selectedCount={selectedTextureSets.length}
        visibleCount={filteredTextureSets.length}
        onUploadClick={handleUploadClick}
        onCreateClick={() => setShowCreateDialog(true)}
        onRefreshClick={handleRefresh}
        onBulkActionsClick={handleBulkActionsClick}
        onSelectAllClick={handleSelectAll}
        onDeselectAllClick={handleDeselectAll}
      />

      {isLoading ? (
        <div className="texture-set-grid-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading texture sets...</p>
        </div>
      ) : error ? (
        <div className="texture-set-grid-error">
          <i
            className="pi pi-exclamation-triangle"
            style={{ fontSize: '2rem' }}
          />
          <p>{error}</p>
          <Button
            label="Retry"
            icon="pi pi-refresh"
            className="p-button-outlined"
            onClick={() => refetch()}
          />
        </div>
      ) : textureSets.length === 0 ? (
        // The server returned zero items. Two distinct cases:
        //   1. No texture sets exist for this kind/scope and no filter
        //      is active → render the drop-zone empty state (dashed
        //      border invites a drag-drop).
        //   2. A search or filter is active and narrowed everything
        //      out → render the "no-results" state instead. The dashed
        //      drop-zone framing is misleading here because the user's
        //      data does exist; surface the active query and a Clear
        //      button so a collapsed search panel doesn't become a
        //      hidden trap ("user could forget that he searched for
        //      something").
        searchQuery.trim().length > 0 ||
        selectedPackIds.length > 0 ||
        selectedProjectIds.length > 0 ||
        selectedTextureTypes.length > 0 ||
        Object.values(selectedCategoryKeys).some(s => s?.checked) ? (
          <div className="no-results">
            <i className="pi pi-search" />
            <p>
              No texture sets match the current filters
              {searchQuery.trim().length > 0
                ? ` for "${searchQuery.trim()}"`
                : ''}
              .
            </p>
            {searchQuery.trim().length > 0 ? (
              <Button
                label="Clear search"
                icon="pi pi-times"
                className="p-button-text p-button-sm"
                onClick={() => setSearchQuery('')}
              />
            ) : null}
          </div>
        ) : (
          <div className="texture-set-grid-empty">
            <i className="pi pi-images" />
            <h3>No Texture Sets</h3>
            <p>Drag and drop texture files here to create new sets</p>
            <p className="hint">
              Each file will create a new texture set with an albedo texture
            </p>
          </div>
        )
      ) : filteredTextureSets.length === 0 ? (
        <div className="no-results">
          <i className="pi pi-search" />
          <p>No texture sets match the current filters.</p>
        </div>
      ) : (
        <div
          ref={selectionSurfaceRef}
          className={`texture-set-grid-selection-surface${isAreaSelecting ? ' is-selecting' : ''}`}
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
          onMouseLeave={handleGridMouseUp}
        >
          <VirtuosoGrid
            customScrollParent={scrollParent ?? undefined}
            totalCount={filteredTextureSets.length}
            overscan={200}
            components={gridComponents}
            context={{ cardWidth, isLoadingMore: isFetchingNextPage }}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage()
              }
            }}
            itemContent={index => {
              const textureSet = filteredTextureSets[index]
              if (!textureSet) return null
              const albedoUrl = getAlbedoTextureUrl(textureSet)
              const isDraggedOver = dragOverCardId === textureSet.id
              const isSelected = selectedIdSet.has(textureSet.id)
              const proxySizes = new Set<number>()
              textureSet.textures?.forEach(t => {
                ;(t.proxies ?? []).forEach(p => proxySizes.add(p.size))
              })

              return (
                <div
                  key={textureSet.id}
                  className={`texture-set-card${isSelected ? ' selected' : ''}${isDraggedOver ? ' drag-over-card' : ''}`}
                  data-texture-set-id={textureSet.id}
                  draggable={true}
                  onDragStart={e => handleCardDragStart(e, textureSet)}
                  onDragEnd={handleCardDragEnd}
                  onDragOver={e => handleCardDragOver(e, textureSet)}
                  onDragLeave={e => handleCardDragLeave(e, textureSet)}
                  onDrop={e => handleCardDrop(e, textureSet)}
                  onClick={() => handleCardClick(textureSet)}
                  onMouseDown={event => {
                    if (event.button === 1) {
                      event.preventDefault()
                    }
                  }}
                  onAuxClick={e => handleCardAuxClick(e, textureSet)}
                  onContextMenu={e => handleCardContextMenu(e, textureSet)}
                >
                  <div className="texture-set-card-thumbnail">
                    <button
                      type="button"
                      className="texture-set-select-checkbox"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        toggleSelection(textureSet.id)
                      }}
                      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${textureSet.name}`}
                      aria-pressed={isSelected}
                    >
                      <i
                        className={`pi ${isSelected ? 'pi-check-square' : 'pi-stop'}`}
                      />
                    </button>

                    {albedoUrl ? (
                      <img
                        src={albedoUrl}
                        alt={textureSet.name}
                        className="texture-set-image"
                      />
                    ) : (
                      <div className="texture-set-placeholder">
                        <i className="pi pi-image" />
                        <span>No Preview</span>
                      </div>
                    )}
                    <div className="texture-set-card-overlay">
                      <span className="texture-set-card-name">
                        {textureSet.name}
                      </span>
                      <div className="texture-set-card-info">
                        <span className="texture-count">
                          <i className="pi pi-palette" />
                          {textureSet.textureCount || 0} texture
                          {textureSet.textureCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    {proxySizes.size > 0 ? (
                      <div className="texture-set-card-badges">
                        {ALL_PROXY_SIZES.filter(s => proxySizes.has(s)).map(
                          size => (
                            <Tag
                              key={size}
                              value={`${size}`}
                              severity="success"
                              className="grid-proxy-badge"
                            />
                          )
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            }}
          />

          {isAreaSelecting && selectionBox ? (
            <div
              className="texture-set-grid-selection-box"
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

      <SelectPackDialog
        visible={showPackDialog}
        onHide={() => setShowPackDialog(false)}
        onSelect={handleAddToPack}
      />

      <SelectProjectDialog
        visible={showProjectDialog}
        onHide={() => setShowProjectDialog(false)}
        onSelect={handleAddToProject}
        header={
          contextMode === 'bulk' && selectedTextureSets.length > 0
            ? `Add ${selectedTextureSets.length} ${unitLabel}${selectedTextureSets.length === 1 ? '' : 's'} to Project`
            : 'Add to Project'
        }
      />

      <MergeTextureSetDialog
        visible={showMergeDialog}
        sourceTextureSet={draggedTextureSet}
        targetTextureSet={dropTargetTextureSet}
        onHide={handleMergeDialogHide}
        onMerge={handleMergeTextureSets}
      />

      <ChangeTextureSetCategoryDialog
        visible={showChangeCategory}
        categories={categories}
        selectedCount={contextMode === 'bulk' ? selectedTextureSets.length : 1}
        unitLabel={unitLabel}
        initialCategoryId={
          contextMode === 'single'
            ? (activeContextSet?.categoryId ?? null)
            : null
        }
        onHide={() => setShowChangeCategory(false)}
        onConfirm={handleChangeCategory}
        onManageCategories={() => {
          setShowChangeCategory(false)
          setShowCategoryManager(true)
        }}
      />

      <TextureSetCategoryManagerDialog
        visible={showCategoryManager}
        categories={categories}
        kind={categoriesKind}
        onHide={() => setShowCategoryManager(false)}
      />

      {showCreateDialog && (
        <CreateTextureSetDialog
          visible={showCreateDialog}
          onHide={() => setShowCreateDialog(false)}
          onSubmit={async (name, kind: number = 0) => {
            await handleCreateTextureSet(name, kind)
            setShowCreateDialog(false)
          }}
          lockedKind={kind}
        />
      )}
    </div>
  )
}
