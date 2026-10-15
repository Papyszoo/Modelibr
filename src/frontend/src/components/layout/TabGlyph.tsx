import { type JSX, useState } from 'react'

import { useModelByIdQuery } from '@/features/models/api/queries'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { type Tab } from '@/types'

import { trimToModel } from './trimThumbnail'

/**
 * Trimmed thumbnails by source URL. A tab remounts when it moves to the other
 * panel or the shell re-lays out, and without this it would fall back to the
 * icon and trim again each time.
 */
const trimmedBySrc = new Map<string, string>()

function ModelGlyph({
  modelId,
  icon,
}: {
  modelId: string
  icon: string
}): JSX.Element {
  // Same query (and cache entry) the model viewer loads; the still PNG keeps
  // a 32px dock button calm where the card thumbnail would animate.
  const { data } = useModelByIdQuery({ modelId })
  const src = resolveApiAssetUrl(data?.pngThumbnailUrl)
  const [, setLoaded] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const iconGlyph = <i className={`pi ${icon} tab-icon`} aria-hidden="true" />
  if (!src || failedSrc === src) return iconGlyph

  const trimmed = trimmedBySrc.get(src)
  if (trimmed) {
    return (
      <span className="tab-thumbnail">
        <img src={trimmed} alt="" className="tab-thumbnail-img" />
      </span>
    )
  }

  // The kind icon holds the slot while the thumbnail loads (hidden images
  // still load) and is trimmed.
  return (
    <>
      {iconGlyph}
      <img
        src={src}
        alt=""
        hidden
        onLoad={e => {
          trimmedBySrc.set(src, trimToModel(e.currentTarget) ?? src)
          setLoaded(src)
        }}
        onError={() => setFailedSrc(src)}
      />
    </>
  )
}

/**
 * The picture on a dock tab: a model's own thumbnail, otherwise the kind icon.
 * Effect thumbnails are left out on purpose - they are rendered on black and
 * read as a dark square at tab size.
 */
export function TabGlyph({
  tab,
  icon,
}: {
  tab: Tab
  /** The kind icon, shown until (or instead of) a thumbnail. */
  icon: string
}): JSX.Element {
  const modelId = tab.type === 'modelViewer' ? tab.params.modelId : undefined
  if (modelId) return <ModelGlyph modelId={modelId} icon={icon} />
  return <i className={`pi ${icon} tab-icon`} aria-hidden="true" />
}
