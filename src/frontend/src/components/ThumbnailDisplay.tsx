import { useState } from 'react'
import {
  useThumbnailManager,
  THUMBNAIL_STATUS,
} from '../hooks/useThumbnailManager'
import './ThumbnailDisplay.css'

function ThumbnailDisplay({
  modelId,
  size = 'medium',
  showAnimation = false,
  className = '',
  onError = null,
  showControls = false,
  alt = `Thumbnail for model ${modelId}`,
}) {
  const [imageError, setImageError] = useState(false)
  const [showAnimated, setShowAnimated] = useState(showAnimation)

  const {
    thumbnailStatus,
    thumbnailUrl,
    isLoading,
    error,
    isProcessing,
    isReady,
    isFailed,
    regenerateThumbnail,
  } = useThumbnailManager(modelId)

  const handleImageError = () => {
    setImageError(true)
    if (onError) {
      onError(new Error('Failed to load thumbnail image'))
    }
  }

  const handleRegenerateClick = async () => {
    setImageError(false)
    await regenerateThumbnail()
  }

  const handleMouseEnter = () => {
    if (isReady && !showAnimation) {
      setShowAnimated(true)
    }
  }

  const handleMouseLeave = () => {
    if (!showAnimation) {
      setShowAnimated(false)
    }
  }

  const renderLoadingSpinner = () => (
    <div className="thumbnail-loading" aria-label="Loading thumbnail">
      <div className="thumbnail-spinner" />
      <span className="thumbnail-status-text">
        {thumbnailStatus?.Status === THUMBNAIL_STATUS.PROCESSING
          ? 'Generating thumbnail...'
          : 'Preparing thumbnail...'}
      </span>
    </div>
  )

  const renderErrorState = () => (
    <div className="thumbnail-error" aria-label="Thumbnail failed to generate">
      <i className="pi pi-exclamation-triangle" aria-hidden="true" />
      <span className="thumbnail-status-text">
        {error ||
          thumbnailStatus?.ErrorMessage ||
          'Thumbnail generation failed'}
      </span>
      {showControls && (
        <button
          className="thumbnail-retry-btn"
          onClick={handleRegenerateClick}
          disabled={isLoading}
          aria-label="Regenerate thumbnail"
        >
          <i className="pi pi-refresh" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  )

  const renderPlaceholder = () => (
    <div className="thumbnail-placeholder" aria-label="No thumbnail available">
      <i className="pi pi-image" aria-hidden="true" />
    </div>
  )

  const renderThumbnailImage = () => {
    if (!thumbnailUrl || imageError) {
      return renderPlaceholder()
    }

    // For static display, show poster frame by default
    // For animated display or on hover, show the animated version
    const imageUrl = showAnimated ? thumbnailUrl : thumbnailUrl

    return (
      <div className="thumbnail-image-container">
        <img
          src={imageUrl}
          alt={alt}
          className="thumbnail-image"
          onError={handleImageError}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          loading="lazy"
        />
        {showControls && isFailed && (
          <div className="thumbnail-overlay">
            <button
              className="thumbnail-retry-btn"
              onClick={handleRegenerateClick}
              disabled={isLoading}
              aria-label="Regenerate thumbnail"
            >
              <i className="pi pi-refresh" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    )
  }

  const getSizeClass = () => {
    switch (size) {
      case 'small':
        return 'thumbnail-small'
      case 'large':
        return 'thumbnail-large'
      default:
        return 'thumbnail-medium'
    }
  }

  const combinedClassName =
    `thumbnail-display ${getSizeClass()} ${className}`.trim()

  return (
    <div className={combinedClassName}>
      {isProcessing && renderLoadingSpinner()}
      {isFailed && renderErrorState()}
      {isReady && renderThumbnailImage()}
      {!thumbnailStatus && !isLoading && renderPlaceholder()}
    </div>
  )
}

export default ThumbnailDisplay
