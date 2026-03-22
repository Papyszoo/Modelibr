import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import {
  createSpriteWithFile,
  getAllSprites,
  getSpritesPaginated,
} from '@/features/sprite/api/spriteApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { type SpriteDto } from '@/types'

const PAGE_SIZE = 20

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

export function useContainerSprites(
  adapter: ContainerAdapter,
  showToast: ShowToast,
  refetchContainer: () => Promise<void>
) {
  const queryClient = useQueryClient()
  const uploadProgressContext = useUploadProgress()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [uploading, setUploading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SpriteDto | null>(null)
  const [showModal, setShowModal] = useState(false)

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['container-sprites', adapter.type, adapter.containerId],
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
      return getSpritesPaginated(filterOptions)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.sprites.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const sprites = paginatedData?.pages.flatMap(p => p.sprites) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0

  const { data: allSpritesData } = useQuery({
    queryKey: ['all-sprites-for-container', adapter.containerId],
    queryFn: () => getAllSprites(),
    enabled: showAddDialog,
  })

  const availableSprites = (
    (allSpritesData as { sprites?: SpriteDto[] })?.sprites ?? []
  ).filter(s => !sprites.some(existing => existing.id === s.id))

  const filteredAvailable = availableSprites.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['container-sprites', adapter.type, adapter.containerId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['all-sprites-for-container', adapter.containerId],
      }),
      refetchContainer(),
    ])
  }, [queryClient, adapter.type, adapter.containerId, refetchContainer])

  const removeMutation = useMutation({
    mutationFn: (spriteId: number) =>
      adapter.removeSprite(adapter.containerId, spriteId),
    onSuccess: () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `Sprite removed from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
      invalidateAll()
    },
    onError: () => {
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove sprite from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const addMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await adapter.addSprite(adapter.containerId, id)
      }
    },
    onSuccess: (_data, ids) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `${ids.length} sprite(s) added to ${adapter.label.toLowerCase()}`,
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
        detail: `Failed to add sprites to ${adapter.label.toLowerCase()}`,
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
              uploadProgressContext?.addUpload(file, 'sprite', batchId) || null
            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 30)

            const spriteName = file.name.replace(/\.[^/.]+$/, '')
            const spriteOptions = adapter.createSpriteOptions(
              adapter.containerId
            )
            const response = await createSpriteWithFile(file, {
              name: spriteName,
              batchId,
              ...spriteOptions,
            })

            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 70)
            await adapter.addSprite(adapter.containerId, response.spriteId)

            if (uploadId && uploadProgressContext) {
              uploadProgressContext.updateUploadProgress(uploadId, 100)
              uploadProgressContext.completeUpload(uploadId, response)
            }
            newCount++
            return response.spriteId
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
          detail: `${newCount} sprite(s) uploaded and added to ${adapter.label.toLowerCase()}`,
          life: 3000,
        })
        invalidateAll()
      } catch (error) {
        console.error('Failed to upload sprites:', error)
        showToast({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to upload sprites',
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

  const openModal = useCallback((sprite: SpriteDto) => {
    setSelectedItem(sprite)
    setShowModal(true)
  }, [])

  return {
    sprites,
    totalCount,
    hasMore: hasNextPage ?? false,
    isFetchingMore: isFetchingNextPage,
    fetchNextPage,
    uploading,
    selectedItem,
    setSelectedItem,
    showModal,
    setShowModal,
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
    openModal,
  }
}
