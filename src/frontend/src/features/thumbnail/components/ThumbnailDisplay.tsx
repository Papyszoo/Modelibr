import './ThumbnailDisplay.css'
import { useThumbnail } from '../hooks/useThumbnail'

interface ThumbnailDisplayProps {
  modelId: number | string
  className?: string
  modelName?: string
}

function ThumbnailDisplay({ modelId, modelName }: ThumbnailDisplayProps) {
  // Normalize modelId to string for consistency
  const modelIdStr = modelId.toString()
  const { thumbnailDetails, imgSrc } = useThumbnail(modelIdStr)

  // Show thumbnail image when ready
  if (thumbnailDetails?.status === 'Ready' && imgSrc) {
    return (
      <div className="thumbnail-image-container">
        <img
          src={imgSrc}
          alt={modelName || 'Model Thumbnail'}
          title={modelName}
          className="thumbnail-image"
          loading="lazy"
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
