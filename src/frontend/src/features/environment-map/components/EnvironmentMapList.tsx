import './EnvironmentMapList.css'

import { Toast } from 'primereact/toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  useCreateEnvironmentMapWithFileMutation,
  useEnvironmentMapsQuery,
  useSetEnvironmentMapCustomThumbnailMutation,
} from '@/features/environment-map/api/queries'
import { useEnvironmentMapCategoriesQuery } from '@/features/environment-map/api/queries'
import { EnvironmentMapCategoryManagerDialog } from '@/features/environment-map/components/EnvironmentMapCategoryManagerDialog'
import {
  EnvironmentMapContextMenu,
  type EnvironmentMapContextMenuHandle,
} from '@/features/environment-map/components/EnvironmentMapContextMenu'
import {
  EnvironmentMapGrid,
  type SelectionBox,
} from '@/features/environment-map/components/EnvironmentMapGrid'
import { EnvironmentMapToolbar } from '@/features/environment-map/components/EnvironmentMapToolbar'
import {
  EnvironmentMapUploadDialog,
  type EnvironmentMapUploadDialogSubmitValues,
} from '@/features/environment-map/components/EnvironmentMapUploadDialog'
import { type EnvironmentMapDto } from '@/features/environment-map/types'
import { type EnvironmentMapUploadItem } from '@/features/environment-map/utils/environmentMapUploadUtils'
import { prepareEnvironmentMapUploadItems } from '@/features/environment-map/utils/environmentMapUploadUtils'
import {
  getEnvironmentMapCustomThumbnailUrl,
  getEnvironmentMapSizeLabels,
} from '@/features/environment-map/utils/environmentMapUtils'
import { uploadFile } from '@/features/models/api/modelApi'
import { useModelTagsQuery } from '@/features/models/api/queries'
import { useTabContext } from '@/hooks/useTabContext'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { type CategorySelectionKeys } from '@/shared/types/categories'
import { collectCategoryBranchIds } from '@/shared/utils/categoryTree'
import { useCardWidthStore } from '@/stores/cardWidthStore'

