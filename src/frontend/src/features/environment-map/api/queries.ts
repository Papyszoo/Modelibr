import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import {
  addEnvironmentMapVariantWithFile,
  createEnvironmentMapWithFile,
  getAllEnvironmentMaps,
  getEnvironmentMapById,
  getEnvironmentMapsPaginated,
  softDeleteEnvironmentMap,
} from './environmentMapApi'

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

export function useCreateEnvironmentMapWithFileMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      file,
      options,
    }: {
      file: File
      options?: {
        name?: string
        sizeLabel?: string
        batchId?: string
        packId?: number
        projectId?: number
      }
    }) => createEnvironmentMapWithFile(file, options),
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
      options,
    }: {
      file: File
      options?: {
        sizeLabel?: string
      }
    }) => addEnvironmentMapVariantWithFile(environmentMapId, file, options),
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
