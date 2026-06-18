import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import {
  createScriptWithFile,
  getAllScripts,
  getScriptsPaginated,
} from '@/features/scripts/api/scriptApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { type ContainerAdapter } from '@/shared/types/ContainerTypes'
import { type ScriptDto } from '@/types'

const PAGE_SIZE = 20

// Recognized source-code extensions, mirroring the backend FileType mapping.
const SCRIPT_EXTENSION_RE =
  /\.(js|jsx|mjs|cjs|ts|tsx|py|cs|cpp|cc|cxx|c|h|hpp|lua|java|go|rs|rb|php|sh|sql|json|yaml|yml|xml|glsl|vert|frag|hlsl|shader|gd)$/i

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

export function useContainerScripts(
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
  const [selectedItem, setSelectedItem] = useState<ScriptDto | null>(null)
  const [showModal, setShowModal] = useState(false)

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['container-scripts', adapter.type, adapter.containerId],
    queryFn: ({ pageParam }) => {
      const filterOptions: {
        page: number
        pageSize: number
        packIds?: number[]
        projectIds?: number[]
      } = { page: pageParam, pageSize: PAGE_SIZE }
      if (adapter.type === 'pack') filterOptions.packIds = [adapter.containerId]
      if (adapter.type === 'project')
        filterOptions.projectIds = [adapter.containerId]
      return getScriptsPaginated(filterOptions)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.scripts.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const scripts = paginatedData?.pages.flatMap(p => p.scripts) ?? []
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0

  const { data: allScriptsData } = useQuery({
    queryKey: ['all-scripts-for-container', adapter.containerId],
    queryFn: () => getAllScripts(),
    enabled: showAddDialog,
  })

  const availableScripts = (
    (allScriptsData as { scripts?: ScriptDto[] })?.scripts ?? []
  ).filter(s => !scripts.some(existing => existing.id === s.id))

  const filteredAvailable = availableScripts.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['container-scripts', adapter.type, adapter.containerId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['all-scripts-for-container', adapter.containerId],
      }),
      refetchContainer(),
    ])
  }, [queryClient, adapter.type, adapter.containerId, refetchContainer])

  const removeMutation = useMutation({
    mutationFn: (scriptId: number) =>
      adapter.removeScript(adapter.containerId, scriptId),
    onSuccess: () => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `Script removed from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
      invalidateAll()
    },
    onError: () => {
      showToast({
        severity: 'error',
        summary: 'Error',
        detail: `Failed to remove script from ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const addMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await adapter.addScript(adapter.containerId, id)
      }
    },
    onSuccess: (_data, ids) => {
      showToast({
        severity: 'success',
        summary: 'Success',
        detail: `${ids.length} script(s) added to ${adapter.label.toLowerCase()}`,
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
        detail: `Failed to add scripts to ${adapter.label.toLowerCase()}`,
        life: 3000,
      })
    },
  })

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      const scriptFiles = files.filter(f => SCRIPT_EXTENSION_RE.test(f.name))
      if (scriptFiles.length === 0) {
        showToast({
          severity: 'warn',
          summary: 'Invalid Files',
          detail: 'Please drop source-code files only',
          life: 3000,
        })
        return
      }
      try {
        setUploading(true)
        let newCount = 0
        const batchId = uploadProgressContext?.createBatch()

        const uploadPromises = scriptFiles.map(async file => {
          let uploadId: string | null = null
          try {
            uploadId =
              uploadProgressContext?.addUpload(file, 'script', batchId) || null
            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 40)

            const scriptName = file.name.replace(/\.[^/.]+$/, '')
            const response = await createScriptWithFile(file, {
              name: scriptName,
            })
            if (uploadId && uploadProgressContext)
              uploadProgressContext.updateUploadProgress(uploadId, 70)

            await adapter.addScript(adapter.containerId, response.scriptId)

            if (uploadId && uploadProgressContext) {
              uploadProgressContext.updateUploadProgress(uploadId, 100)
              uploadProgressContext.completeUpload(uploadId, response)
            }
            newCount++
            return response.scriptId
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
          detail: `${newCount} script(s) uploaded and added to ${adapter.label.toLowerCase()}`,
          life: 3000,
        })
        invalidateAll()
      } catch (error) {
        console.error('Failed to upload scripts:', error)
        showToast({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to upload scripts',
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

  const openModal = useCallback((script: ScriptDto) => {
    setSelectedItem(script)
    setShowModal(true)
  }, [])

  return {
    scripts,
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