export function EnvironmentMapList() {
  const toast = useRef<Toast>(null)
  const contextMenuRef = useRef<EnvironmentMapContextMenuHandle>(null)
  const selectionSurfaceRef = useRef<HTMLDivElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [selectedPreviewSizes, setSelectedPreviewSizes] = useState<string[]>([])
  const [selectedPackIds, setSelectedPackIds] = useState<number[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([])
  const [selectedCategoryKeys, setSelectedCategoryKeys] =
    useState<CategorySelectionKeys>({})
  const [onlyCustomThumbnail, setOnlyCustomThumbnail] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [selectedEnvironmentMapIds, setSelectedEnvironmentMapIds] = useState<
    Set<string>
  >(new Set())
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const { openEnvironmentMapDetailsTab } = useTabContext()
  const { settings, setCardWidth } = useCardWidthStore()
  const uploadProgress = useUploadProgress()
  const cardWidth = settings.environmentMaps

  const environmentMapsQuery = useEnvironmentMapsQuery({
    params: { page: 1, pageSize: 200 },
  })
  const environmentMaps = environmentMapsQuery.data?.environmentMaps ?? []
  const totalCount =
    environmentMapsQuery.data?.totalCount ?? environmentMaps.length
  const categoriesQuery = useEnvironmentMapCategoriesQuery()
  const tagsQuery = useModelTagsQuery()

  const createEnvironmentMapMutation = useCreateEnvironmentMapWithFileMutation()
  const setThumbnailMutation = useSetEnvironmentMapCustomThumbnailMutation()

  const previewSizeOptions = useMemo(
    () =>
      [
        ...new Set(
          environmentMaps.flatMap(environmentMap =>
            getEnvironmentMapSizeLabels(environmentMap)
          )
        ),
      ]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
        .map(value => ({ label: value, value })),
    [environmentMaps]
  )

  const packOptions = useMemo(
    () =>
      [
        ...new Map(
          environmentMaps
            .flatMap(environmentMap => environmentMap.packs ?? [])
            .map(pack => [pack.id, pack] as const)
        ).values(),
      ]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(pack => ({ label: pack.name, value: pack.id })),
    [environmentMaps]
  )

  const projectOptions = useMemo(
    () =>
      [
        ...new Map(
          environmentMaps
            .flatMap(environmentMap => environmentMap.projects ?? [])
            .map(project => [project.id, project] as const)
        ).values(),
      ]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(project => ({ label: project.name, value: project.id })),
    [environmentMaps]
  )

  const selectedCategoryIds = useMemo(() => {
    const categories = categoriesQuery.data ?? []
    const checkedIds = Object.entries(selectedCategoryKeys)
      .filter(([, state]) => state?.checked)
      .map(([key]) => Number(key))
      .filter(Number.isFinite)

    return new Set(
      checkedIds.flatMap(categoryId => [
        ...collectCategoryBranchIds(categories, categoryId),
      ])
    )
  }, [categoriesQuery.data, selectedCategoryKeys])

  const filteredEnvironmentMaps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return environmentMaps.filter(environmentMap => {
      const nameMatches =
        !query || environmentMap.name.toLowerCase().includes(query)
      const previewSizeMatches =
        selectedPreviewSizes.length === 0 ||
        getEnvironmentMapSizeLabels(environmentMap).some(sizeLabel =>
          selectedPreviewSizes.includes(sizeLabel)
        )
      const packMatches =
        selectedPackIds.length === 0 ||
        (environmentMap.packs ?? []).some(pack =>
          selectedPackIds.includes(pack.id)
        )
      const projectMatches =
        selectedProjectIds.length === 0 ||
        (environmentMap.projects ?? []).some(project =>
          selectedProjectIds.includes(project.id)
        )
      const categoryMatches =
        selectedCategoryIds.size === 0 ||
        (environmentMap.categoryId != null &&
          selectedCategoryIds.has(environmentMap.categoryId))
      const thumbnailMatches =
        !onlyCustomThumbnail ||
        Boolean(getEnvironmentMapCustomThumbnailUrl(environmentMap))

      return (
        nameMatches &&
        previewSizeMatches &&
        packMatches &&
        projectMatches &&
        categoryMatches &&
        thumbnailMatches
      )
    })
  }, [
    environmentMaps,
    onlyCustomThumbnail,
    searchQuery,
    selectedCategoryIds,
    selectedPackIds,
    selectedPreviewSizes,
    selectedProjectIds,
  ])

  const selectedEnvironmentMaps = useMemo(
    () =>
      filteredEnvironmentMaps.filter(environmentMap =>
        selectedEnvironmentMapIds.has(String(environmentMap.id))
      ),
    [filteredEnvironmentMaps, selectedEnvironmentMapIds]
  )

  useEffect(() => {
    const visibleIds = new Set(
      filteredEnvironmentMaps.map(environmentMap => String(environmentMap.id))
    )

    setSelectedEnvironmentMapIds(previous => {
      const next = new Set(
        [...previous].filter(environmentMapId =>
          visibleIds.has(environmentMapId)
        )
      )

      return next.size === previous.size ? previous : next
    })
  }, [filteredEnvironmentMaps])

  const uploadItems = async (items: EnvironmentMapUploadItem[]) => {
    if (items.length === 0) {
      return
    }

    const batchId = uploadProgress.createBatch()
    let createdCount = 0

    for (const item of items) {
      const representativeFile =
        item.file ??
        item.cubeFaces?.px ??
        item.cubeFaces?.nx ??
        item.cubeFaces?.py ??
        item.cubeFaces?.ny ??
        item.cubeFaces?.pz ??
        item.cubeFaces?.nz

      if (!representativeFile) {
        continue
      }

      const uploadId = uploadProgress.addUpload(
        representativeFile,
        'environmentMap',
        batchId
      )

      try {
        uploadProgress.updateUploadProgress(uploadId, 25)

        const isCube = item.kind === 'cube' && item.cubeFaces
        const result = await createEnvironmentMapMutation.mutateAsync({
          file: item.file,
          cubeFaces: item.cubeFaces,
          options: {
            name: item.name,
            sizeLabel: item.sizeLabel,
            batchId,
            sourceType: isCube ? 'cube' : 'single',
            projectionType: isCube ? 'cube' : 'equirectangular',
          },
        })

        if (item.thumbnailFile) {
          uploadProgress.updateUploadProgress(uploadId, 70)

          const thumbnailUpload = await uploadFile(item.thumbnailFile, {
            uploadType: 'file',
          })
          await setThumbnailMutation.mutateAsync({
            environmentMapId: result.environmentMapId,
            fileId: thumbnailUpload.fileId,
          })
        }

        uploadProgress.updateUploadProgress(uploadId, 100)
        uploadProgress.completeUpload(uploadId, result)
        createdCount += 1
      } catch (error) {
        uploadProgress.failUpload(uploadId, error as Error)
        console.error('Failed to upload environment map:', error)
      }
    }

    if (createdCount > 0) {
      toast.current?.show({
        severity: 'success',
        summary: 'Upload complete',
        detail: `${createdCount} environment map${createdCount === 1 ? '' : 's'} uploaded`,
        life: 3000,
      })
    } else {
      toast.current?.show({
        severity: 'error',
        summary: 'Upload failed',
        detail: 'No environment maps were uploaded.',
        life: 4000,
      })
    }
  }

  const handleDropUpload = (files: File[]) => {
    void uploadItems(prepareEnvironmentMapUploadItems(files))
  }

  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleDropUpload)
  const pageDragAndDropHandlers = showUploadDialog
    ? {}
    : {
        onDrop,
        onDragOver,
        onDragEnter,
        onDragLeave,
      }

  const handleDialogSubmit = async (
    values: EnvironmentMapUploadDialogSubmitValues
  ) => {
    if (values.cubeFaces) {
      await uploadItems([
        {
          kind: 'cube',
          name: values.name || 'Environment Map',
          sizeLabel: values.sizeLabel,
          cubeFaces: values.cubeFaces,
          thumbnailFile: values.thumbnailFile,
        },
      ])
      return
    }

    if (values.file) {
      await uploadItems([
        {
          kind: 'single',
          name: values.name || values.file.name.replace(/\.[^/.]+$/, ''),
          sizeLabel: values.sizeLabel,
          file: values.file,
          thumbnailFile: values.thumbnailFile,
        },
      ])
    }
  }

  const toggleSelection = useCallback(
    (environmentMapId: string, event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      setSelectedEnvironmentMapIds(previous => {
        const next = new Set(previous)
        if (next.has(environmentMapId)) {
          next.delete(environmentMapId)
        } else {
          next.add(environmentMapId)
        }

        return next
      })
    },
    []
  )

  const handleGridMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionSurfaceRef.current || !listScrollRef.current) {
        return
      }

      const target = event.target as HTMLElement
      if (target.closest('.environment-map-card')) {
        return
      }

      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      const scrollContainer = listScrollRef.current

      setIsAreaSelecting(true)
      setSelectionBox({
        startX: event.clientX - rect.left + scrollContainer.scrollLeft,
        startY: event.clientY - rect.top + scrollContainer.scrollTop,
        currentX: event.clientX - rect.left + scrollContainer.scrollLeft,
        currentY: event.clientY - rect.top + scrollContainer.scrollTop,
      })
    },
    []
  )

  const handleGridMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        !isAreaSelecting ||
        !selectionBox ||
        !selectionSurfaceRef.current ||
        !listScrollRef.current
      ) {
        return
      }

      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      const scrollContainer = listScrollRef.current

      setSelectionBox(previous =>
        previous
          ? {
              ...previous,
              currentX: event.clientX - rect.left + scrollContainer.scrollLeft,
              currentY: event.clientY - rect.top + scrollContainer.scrollTop,
            }
          : null
      )
    },
    [isAreaSelecting, selectionBox]
  )

  const handleGridMouseUp = useCallback(() => {
    if (
      isAreaSelecting &&
      selectionBox &&
      selectionSurfaceRef.current &&
      listScrollRef.current
    ) {
      const rect = selectionSurfaceRef.current.getBoundingClientRect()
      const scrollContainer = listScrollRef.current
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
        '.environment-map-card[data-environment-map-id]'
      )
      const nextSelected = new Set<string>()

      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const cardLeft = cardRect.left - rect.left + scrollContainer.scrollLeft
        const cardTop = cardRect.top - rect.top + scrollContainer.scrollTop
        const cardRight = cardLeft + cardRect.width
        const cardBottom = cardTop + cardRect.height

        if (
          cardRight >= selectionLeft &&
          cardLeft <= selectionRight &&
          cardBottom >= selectionTop &&
          cardTop <= selectionBottom
        ) {
          const environmentMapId = card.getAttribute('data-environment-map-id')
          if (environmentMapId) {
            nextSelected.add(environmentMapId)
          }
        }
      })

      if (nextSelected.size > 0) {
        setSelectedEnvironmentMapIds(nextSelected)
      }
    }

    setIsAreaSelecting(false)
    setSelectionBox(null)
  }, [isAreaSelecting, selectionBox])

  const handleSelectAll = useCallback(() => {
    setSelectedEnvironmentMapIds(
      new Set(
        filteredEnvironmentMaps.map(environmentMap => String(environmentMap.id))
      )
    )
  }, [filteredEnvironmentMaps])

  const handleDeselectAll = useCallback(() => {
    setSelectedEnvironmentMapIds(new Set())
  }, [])

  const handleBulkActionsClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (selectedEnvironmentMaps.length === 0) {
        return
      }

      contextMenuRef.current?.show(event, {
        environmentMaps: selectedEnvironmentMaps,
        mode: 'bulk',
      })
    },
    [selectedEnvironmentMaps]
  )

  const handleCardContextMenu = useCallback(
    (event: React.MouseEvent, environmentMap: EnvironmentMapDto) => {
      const isSelected = selectedEnvironmentMapIds.has(
        String(environmentMap.id)
      )

      if (selectedEnvironmentMaps.length > 1 && isSelected) {
        contextMenuRef.current?.show(event, {
          environmentMaps: selectedEnvironmentMaps,
          mode: 'bulk',
        })
        return
      }

      contextMenuRef.current?.show(event, {
        environmentMaps: [environmentMap],
        mode: 'single',
      })
    },
    [selectedEnvironmentMaps, selectedEnvironmentMapIds]
  )

  return (
    <div
      ref={listScrollRef}
      className="environment-map-list"
      {...pageDragAndDropHandlers}
    >
      <Toast ref={toast} />
      <EnvironmentMapContextMenu
        ref={contextMenuRef}
        categories={categoriesQuery.data ?? []}
        tags={tagsQuery.data ?? []}
        onManageCategories={() => setShowCategoryManager(true)}
      />

      <EnvironmentMapUploadDialog
        visible={showUploadDialog}
        title="Upload Environment Map"
        submitLabel="Upload"
        loading={
          createEnvironmentMapMutation.isPending ||
          setThumbnailMutation.isPending
        }
        showThumbnailField
        onHide={() => setShowUploadDialog(false)}
        onSubmit={handleDialogSubmit}
      />

      <EnvironmentMapCategoryManagerDialog
        visible={showCategoryManager}
        categories={categoriesQuery.data ?? []}
        onHide={() => setShowCategoryManager(false)}
      />

      <EnvironmentMapToolbar
        isSearchOpen={isSearchOpen}
        onSearchToggle={setIsSearchOpen}
        isFiltersOpen={isFiltersOpen}
        onFiltersToggle={setIsFiltersOpen}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        previewSizeOptions={previewSizeOptions}
        packOptions={packOptions}
        projectOptions={projectOptions}
        categories={categoriesQuery.data ?? []}
        selectedPreviewSizes={selectedPreviewSizes}
        selectedPackIds={selectedPackIds}
        selectedProjectIds={selectedProjectIds}
        selectedCategoryKeys={selectedCategoryKeys}
        onlyCustomThumbnail={onlyCustomThumbnail}
        onPreviewSizesChange={values => setSelectedPreviewSizes(values)}
        onPackIdsChange={values => setSelectedPackIds(values)}
        onProjectIdsChange={values => setSelectedProjectIds(values)}
        onCategoryChange={setSelectedCategoryKeys}
        onManageCategoriesClick={() => setShowCategoryManager(true)}
        onOnlyCustomThumbnailChange={setOnlyCustomThumbnail}
        cardWidth={cardWidth}
        onCardWidthChange={width => setCardWidth('environmentMaps', width)}
        totalCount={totalCount}
        visibleCount={filteredEnvironmentMaps.length}
        selectedCount={selectedEnvironmentMaps.length}
        onUploadClick={() => setShowUploadDialog(true)}
        onRefreshClick={() => void environmentMapsQuery.refetch()}
        onBulkActionsClick={handleBulkActionsClick}
        onSelectAllClick={handleSelectAll}
        onDeselectAllClick={handleDeselectAll}
      />

      {environmentMapsQuery.isLoading ? (
        <div className="environment-map-list-loading">
          <i className="pi pi-spin pi-spinner" />
          <p>Loading environment maps...</p>
        </div>
      ) : filteredEnvironmentMaps.length === 0 ? (
        <div className="environment-map-list-empty">
          <i className="pi pi-globe" />
          <h3>No Environment Maps</h3>
          <p>
            {environmentMaps.length > 0
              ? 'Try adjusting your search or filters.'
              : 'Drag and drop files here or upload a panorama or cube map to get started.'}
          </p>
        </div>
      ) : (
        <EnvironmentMapGrid
          environmentMaps={filteredEnvironmentMaps}
          cardWidth={cardWidth}
          selectedIds={selectedEnvironmentMapIds}
          isAreaSelecting={isAreaSelecting}
          selectionBox={selectionBox}
          selectionSurfaceRef={selectionSurfaceRef}
          onCardClick={openEnvironmentMapDetailsTab}
          onCardContextMenu={handleCardContextMenu}
          onToggleSelection={toggleSelection}
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
        />
      )}
    </div>
  )
}
