import { useEffect, useState } from 'react'
import './ThumbnailDisplay.css'
import ApiClient, { ThumbnailStatus } from '../services/ApiClient'

interface ThumbnailDisplayProps {
  modelId: string
  className?: string
}

function ThumbnailDisplay({ modelId }: ThumbnailDisplayProps) {
  const renderContent = () => {
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
        } catch (error) {
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
    }, [modelId, thumbnailDetails])

    // Show thumbnail image when ready
    if (thumbnailDetails?.status === 'Ready' && imgSrc) {
      return (
        <div className="thumbnail-image-container">
          <img
            src={imgSrc}
            alt="Model Thumbnail"
            className="thumbnail-image"
            loading="lazy"
          />
        </div>
      )
    }
    return (
      <div
        className="thumbnail-placeholder"
        aria-label="No thumbnail available"
      >
        <i className="pi pi-image" aria-hidden="true" />
      </div>
    )
  }
  return <>{renderContent()}</>
}

export default ThumbnailDisplay
