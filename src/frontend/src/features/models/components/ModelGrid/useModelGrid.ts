import { useRef, useCallback } from 'react'
import { PackDto, ProjectDto } from '@/types'
import { useThumbnailSignalR } from '@/shared/thumbnail/hooks/useThumbnailSignalR'
import { Toast } from 'primereact/toast'
import { useModelData } from './useModelData'
import { useModelFilters } from './useModelFilters'
import { useModelUpload } from './useModelUpload'

interface UseModelGridOptions {
  projectId?: number
  packId?: number
  textureSetId?: number
}

export function useModelGrid({
  projectId,
  packId,
  textureSetId,
}: UseModelGridOptions) {
  const toast = useRef<Toast>(null)

  // Filters (search, pack/project selection, card width)
  const filters = useModelFilters({ packId, projectId })

  // Data fetching (models, packs, projects, pagination)
  const data = useModelData({
    effectivePackIds: filters.effectivePackIds,
    effectiveProjectIds: filters.effectiveProjectIds,
    textureSetId,
  })

  // Upload with auto-association to pack/project
  const upload = useModelUpload({
    packId,
    projectId,
    toast,
    onUploadComplete: () => data.fetchModels(),
  })

  // SignalR thumbnail updates (param unused but reserved)
  const modelIds = data.models.map(m => Number(m.id))
  useThumbnailSignalR(modelIds)

  // Client-side search filter
  const filteredModels = filters.filterModels(data.models)

  // Build path prefix for context menu's "Copy Folder Path"
  const buildPathPrefix = useCallback((): string | undefined => {
    if (projectId) {
      const project = data.projects.find((p: ProjectDto) => p.id === projectId)
      return `Projects/${project?.name ?? 'Project'}/Models`
    }
    if (packId) {
      const pack = data.packs.find((p: PackDto) => p.id === packId)
      return `Packs/${pack?.name ?? 'Pack'}/Models`
    }
    return undefined
  }, [projectId, packId, data.projects, data.packs])

  const handleRefresh = useCallback(async () => {
    await data.fetchModels()
    toast.current?.show({
      severity: 'success',
      summary: 'Refreshed',
      detail: 'Models list has been refreshed',
      life: 2000,
    })
  }, [data])

  return {
    // Data
    models: data.models,
    filteredModels,
    loading: data.loading,
    error: data.error,
    packs: data.packs,
    projects: data.projects,
    pagination: data.pagination,
    isLoadingMore: data.isLoadingMore,

    // Upload
    uploading: upload.uploading,
    uploadProgress: upload.uploadProgress,
    uploadMultipleFiles: upload.uploadMultipleFiles,

    // Drag and drop
    onDrop: upload.onDrop,
    onDragOver: upload.onDragOver,
    onDragEnter: upload.onDragEnter,
    onDragLeave: upload.onDragLeave,

    // Search & Filters
    searchQuery: filters.searchQuery,
    setSearchQuery: filters.setSearchQuery,
    effectivePackIds: filters.effectivePackIds,
    effectiveProjectIds: filters.effectiveProjectIds,
    handlePackFilterChange: filters.handlePackFilterChange,
    handleProjectFilterChange: filters.handleProjectFilterChange,
    packFilterDisabled: filters.packFilterDisabled,
    projectFilterDisabled: filters.projectFilterDisabled,

    // Card width
    cardWidth: filters.cardWidth,
    handleCardWidthChange: filters.handleCardWidthChange,

    // Actions
    fetchModels: data.fetchModels,
    handleRefresh,
    handleModelRecycled: data.removeModel,
    getModelName: filters.getModelName,
    buildPathPrefix,

    // Refs
    toast,
  }
}
