import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import {
  createEnvironmentMapWithFile,
  getAllEnvironmentMaps,
  getEnvironmentMapsPaginated,
} from '@/features/environment-map/api/environmentMapApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { type EnvironmentMapDto } from '@/types'

const PAGE_SIZE = 20

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

export function useContainerEnvironmentMaps(
  adapter: ContainerAdapter,
  showToast: ShowToast,
  refetchContainer: () => Promise<void>
) {
  const queryClient = useQueryClient()
  const uploadProgress = useUploadProgress()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<EnvironmentMapDto | null>(
    null
  )

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['container-environmentMaps', adapter.type, adapter.containerId],
    queryFn: ({ pageParam }) => {
      const params: {
        page: number
        pageSize: number
        packId?: number
        projectId?: number
      } = { page: pageParam, pageSize: PAGE_SIZE }

      if (adapter.type === 'pack') params.packId = adapter.containerId
      if (adapter.type === 'project') params.projectId = adapter.containerId

      return getEnvironmentMapsPaginated(params)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (sum, page) => sum + page.environmentMaps.length,
        0
      )
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const environmentMaps =
    paginatedData?.pages.flatMap(page => page.environmentMaps) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0

  const { data: allEnvironmentMaps = [] } = useQuery({
    queryKey: [
      'all-environmentMaps-for-container',
      adapter.type,
      adapter.containerId,
    ],
    queryFn: () => getAllEnvironmentMaps(),
    enabled: showAddDialog,
  })

  const filteredAvailable = allEnvironmentMaps
    .filter(
      environmentMap =>
        !environmentMaps.some(existing => existing.id === environmentMap.id)
    )
    .filter(environmentMap =>
      environmentMap.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          'container-environmentMaps',
          adapter.type,
          adapter.containerId,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          'all-environmentMaps-for-container',
          adapter.type,
          adapter.containerId,
        ],
      }),
      queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
      refetchContainer(),
    ])
  }, [adapter.containerId, adapter.type, queryClient, refetchContainer])

  const removeMutation = useMutation({
    mutationFn: (environmentMapId: number) =>
      adapter.removeEnvironmentMap(adapter.containerId, environmentMapId),
    onSuccess: async () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `Environment map removed from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
      await invalidateAll()
    },
    onError: () => {
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove environment map from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const addMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await adapter.addEnvironmentMap(adapter.containerId, id)
      }
    },
    onSuccess: async (_data, ids) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `${ids.length} environment map${ids.length === 1 ? '' : 's'} added to ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
      setShowAddDialog(false)
      setSelectedIds([])
      await invalidateAll()
    },
    onError: () => {
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to add environment maps to ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      try {
        setUploading(true)
        const batchId = uploadProgress.createBatch()
        let uploadedCount = 0

        for (const file of files) {
          const uploadId = uploadProgress.addUpload(
            file,
            'environmentMap',
            batchId
          )

          try {
            uploadProgress.updateUploadProgress(uploadId, 35)
            const response = await createEnvironmentMapWithFile(file, {
              name: file.name.replace(/\.[^/.]+$/, ''),
              sizeLabel: '1K',
              batchId,
              ...(adapter.type === 'pack'
                ? { packId: adapter.containerId }
                : { projectId: adapter.containerId }),
            })
            uploadProgress.updateUploadProgress(uploadId, 70)

            uploadProgress.updateUploadProgress(uploadId, 100)
            uploadProgress.completeUpload(uploadId, response)
            uploadedCount += 1
          } catch (error) {
            uploadProgress.failUpload(uploadId, error as Error)
            throw error
          }
        }

        showToast({
          severity: 'success',
          summary: 'Success',
          detail: `${uploadedCount} environment map${uploadedCount === 1 ? '' : 's'} uploaded and added to ${adapter.label.toLowerCase()}`,
          life: 3000,
        })
        await invalidateAll()
      } catch (error) {
        console.error('Failed to upload environment maps:', error)
        showToast({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to upload environment maps',
          life: 3000,
        })
      } finally {
        setUploading(false)
      }
    },
    [adapter, invalidateAll, showToast, uploadProgress]
  )

  const openAddDialog = useCallback(() => {
    setSearchQuery('')
    setSelectedIds([])
    setShowAddDialog(true)
  }, [])

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(existingId => existingId !== id)
        : [...prev, id]
    )
  }, [])

  return {
    environmentMaps,
    totalCount,
    hasMore: hasNextPage ?? false,
    isFetchingMore: isFetchingNextPage,
    fetchNextPage,
    uploading,
    selectedItem,
    setSelectedItem,
    removeMutation,
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
