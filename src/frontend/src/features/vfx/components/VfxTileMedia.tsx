import './VfxTileMedia.css'

import { type JSX, type ReactNode, useState } from 'react'

import { resolveApiAssetUrl } from '@/lib/apiBase'

interface VfxTileMediaProps {
  name: string
  /** The effect's animated thumbnail, if the worker has rendered one. */
  thumbnailUrl?: string | null
  /** Shown while the thumbnail is pending, or if it fails to load. */
  placeholder: ReactNode
}

/**
 * The picture on an effect tile: its animated loop, or the placeholder while
 * there is none yet (or the file cannot be loaded).
 */
export function VfxTileMedia({
  name,
  thumbnailUrl,
  placeholder,
}: VfxTileMediaProps): JSX.Element {
  // Keyed by URL so a re-render's new thumbnail gets a fresh attempt after a failure.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const src = resolveApiAssetUrl(thumbnailUrl)

  if (!src || failedUrl === src) {
    return <>{placeholder}</>
  }

  return (
    <img
      className="vfx-tile-media-image"
      src={src}
      alt={name}
      loading="lazy"
      data-testid="vfx-tile-thumbnail"
      onError={() => setFailedUrl(src)}
    />
  )
}
