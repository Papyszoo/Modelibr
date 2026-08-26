import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import {
  createMaterial,
  type CreateMaterialRequest,
  deleteMaterial,
  getAllMaterials,
  getMaterialById,
  getMaterialLibrary,
  type MaterialLibraryResponse,
  updateMaterial,
} from './materialApi'

export function getAllMaterialsQueryOptions(
  options: { search?: string; categoryIds?: number[] } = {}
) {
  return queryOptions({
    queryKey: ['materials', 'all', options] as const,
    queryFn: () => getAllMaterials(options),
  })
}

type UseMaterialsQueryOptions = {
  options?: { search?: string; categoryIds?: number[] }
  queryConfig?: QueryConfig<typeof getAllMaterialsQueryOptions>
}

export function useMaterialsQuery({
  options = {},
  queryConfig = {},
}: UseMaterialsQueryOptions = {}) {
  return useQuery({
    ...getAllMaterialsQueryOptions(options),
    // Searching changes the query key on every keystroke. Without this the
    // page drops to its loading state between characters, which unmounted the
    // search input and took the caret with it - one character was all you
    // could type.
    placeholderData: keepPreviousData,
    ...queryConfig,
  })
}

export function useCreateMaterialMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (request: CreateMaterialRequest) => createMaterial(request),
    onSuccess: () => {
      // One key prefix covers 'all', 'library' and 'detail' - a new parameter
      // material also changes the merged slot-picker surface.
      void queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}

export function useUpdateMaterialMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      materialId: number
      request: Partial<CreateMaterialRequest> & { clearCategory?: boolean }
    }) => updateMaterial(input.materialId, input.request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}

export function useDeleteMaterialMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (materialId: number) => deleteMaterial(materialId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
  })
}

export function getMaterialByIdQueryOptions(materialId: number) {
  return queryOptions({
    queryKey: ['materials', 'detail', materialId] as const,
    queryFn: () => getMaterialById(materialId),
  })
}

export function getMaterialLibraryQueryOptions(
  options: {
    search?: string
    requiresUvs?: boolean
    categoryIds?: number[]
    page?: number
    pageSize?: number
  } = {}
) {
  return queryOptions<MaterialLibraryResponse>({
    queryKey: ['materials', 'library', options] as const,
    queryFn: () => getMaterialLibrary(options),
  })
}
