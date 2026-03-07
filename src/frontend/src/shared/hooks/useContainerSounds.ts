import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import {
  createSoundWithFile,
  getAllSounds,
  getSoundsPaginated,
} from '@/features/sounds/api/soundApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { type SoundDto } from '@/types'
import { filterAudioFiles, processAudioFile } from '@/utils/audioUtils'

const PAGE_SIZE = 20

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

export function useContainerSounds(
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
  const [selectedItem, setSelectedItem] = useState<SoundDto | null>(null)
  const [showModal, setShowModal] = useState(false)

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['container-sounds', adapter.type, adapter.containerId],
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
      return getSoundsPaginated(filterOptions)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.sounds.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const sounds = paginatedData?.pages.flatMap(p => p.sounds) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0

  const { data: allSoundsData } = useQuery({
    queryKey: ['all-sounds-for-container', adapter.containerId],
    queryFn: () => getAllSounds(),
    enabled: showAddDialog,
  })

  const availableSounds = (
    (allSoundsData as { sounds?: SoundDto[] })?.sounds ?? []
  ).filter(s => !sounds.some(existing => existing.id === s.id))

  const filteredAvailable = availableSounds.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['container-sounds', adapter.type, adapter.containerId],
      }),
      refetchContainer(),
    ])
  }, [queryClient, adapter.type, adapter.containerId, refetchContainer])

  const removeMutation = useMutation({
    mutationFn: (soundId: number) =>
      adapter.removeSound(adapter.containerId, soundId),
    onSuccess: () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `Sound removed from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
      invalidateAll()
    },
    onError: () => {
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove sound from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const addMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map(id => adapter.addSound(adapter.containerId, id))),
    onSuccess: (_data, ids) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `${ids.length} sound(s) added to ${adapter.label.toLowerCase()}`,
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
        detail: `Failed to add sounds to ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const audioFiles = filterAudioFiles(files)
      if (audioFiles.length === 0) {
        showToast({
          severity: 'warn',
          summary: 'Invalid Files',
          detail: 'Please drop audio files only',
          life: 3000,
        })
        return
      }
      try {
        setUploading(true)
        let newCount = 0
        const batchId = uploadProgressContext?.createBatch()

        const uploadPromises = audioFiles.map(async file => {
          let uploadId: string | null = null
          try {
            uploadId =
              uploadProgressContext?.addUpload(file, 'file', batchId) || null
            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 20)

            const { duration, peaks } = await processAudioFile(file)
            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 40)

            const soundName = file.name.replace(/\.[^/.]+$/, '')
            const response = await createSoundWithFile(file, {
              name: soundName,
              duration,
              peaks,
            })
            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 70)

            await adapter.addSound(adapter.containerId, response.soundId)

            if (uploadId && uploadProgressContext) {
              uploadProgressContext.updateUploadProgress(uploadId, 100)
              uploadProgressContext.completeUpload(uploadId, response)
            }
            newCount++
            return response.soundId
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
          detail: `${newCount} sound(s) uploaded and added to ${adapter.label.toLowerCase()}`,
          life: 3000,
        })
        invalidateAll()
      } catch (error) {
        console.error('Failed to upload sounds:', error)
        showToast({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to upload sounds',
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

  const openModal = useCallback((sound: SoundDto) => {
    setSelectedItem(sound)
    setShowModal(true)
  }, [])

  return {
    sounds,
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
    handleUpload,
    openModal,
  }
}
