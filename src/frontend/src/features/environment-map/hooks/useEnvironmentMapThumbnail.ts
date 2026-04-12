import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import {
  type EnvironmentMapThumbnailStatus,
  getEnvironmentMapPreviewUrl,
  getEnvironmentMapThumbnailStatus,
} from '../api/environmentMapApi'

export function useEnvironmentMapThumbnail(environmentMapId: number) {
  const { data, refetch } = useQuery<EnvironmentMapThumbnailStatus>({
    queryKey: ['environmentMapThumbnail', environmentMapId],
    queryFn: () => getEnvironmentMapThumbnailStatus(environmentMapId),
    staleTime: 5 * 60 * 1000,
  })

  const imgSrc = useMemo(() => {
    if (data?.status !== 'Ready') return null
    const url = getEnvironmentMapPreviewUrl(environmentMapId)
    const cacheBust = data.processedAt ?? ''
    return `${url}?t=${cacheBust}`
  }, [data, environmentMapId])

  return {
    thumbnailDetails: data ?? null,
    imgSrc,
    refreshThumbnail: refetch,
  }
}
