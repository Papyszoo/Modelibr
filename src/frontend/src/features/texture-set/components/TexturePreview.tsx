import { useMemo, useState } from 'react'
import { TextureChannel } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TexturePreviewProps {
  /** Preview URL (should be a /files/{id}/preview?channel=rgb endpoint) */
  src: string
  alt: string
  sourceChannel?: TextureChannel
  /** File name (kept for API compatibility, no longer used for EXR detection) */
  fileName?: string
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map TextureChannel enum to the query param value */
function channelToParam(channel: TextureChannel): string {
  switch (channel) {
    case TextureChannel.R:
      return 'r'
    case TextureChannel.G:
      return 'g'
    case TextureChannel.B:
      return 'b'
    case TextureChannel.A:
      return 'a'
    default:
      return 'rgb'
  }
}

/**
 * Replace the channel query parameter in a preview URL.
 * Handles both ?channel=rgb and absence of the parameter.
 */
function withChannel(url: string, channel: TextureChannel): string {
  if (channel === TextureChannel.RGB) return url
  const param = channelToParam(channel)
  if (url.includes('channel=')) {
    return url.replace(/channel=\w+/, `channel=${param}`)
  }
  return url + (url.includes('?') ? '&' : '?') + `channel=${param}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * TexturePreview — displays a thumbnail preview of a texture file.
 *
 * Always uses server-generated preview thumbnails (never the raw file).
 * Channel-specific thumbnails (R, G, B) are served by the backend.
 */
export function TexturePreview({
  src,
  alt,
  sourceChannel = TextureChannel.RGB,
  fileName: _fileName,
  className = '',
}: TexturePreviewProps) {
  const [error, setError] = useState(false)

  const previewUrl = useMemo(
    () => withChannel(src, sourceChannel),
    [src, sourceChannel]
  )

  if (error) {
    return (
      <div className={`texture-error ${className}`}>
        <i className="pi pi-exclamation-triangle" />
      </div>
    )
  }

  return (
    <img
      src={previewUrl}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  )
}
