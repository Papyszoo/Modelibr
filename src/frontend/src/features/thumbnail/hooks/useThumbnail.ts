import { useEffect, useState } from 'react'
import ApiClient, { ThumbnailStatus } from '../../../services/ApiClient'

export function useThumbnail(modelId: string) {
  const [thumbnailDetails, setThumbnailDetails] =
    useState<ThumbnailStatus | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  useEffect(() => {
    const fetchThumbnailDetails = async () => {
      const details = await ApiClient.getThumbnailStatus(modelId)
      setThumbnailDetails(details)

      // Use direct URL to leverage browser caching instead of fetching blob
      if (details?.status === 'Ready') {
        setImgSrc(ApiClient.getThumbnailUrl(modelId))
      } else {
        setImgSrc(null)
      }
    }
    fetchThumbnailDetails()
  }, [modelId])

  return { thumbnailDetails, imgSrc }
}
