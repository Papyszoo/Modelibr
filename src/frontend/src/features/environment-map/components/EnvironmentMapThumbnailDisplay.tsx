import { useEffect, useState } from 'react'

import { useEnvironmentMapThumbnail } from '../hooks/useEnvironmentMapThumbnail'

interface EnvironmentMapThumbnailDisplayProps {
  environmentMapId: number
  name?: string
}

export function EnvironmentMapThumbnailDisplay({
  environmentMapId,
  name,
}: EnvironmentMapThumbnailDisplayProps) {
  const { thumbnailDetails, imgSrc } =
    useEnvironmentMapThumbnail(environmentMapId)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    setImageError(false)
  }, [imgSrc])

  if (thumbnailDetails?.status === 'Ready' && imgSrc && !imageError) {
    return (
      <img
        src={imgSrc}
        alt={name || 'Environment Map Thumbnail'}
        data-testid="environment-map-card-thumbnail"
        loading="lazy"
        onError={() => setImageError(true)}
      />
    )
  }

  return (
    <div className="environment-map-card-placeholder">
      <i className="pi pi-globe" />
      <span>
        {thumbnailDetails?.status === 'Processing'
          ? 'Processing...'
          : 'No Preview'}
      </span>
    </div>
  )
}
