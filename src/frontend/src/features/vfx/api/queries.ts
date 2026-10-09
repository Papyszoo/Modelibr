import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { THUMBNAIL_POLL_MS, thumbnailMayChange } from '../lib/vfxThumbnails'
import type { VfxDefinition } from '../types'
import { createVfx, deleteVfx, getVfx, getVfxList, updateVfx } from './vfxApi'

export function getVfxListQueryOptions() {
  return queryOptions({
    queryKey: ['vfx', 'list'] as const,
    queryFn: getVfxList,
    // An agent writes effects over MCP from outside this browser.
    staleTime: 0,
    // Thumbnails are rendered by the worker after the save returns.
    refetchInterval: query =>
      thumbnailMayChange(query.state.data) ? THUMBNAIL_POLL_MS : false,
  })
}

export function getVfxQueryOptions(id: number) {
  return queryOptions({
    queryKey: ['vfx', 'detail', id] as const,
    queryFn: () => getVfx(id),
  })
}

export function useVfxListQuery() {
  return useQuery(getVfxListQueryOptions())
}

export function useVfxQuery(id: number) {
  return useQuery(getVfxQueryOptions(id))
}

export function useCreateVfxMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createVfx,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vfx', 'list'] })
    },
  })
}

export function useUpdateVfxMutation(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name?: string
      description?: string | null
      definition?: VfxDefinition
    }) => updateVfx(id, body),
    onSuccess: saved => {
      queryClient.setQueryData(getVfxQueryOptions(id).queryKey, saved)
      void queryClient.invalidateQueries({ queryKey: ['vfx', 'list'] })
    },
  })
}

export function useDeleteVfxMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteVfx,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['vfx'] })
    },
  })
}
