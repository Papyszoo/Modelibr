import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import {
  type ContainerAdapter,
  type ContainerDto,
} from '@/shared/types/ContainerTypes'

interface ShowToast {
  (opts: {
    severity: string
    summary: string
    detail: string
    life: number
  }): void
}

export function useContainerData(
  adapter: ContainerAdapter,
  showToast: ShowToast
) {
  const queryClient = useQueryClient()
  const containerQueryKey = adapter.type === 'pack' ? 'packs' : 'projects'

  const { data: container, isLoading } = useQuery({
    queryKey: ['container', adapter.type, adapter.containerId],
    queryFn: () => adapter.loadContainer(adapter.containerId),
  })

  const refetchContainer = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['container', adapter.type, adapter.containerId],
      }),
      queryClient.invalidateQueries({ queryKey: [containerQueryKey] }),
    ])
  }, [queryClient, adapter.type, adapter.containerId, containerQueryKey])

  return {
    container: container ?? (null as ContainerDto | null),
    isLoading,
    containerQueryKey,
    refetchContainer,
    showToast,
  }
}
