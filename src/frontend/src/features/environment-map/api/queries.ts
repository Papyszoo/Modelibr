import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import {
  addEnvironmentMapVariantUpload,
  addEnvironmentMapVariantWithFile,
  createEnvironmentMapUpload,
  createEnvironmentMapWithFile,
  getAllEnvironmentMaps,
  getEnvironmentMapById,
  getEnvironmentMapsPaginated,
  regenerateEnvironmentMapThumbnail,
  setEnvironmentMapCustomThumbnail,
  softDeleteEnvironmentMap,
  updateEnvironmentMapMetadata,
} from './environmentMapApi'
import { getEnvironmentMapCategories } from './environmentMapCategoryApi'

export function getEnvironmentMapsQueryOptions(params: {
  page: number
  pageSize: number
  packId?: number
  projectId?: number
}) {
  return queryOptions({
    queryKey: ['environmentMaps', params] as const,
    queryFn: () => getEnvironmentMapsPaginated(params),
  })
}

export function getAllEnvironmentMapsQueryOptions(params?: {
  packId?: number
  projectId?: number
}) {
  return queryOptions({
    queryKey: ['environmentMaps', 'all', params ?? {}] as const,
    queryFn: () => getAllEnvironmentMaps(params),
  })
}

export function getEnvironmentMapByIdQueryOptions(environmentMapId: number) {
  return queryOptions({
    queryKey: ['environmentMaps', 'detail', environmentMapId] as const,
    queryFn: () => getEnvironmentMapById(environmentMapId),
  })
}

export function getEnvironmentMapCategoriesQueryOptions() {
  return queryOptions({
    queryKey: ['environment-map-categories'] as const,
    queryFn: () => getEnvironmentMapCategories(),
  })
}

type UseEnvironmentMapsQueryOptions = {
  params: {
    page: number
    pageSize: number
    packId?: number
    projectId?: number
  }
  queryConfig?: QueryConfig<typeof getEnvironmentMapsQueryOptions>
}

export function useEnvironmentMapsQuery({
  params,
  queryConfig = {},
}: UseEnvironmentMapsQueryOptions) {
  return useQuery({
    ...getEnvironmentMapsQueryOptions(params),
    ...queryConfig,
  })
}

type UseAllEnvironmentMapsQueryOptions = {
  params?: {
    packId?: number
    projectId?: number
  }
  queryConfig?: QueryConfig<typeof getAllEnvironmentMapsQueryOptions>
}

export function useAllEnvironmentMapsQuery({
  params,
  queryConfig = {},
}: UseAllEnvironmentMapsQueryOptions = {}) {
  return useQuery({
    ...getAllEnvironmentMapsQueryOptions(params),
    ...queryConfig,
  })
}

type UseEnvironmentMapByIdQueryOptions = {
  environmentMapId: number
  queryConfig?: QueryConfig<typeof getEnvironmentMapByIdQueryOptions>
}

export function useEnvironmentMapByIdQuery({
  environmentMapId,
  queryConfig = {},
}: UseEnvironmentMapByIdQueryOptions) {
  return useQuery({
    ...getEnvironmentMapByIdQueryOptions(environmentMapId),
    ...queryConfig,
  })
}

type UseEnvironmentMapCategoriesQueryOptions = {
  queryConfig?: QueryConfig<typeof getEnvironmentMapCategoriesQueryOptions>
}

export function useEnvironmentMapCategoriesQuery({
  queryConfig = {},
}: UseEnvironmentMapCategoriesQueryOptions = {}) {
  return useQuery({
    ...getEnvironmentMapCategoriesQueryOptions(),
    ...queryConfig,
  })
}

export function useCreateEnvironmentMapWithFileMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      file,
      cubeFaces,
      options,
    }: {
      file?: File
      cubeFaces?: Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', File>>
      options?: {
        name?: string
        sizeLabel?: string
        batchId?: string
        packId?: number
        projectId?: number
        sourceType?: string
        projectionType?: string
      }
    }) =>
      file && !cubeFaces
        ? createEnvironmentMapWithFile(file, options)
        : createEnvironmentMapUpload({ file, cubeFaces, options }),
    onSuccess: async data => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
        queryClient.invalidateQueries({
          queryKey: getEnvironmentMapByIdQueryOptions(data.environmentMapId)
            .queryKey,
        }),
      ])
    },
  })
}

export function useAddEnvironmentMapVariantWithFileMutation(
  environmentMapId: number
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      file,
      cubeFaces,
      options,
    }: {
      file?: File
      cubeFaces?: Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', File>>
      options?: {
        sizeLabel?: string
        sourceType?: string
        projectionType?: string
      }
    }) =>
      file && !cubeFaces
        ? addEnvironmentMapVariantWithFile(environmentMapId, file, options)
        : addEnvironmentMapVariantUpload(environmentMapId, {
            file,
            cubeFaces,
            options,
          }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
        queryClient.invalidateQueries({
          queryKey:
            getEnvironmentMapByIdQueryOptions(environmentMapId).queryKey,
        }),
      ])
    },
  })
}

export function useRecycleEnvironmentMapMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (environmentMapId: number) =>
      softDeleteEnvironmentMap(environmentMapId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
        queryClient.invalidateQueries({ queryKey: ['recycledFiles'] }),
      ])
    },
  })
}

export function useSetEnvironmentMapCustomThumbnailMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      environmentMapId,
      fileId,
    }: {
      environmentMapId: number
      fileId: number | null
    }) => setEnvironmentMapCustomThumbnail(environmentMapId, fileId),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
        queryClient.invalidateQueries({
          queryKey: getEnvironmentMapByIdQueryOptions(
            variables.environmentMapId
          ).queryKey,
        }),
      ])
    },
  })
}

export function useRegenerateEnvironmentMapThumbnailMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      environmentMapId,
      variantId,
    }: {
      environmentMapId: number
      variantId?: number
    }) => regenerateEnvironmentMapThumbnail(environmentMapId, variantId),
    onSuccess: async (_data, { environmentMapId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
        queryClient.invalidateQueries({
          queryKey:
            getEnvironmentMapByIdQueryOptions(environmentMapId).queryKey,
        }),
      ])
    },
  })
}

export function useUpdateEnvironmentMapMetadataMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      environmentMapId,
      tags,
      categoryId,
    }: {
      environmentMapId: number
      tags?: string[]
      categoryId?: number | null
    }) => updateEnvironmentMapMetadata(environmentMapId, { tags, categoryId }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
        queryClient.invalidateQueries({
          queryKey: getEnvironmentMapByIdQueryOptions(
            variables.environmentMapId
          ).queryKey,
        }),
        queryClient.invalidateQueries({ queryKey: ['model-tags'] }),
      ])
    },
  })
}
