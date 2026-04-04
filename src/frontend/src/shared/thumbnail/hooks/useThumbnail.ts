import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import {
  getThumbnailStatus,
  getThumbnailUrl,
  getVersionThumbnailStatus,
  getVersionThumbnailUrl,
  type ThumbnailStatus,
} from '../api/thumbnailApi'

// Only log in development mode
const isDev = import.meta.env.DEV
const log = (message: string, ...args: unknown[]) => {
  if (isDev) {
    console.log(message, ...args)
  }
}

export function useThumbnail(modelId: string, versionId?: number) {
  const { data, refetch } = useQuery<ThumbnailStatus>({
    queryKey: versionId
      ? ['thumbnail', 'version', versionId]
      : ['thumbnail', modelId],
    queryFn: () => {
      const identifier = versionId ? `version:${versionId}` : `model:${modelId}`
      log(`useThumbnail[${identifier}]: Fetching thumbnail details...`)
      return versionId
        ? getVersionThumbnailStatus(versionId)
        : getThumbnailStatus(modelId)
    },
    staleTime: 5 * 60 * 1000,
  })

  const imgSrc = useMemo(() => {
    if (data?.status !== 'Ready') return null
    const baseUrl = versionId
      ? getVersionThumbnailUrl(versionId)
      : getThumbnailUrl(modelId)
    const cacheBust = data.processedAt ?? ''
    return `${baseUrl}?t=${cacheBust}`
  }, [data, modelId, versionId])

  return { thumbnailDetails: data ?? null, imgSrc, refreshThumbnail: refetch }
}
