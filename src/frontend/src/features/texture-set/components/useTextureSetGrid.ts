import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { type Toast } from 'primereact/toast'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usePacksQuery } from '@/features/pack/api/queries'
import {
  createTextureSet,
  createTextureSetWithFile,
  getAllTextureSetCategories,
  getTextureSetsPaginated,
} from '@/features/texture-set/api/textureSetApi'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { useDebouncedValue } from '@/shared/hooks'
import { useDragAndDrop } from '@/shared/hooks/useFileUpload'
import { type CategorySelectionKeys } from '@/shared/types/categories'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import {
  DEFAULT_TEXTURE_SET_LIST_VIEW_STATE,
  type TextureSetListViewState,
  useTextureSetListViewStore,
} from '@/stores/textureSetListViewStore'
import { type TextureSetKind, type TextureType } from '@/types'

const PAGE_SIZE = 50

type ViewStatePatch = Partial<TextureSetListViewState>

interface UseTextureSetGridOptions {
  kind?: TextureSetKind
  viewStateScope?: string
}

export function useTextureSetGrid({
  kind,
  viewStateScope,
}: UseTextureSetGridOptions) {
  const toast = useRef<Toast>(null)
  const queryClient = useQueryClient()
  const uploadProgressContext = useUploadProgress()

  // --- View state (persisted per tab when scope provided) ---

  const persistedViewState = useTextureSetListViewStore(state =>
    viewStateScope
      ? (state.views[viewStateScope] ?? DEFAULT_TEXTURE_SET_LIST_VIEW_STATE)
      : null
  )
  const setPersistedViewState = useTextureSetListViewStore(
    state => state.setViewState
  )

  const patchViewState = useCallback(
    (patch: ViewStatePatch) => {
      if (!viewStateScope) return
      setPersistedViewState(viewStateScope, patch)
    },
    [setPersistedViewState, viewStateScope]
  )

  // Fall back to local state when no scope is set (e.g. non-tab usage).
  const [localState, setLocalState] = useState<TextureSetListViewState>(
    DEFAULT_TEXTURE_SET_LIST_VIEW_STATE
  )
  const setLocal = useCallback((patch: ViewStatePatch) => {
    setLocalState(prev => ({ ...prev, ...patch }))
  }, [])

  const viewState = persistedViewState ?? localState
  const setView = persistedViewState ? patchViewState : setLocal

  // --- Card width (still in shared cardWidthStore so non-tab views share) ---

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.textureSets
  const handleCardWidthChange = useCallback(
    (width: number) => setCardWidth('textureSets', width),
    [setCardWidth]
  )

  // --- Filter facet data ---

  const { data: packs = [] } = usePacksQuery()
  const { data: categories = [] } = useQuery({
    queryKey: ['textureSetCategories'],
    queryFn: getAllTextureSetCategories,
  })

  // --- Derived filter state ---

  const selectedCategoryIds = useMemo(
    () =>
      Object.entries(viewState.selectedCategoryKeys)
        .filter(([, state]) => state?.checked)
        .map(([key]) => Number(key))
        .filter(Number.isFinite),
    [viewState.selectedCategoryKeys]
  )

  // --- Data: texture sets ---

  // Stable, ordered filter parameter arrays for the React Query cache key.
  // Sorting before stringification means [1,2] and [2,1] share a cache slot.
  const sortedPackIds = useMemo(
    () => [...viewState.selectedPackIds].sort((a, b) => a - b),
    [viewState.selectedPackIds]
  )
  const sortedTextureTypes = useMemo(
    () => [...viewState.selectedTextureTypes].sort((a, b) => a - b),
    [viewState.selectedTextureTypes]
  )
  const sortedCategoryIds = useMemo(
    () => [...selectedCategoryIds].sort((a, b) => a - b),
    [selectedCategoryIds]
  )

  // Debounce the search query for the server side so each keystroke doesn't
  // spawn its own fetch. Client-side filtering of already-loaded pages
  // stays instant via `viewState.searchQuery`.
  const debouncedSearchName = useDebouncedValue(
    viewState.searchQuery.trim(),
    300
  )

  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error: queryError,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      'textureSets',
      {
        kind,
        packIds: sortedPackIds,
        categoryIds: sortedCategoryIds,
        textureTypes: sortedTextureTypes,
        searchName: debouncedSearchName || undefined,
      },
    ],
    queryFn: ({ pageParam }) =>
      getTextureSetsPaginated({
        page: pageParam,
        pageSize: PAGE_SIZE,
        kind,
        packIds: sortedPackIds.length > 0 ? sortedPackIds : undefined,
        categoryIds:
          sortedCategoryIds.length > 0 ? sortedCategoryIds : undefined,
        textureTypes:
          sortedTextureTypes.length > 0 ? sortedTextureTypes : undefined,
        searchName: debouncedSearchName || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.textureSets.length, 0)
      return loaded < lastPage.totalCount ? allPages.length + 1 : undefined
    },
  })

  const textureSets = useMemo(
    () => paginatedData?.pages.flatMap(p => p.textureSets) ?? [],
    [paginatedData]
  )
  const totalCount = paginatedData?.pages[0]?.totalCount ?? 0

  // --- Client-side filtering: name search only. Pack/category/texture-type
  // filtering runs server-side via the query params above. ---

  const filteredTextureSets = useMemo(() => {
    const search = viewState.searchQuery.trim().toLowerCase()
    if (!search) return textureSets
    return textureSets.filter(set => set.name.toLowerCase().includes(search))
  }, [textureSets, viewState.searchQuery])

  // --- Setters that route through view-state ---

  const setSearchQuery = useCallback(
    (query: string) => setView({ searchQuery: query }),
    [setView]
  )
  const setIsSearchOpen = useCallback(
    (open: boolean) => setView({ isSearchOpen: open }),
    [setView]
  )
  const setIsFiltersOpen = useCallback(
    (open: boolean) => setView({ isFiltersOpen: open }),
    [setView]
  )
  const setSelectedPackIds = useCallback(
    (ids: number[]) => setView({ selectedPackIds: ids }),
    [setView]
  )
  const setSelectedCategoryKeys = useCallback(
    (keys: CategorySelectionKeys) => setView({ selectedCategoryKeys: keys }),
    [setView]
  )
  const setSelectedTextureTypes = useCallback(
    (types: number[]) => setView({ selectedTextureTypes: types }),
    [setView]
  )
  const setSelectedTextureSetIds = useCallback(
    (ids: number[]) => setView({ selectedTextureSetIds: ids }),
    [setView]
  )

  // --- Selection management ---

  // Re-prune the persisted selection set when the visible set changes
  // (e.g. after a recycle or kind change). Keeps stale ids from lingering.
  useEffect(() => {
    if (viewState.selectedTextureSetIds.length === 0) return
    const visibleIds = new Set(textureSets.map(s => s.id))
    const pruned = viewState.selectedTextureSetIds.filter(id =>
      visibleIds.has(id)
    )
    if (pruned.length !== viewState.selectedTextureSetIds.length) {
      setSelectedTextureSetIds(pruned)
    }
    // We intentionally depend on the source list only; viewState writes
    // would re-trigger and oscillate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureSets])

  // --- Invalidation / refresh ---

  const invalidateTextureSets = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['textureSets'] })
  }, [queryClient])

  const handleRefresh = useCallback(() => {
    invalidateTextureSets()
    toast.current?.show({
      severity: 'success',
      summary: 'Refreshed',
      detail: 'Texture sets refreshed',
      life: 2000,
    })
  }, [invalidateTextureSets])

  // --- Create set ---

  const createTextureSetMutation = useMutation({
    mutationFn: async ({
      name,
      kind: createKind,
    }: {
      name: string
      kind: number
    }) => {
      await createTextureSet({ name, kind: createKind })
    },
    onSuccess: () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set created successfully',
        life: 3000,
      })
      invalidateTextureSets()
    },
    onError: error => {
      console.error('Failed to create texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create texture set',
        life: 3000,
      })
    },
  })

  const handleCreateTextureSet = useCallback(
    async (name: string, createKind: number = 0) => {
      await createTextureSetMutation.mutateAsync({ name, kind: createKind })
    },
    [createTextureSetMutation]
  )

  // --- Drag & drop file upload ---

  // When the page is locked to a kind (dedicated Global Materials or
  // Multi-Model Textures tabs), drops inherit that kind. The generic
  // textureSets tab defaults to Universal.
  const dropKind: TextureSetKind =
    kind ??
    (0 as TextureSetKind) /* Universal=1, but generic falls back below */

  const handleFileDrop = useCallback(
    async (files: File[] | FileList) => {
      const fileArray = Array.from(files)
      const batchId = uploadProgressContext?.createBatch() || undefined

      for (const file of fileArray) {
        let uploadId: string | null = null
        try {
          uploadId =
            uploadProgressContext?.addUpload(file, 'texture', batchId) || null

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 50)
          }

          const fileName = file.name.replace(/\.[^/.]+$/, '')
          const result = await createTextureSetWithFile(file, {
            name: fileName,
            textureType: 'Albedo',
            batchId,
            kind: kind ?? (1 as TextureSetKind), // Universal default for generic
          })

          if (uploadId && uploadProgressContext) {
            uploadProgressContext.updateUploadProgress(uploadId, 100)
            uploadProgressContext.completeUpload(uploadId, {
              fileId: result.fileId,
              textureSetId: result.textureSetId,
            })
          }

          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: `Texture set "${fileName}" created with albedo texture`,
            life: 3000,
          })
        } catch (error) {
          if (uploadId && uploadProgressContext) {
            uploadProgressContext.failUpload(uploadId, error as Error)
          }
          console.error('Failed to create texture set from file:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: `Failed to create texture set from ${file.name}`,
            life: 3000,
          })
        }
      }

      invalidateTextureSets()
    },
    [invalidateTextureSets, kind, uploadProgressContext]
  )

  const dragHandlers = useDragAndDrop(handleFileDrop)

  void dropKind // referenced for future use (e.g. drop-zone label); silence unused warning

  return {
    // Data
    textureSets,
    filteredTextureSets,
    totalCount,
    isLoading,
    error: queryError
      ? `Failed to fetch texture sets: ${queryError.message}`
      : '',
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    packs,
    categories,

    // Filter / search state
    searchQuery: viewState.searchQuery,
    setSearchQuery,
    isSearchOpen: viewState.isSearchOpen,
    setIsSearchOpen,
    isFiltersOpen: viewState.isFiltersOpen,
    setIsFiltersOpen,
    selectedPackIds: viewState.selectedPackIds,
    setSelectedPackIds,
    selectedCategoryKeys: viewState.selectedCategoryKeys,
    setSelectedCategoryKeys,
    selectedCategoryIds,
    selectedTextureTypes: viewState.selectedTextureTypes as TextureType[],
    setSelectedTextureTypes,

    // Selection
    selectedTextureSetIds: viewState.selectedTextureSetIds,
    setSelectedTextureSetIds,

    // Card width
    cardWidth,
    handleCardWidthChange,

    // Actions
    handleRefresh,
    handleCreateTextureSet,
    invalidateTextureSets,
    dragHandlers,
    handleFileDrop,

    // Refs
    toast,
  }
}
