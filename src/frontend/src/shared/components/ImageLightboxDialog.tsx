import './ImageLightboxDialog.css'

import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { useEffect, useMemo } from 'react'

export interface ImageLightboxItem {
  id: string | number
  name: string
  previewUrl: string
  fullUrl: string
}

interface ImageLightboxDialogProps {
  visible: boolean
  title?: string
  images: ImageLightboxItem[]
  activeIndex: number
  onIndexChange: (index: number) => void
  onHide: () => void
}

export function ImageLightboxDialog({
  visible,
  title,
  images,
  activeIndex,
  onIndexChange,
  onHide,
}: ImageLightboxDialogProps) {
  const safeIndex = useMemo(() => {
    if (images.length === 0) {
      return 0
    }

    return Math.min(Math.max(activeIndex, 0), images.length - 1)
  }, [activeIndex, images.length])

  const currentImage = images[safeIndex] ?? null
  const canNavigate = images.length > 1

  useEffect(() => {
    if (!visible || !canNavigate) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onIndexChange((safeIndex - 1 + images.length) % images.length)
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onIndexChange((safeIndex + 1) % images.length)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canNavigate, images.length, onIndexChange, safeIndex, visible])

  if (!currentImage) {
    return null
  }

  return (
    <Dialog
      visible={visible}
      modal
      onHide={onHide}
      className="image-lightbox-dialog"
      style={{ width: 'min(94vw, 1200px)' }}
      dismissableMask
      draggable={false}
      resizable={false}
      showHeader={false}
    >
      <div className="image-lightbox">
        <div className="image-lightbox-toolbar">
          <div className="image-lightbox-meta">
            <span className="image-lightbox-title">
              {title ? `${title}: ${currentImage.name}` : currentImage.name}
            </span>
            <span className="image-lightbox-counter">
              {safeIndex + 1} / {images.length}
            </span>
          </div>

          <div className="image-lightbox-actions">
            {canNavigate ? (
              <>
                <Button
                  icon="pi pi-angle-left"
                  text
                  rounded
                  className="image-lightbox-action"
                  aria-label="Previous image"
                  onClick={() =>
                    onIndexChange(
                      (safeIndex - 1 + images.length) % images.length
                    )
                  }
                />
                <Button
                  icon="pi pi-angle-right"
                  text
                  rounded
                  className="image-lightbox-action"
                  aria-label="Next image"
                  onClick={() => onIndexChange((safeIndex + 1) % images.length)}
                />
              </>
            ) : null}
            <Button
              icon="pi pi-times"
              text
              rounded
              className="image-lightbox-action"
              aria-label="Close image viewer"
              onClick={onHide}
            />
          </div>
        </div>

        <div className="image-lightbox-stage">
          <img
            src={currentImage.fullUrl || currentImage.previewUrl}
            alt={`${currentImage.name} full view`}
          />
        </div>

        {canNavigate ? (
          <div className="image-lightbox-thumbnails">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                className={`image-lightbox-thumb${index === safeIndex ? ' is-active' : ''}`}
                onClick={() => onIndexChange(index)}
                aria-label={`Open ${image.name}`}
              >
                <img src={image.previewUrl} alt={image.name} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
