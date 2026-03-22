import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import {
  getAllTextureSets,
  getTextureSetsPaginated,
} from '@/features/texture-set/api/textureSetApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { type TextureSetDto } from '@/types'

const PAGE_SIZE = 20

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

export function useContainerTextureSets(
  adapter: ContainerAdapter,
  showToast: ShowToast,
  refetchContainer: () => Promise<void>
) {
  const queryClient = useQueryClient()
  const uploadProgressContext = useUploadProgress()

  // Dialog state
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<TextureSetDto | null>(null)

  // Paginated texture sets for this container
  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['container-textureSets', adapter.type, adapter.containerId],
    queryFn: ({ pageParam }) => {
      const filterOptions: {
        page: number
        pageSize: number
        packId?: number
        projectId?: number
      } = { page: pageParam, pageSize: PAGE_SIZE }
      if (adapter.type === 'pack') filterOptions.packId = adapter.containerId
      if (adapter.type === 'project')
        filterOptions.projectId = adapter.containerId
      return getTextureSetsPaginated(filterOptions)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.textureSets.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const textureSets = paginatedData?.pages.flatMap(p => p.textureSets) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0

  // All available texture sets (for add dialog)
  const { data: allTextureSetsData } = useQuery({
    queryKey: ['all-textureSets-for-container', adapter.containerId],
    queryFn: () => getAllTextureSets(),
    enabled: showAddDialog,
  })

  const availableTextureSets = (allTextureSetsData ?? []).filter(
    ts => !textureSets.some(existing => existing.id === ts.id)
  )

  const filteredAvailable = availableTextureSets.filter(ts =>
    ts.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['container-textureSets', adapter.type, adapter.containerId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['all-textureSets-for-container', adapter.containerId],
      }),
      refetchContainer(),
    ])
  }, [queryClient, adapter.type, adapter.containerId, refetchContainer])

  // Mutations
  const removeMutation = useMutation({
    mutationFn: (textureSetId: number) =>
      adapter.removeTextureSet(adapter.containerId, textureSetId),
    onSuccess: () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `Texture set removed from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
      invalidateAll()
    },
    onError: () => {
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove texture set from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const addMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(
        ids.map(id => adapter.addTextureSet(adapter.containerId, id))
      ),
    onSuccess: (_data, ids) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `${ids.length} texture set(s) added to ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
      setShowAddDialog(false)
      setSelectedIds([])
      invalidateAll()
    },
    onError: () => {
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to add texture sets to ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      try {
        setUploading(true)
        let newCount = 0
        const batchId = uploadProgressContext?.createBatch()

        const uploadPromises = files.map(async file => {
          let uploadId: string | null = null
          try {
            uploadId =
              uploadProgressContext?.addUpload(file, 'texture', batchId) || null
            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 30)

            const setName = file.name.replace(/\.[^/.]+$/, '')
            const response = await adapter.uploadTextureWithFile(
              adapter.containerId,
              file,
              setName,
              1,
              batchId
            )

            if (uploadId && uploadProgressContext) {
              uploadProgressContext.updateUploadProgress(uploadId, 100)
              uploadProgressContext.completeUpload(uploadId, response)
            }
            newCount++
            return response.textureSetId
          } catch (error) {
            if (uploadId && uploadProgressContext)
              uploadProgressContext.failUpload(uploadId, error as Error)
            throw error
          }
        })

        await Promise.all(uploadPromises)
        showToast({
          severity: 'success',
          summary: 'Success',
          detail: `${newCount} texture(s) uploaded and added to ${adapter.label.toLowerCase()}`,
          life: 3000,
        })
        invalidateAll()
      } catch (error) {
        console.error('Failed to upload textures:', error)
        showToast({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to upload textures',
          life: 3000,
        })
      } finally {
        setUploading(false)
      }
    },
    [adapter, uploadProgressContext, showToast, invalidateAll]
  )

  const openAddDialog = useCallback(() => {
    setSearchQuery('')
    setSelectedIds([])
    setShowAddDialog(true)
  }, [])

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }, [])

  return {
    textureSets,
    totalCount,
    hasMore: hasNextPage ?? false,
    isFetchingMore: isFetchingNextPage,
    fetchNextPage,
    uploading,
    selectedItem,
    setSelectedItem,
    removeMutation,
    // Add dialog
    showAddDialog,
    setShowAddDialog,
    searchQuery,
    setSearchQuery,
    selectedIds,
    setSelectedIds,
    filteredAvailable,
    addMutation,
    openAddDialog,
    toggleSelection,
    handleUpload,
  }
}
