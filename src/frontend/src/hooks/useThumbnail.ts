import { useEffect, useState } from 'react'
import ApiClient, { ThumbnailStatus } from '../services/ApiClient'

export function useThumbnail(modelId: string) {
  const [thumbnailDetails, setThumbnailDetails] =
    useState<ThumbnailStatus | null>(null)
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  useEffect(() => {
    const fetchThumbnailDetails = async () => {
      const details = await ApiClient.getThumbnailStatus(modelId)
      setThumbnailDetails(details)
    }
    fetchThumbnailDetails()
  }, [modelId])

  useEffect(() => {
    const fetchImg = async () => {
      try {
        const blob = await ApiClient.getThumbnailFile(modelId)
        const url = URL.createObjectURL(blob)
        setImgSrc(url)
      } catch {
        setImgSrc(null)
      }
    }
    if (thumbnailDetails?.status === 'Ready') {
      fetchImg()
    }
    // Cleanup the object URL when component unmounts or modelId changes
    return () => {
      if (imgSrc) {
        URL.revokeObjectURL(imgSrc)
      }
    }
  }, [modelId, thumbnailDetails, imgSrc])

  return { thumbnailDetails, imgSrc }
}
