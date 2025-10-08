import './ThumbnailDisplay.css'
import { useThumbnail } from '../hooks/useThumbnail'

interface ThumbnailDisplayProps {
  modelId: string
  className?: string
}

function ThumbnailDisplay({ modelId }: ThumbnailDisplayProps) {
  const { thumbnailDetails, imgSrc } = useThumbnail(modelId)

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
    <div className="thumbnail-placeholder" aria-label="No thumbnail available">
      <i className="pi pi-image" aria-hidden="true" />
    </div>
  )
}

export default ThumbnailDisplay
