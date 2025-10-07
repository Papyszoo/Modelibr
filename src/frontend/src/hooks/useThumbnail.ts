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
    let objectUrl: string | null = null

    const fetchImg = async () => {
      try {
        const blob = await ApiClient.getThumbnailFile(modelId)
        const url = URL.createObjectURL(blob)
        objectUrl = url
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
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [modelId, thumbnailDetails?.status])

  return { thumbnailDetails, imgSrc }
}
