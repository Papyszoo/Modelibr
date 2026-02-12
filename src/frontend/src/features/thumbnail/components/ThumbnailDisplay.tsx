import { useState, useEffect } from 'react'
import './ThumbnailDisplay.css'
import { useThumbnail } from '@/features/thumbnail/hooks/useThumbnail'

interface ThumbnailDisplayProps {
  modelId: number | string
  versionId?: number
  className?: string
  modelName?: string
}

function ThumbnailDisplay({
  modelId,
  versionId,
  modelName,
}: ThumbnailDisplayProps) {
  // Normalize modelId to string for consistency
  const modelIdStr = modelId.toString()
  const { thumbnailDetails, imgSrc } = useThumbnail(modelIdStr, versionId)
  const [imageError, setImageError] = useState(false)

  // Reset error state when image source changes
  useEffect(() => {
    setImageError(false)
  }, [imgSrc])

  // Show thumbnail image when ready and no error occurred
  if (thumbnailDetails?.status === 'Ready' && imgSrc && !imageError) {
    return (
      <div className="thumbnail-image-container">
        <img
          src={imgSrc}
          alt={modelName || 'Model Thumbnail'}
          title={modelName || 'Model Thumbnail'}
          className="thumbnail-image"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      </div>
    )
  }
  return (
    <div className="thumbnail-placeholder" aria-label="No thumbnail available">
      <i className="pi pi-image" aria-hidden="true" />
    </div>
  )
}

export default ThumbnailDisplay
