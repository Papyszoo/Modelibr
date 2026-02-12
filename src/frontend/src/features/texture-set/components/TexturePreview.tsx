import { useEffect, useRef, useState } from 'react'
import { TextureChannel } from '@/types'

interface TexturePreviewProps {
  src: string
  alt: string
  sourceChannel?: TextureChannel
  className?: string
}

/**
 * TexturePreview component that displays a texture with optional channel extraction.
 * For single-channel textures (R, G, B, A), extracts that channel and displays as grayscale.
 * Uses Canvas for actual pixel manipulation instead of SVG filters.
 */
export default function TexturePreview({
  src,
  alt,
  sourceChannel = TextureChannel.RGB,
  className = '',
}: TexturePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [error, setError] = useState(false)

  // Determine if we need to extract a single channel
  const needsChannelExtraction = sourceChannel !== TextureChannel.RGB

  useEffect(() => {
    if (!needsChannelExtraction) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width
      canvas.height = img.height

      // Draw original image
      ctx.drawImage(img, 0, 0)

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      // Extract the specified channel and convert to grayscale
      const channelIndex = getChannelIndex(sourceChannel)

      for (let i = 0; i < data.length; i += 4) {
        const channelValue = data[i + channelIndex]
        // Set R, G, B to the channel value (grayscale)
        data[i] = channelValue // R
        data[i + 1] = channelValue // G
        data[i + 2] = channelValue // B
        // Keep alpha as is (data[i + 3])
      }

      ctx.putImageData(imageData, 0, 0)
      setImageLoaded(true)
    }

    img.onerror = () => {
      setError(true)
    }

    img.src = src
  }, [src, sourceChannel, needsChannelExtraction])

  // For RGB textures, just render a regular image
  if (!needsChannelExtraction) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setError(true)}
      />
    )
  }

  // For single-channel textures, use canvas
  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          display: imageLoaded && !error ? 'block' : 'none',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      {!imageLoaded && !error && (
        <div className={`texture-loading ${className}`}>
          <i className="pi pi-spin pi-spinner" />
        </div>
      )}
      {error && (
        <div className={`texture-error ${className}`}>
          <i className="pi pi-exclamation-triangle" />
        </div>
      )}
    </>
  )
}

/**
 * Get the index in RGBA data array for a given channel
 */
function getChannelIndex(channel: TextureChannel): number {
  switch (channel) {
    case TextureChannel.R:
      return 0
    case TextureChannel.G:
      return 1
    case TextureChannel.B:
      return 2
    case TextureChannel.A:
      return 3
    default:
      return 0
  }
}
