import './ThumbnailDisplay.css'

import { useEffect, useRef, useState } from 'react'

import { useThumbnail } from '@/shared/thumbnail/hooks/useThumbnail'
import { useThumbnailAnimationStore } from '@/stores/thumbnailAnimationStore'

interface ThumbnailDisplayProps {
  modelId: number | string
  versionId?: number
  className?: string
  modelName?: string
}

export function ThumbnailDisplay({
  modelId,
  versionId,
  modelName,
}: ThumbnailDisplayProps) {
  const modelIdStr = modelId.toString()
  const { thumbnailDetails, imgSrc } = useThumbnail(modelIdStr, versionId)
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [stillReady, setStillReady] = useState(false)
  const mode = useThumbnailAnimationStore(state => state.mode)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    setImageError(false)
  }, [imgSrc])

  // We want a still (canvas of frame 0) whenever the user picks `static`
  // (always) or `onHover` (used while the cursor is away).
  const needsStill = mode === 'static' || mode === 'onHover'

  // Re-decode whenever the source or mode requires it. We use an off-DOM
  // `Image` rather than `fetch`+`ImageDecoder` so this works across every
  // browser that already loads the thumbnail in the first place — no CORS
  // headache, no spec quirks, no Firefox carve-out.
  useEffect(() => {
    if (!needsStill || !imgSrc) {
      setStillReady(false)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) {
      setStillReady(false)
      return
    }

    let cancelled = false
    setStillReady(false)

    const loader = new Image()
    // Intentionally do NOT set crossOrigin — that would force a CORS
    // request the visible <img> never makes, which fails silently on
    // backends without ACAO headers and drops us back to the animated
    // <img>. We only draw to the canvas (no readback), so taint is fine.
    loader.decoding = 'async'

    loader.onload = () => {
      if (cancelled) return
      const width = loader.naturalWidth || 256
      const height = loader.naturalHeight || 256
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      // Snap the canvas onto whatever frame the <img> is currently showing
      // — for a freshly-loaded animated WebP that is frame 0.
      ctx.drawImage(loader, 0, 0, width, height)
      setStillReady(true)
    }

    loader.onerror = () => {
      // Leaves stillReady=false so the live <img> remains visible. No worse
      // than the current behaviour.
    }

    loader.src = imgSrc

    return () => {
      cancelled = true
      loader.onload = null
      loader.onerror = null
    }
  }, [imgSrc, needsStill])

  if (!(thumbnailDetails?.status === 'Ready' && imgSrc && !imageError)) {
    return (
      <div
        className="thumbnail-placeholder"
        aria-label="No thumbnail available"
      >
        <i className="pi pi-image" aria-hidden="true" />
      </div>
    )
  }

  // Canvas takes over when the user has explicitly opted out of motion:
  //   - mode === 'static'                       — always
  //   - mode === 'onHover' && !isHovered        — only while idle
  const stillCovers =
    needsStill &&
    stillReady &&
    (mode === 'static' || (mode === 'onHover' && !isHovered))

  // The live <img> is only mounted when we're going to show it. Unmounting
  // it in the `static` and `onHover`-idle cases lets the browser stop
  // decoding background animation frames, which is the whole point of
  // those modes on weaker hardware.
  const showLive = !stillCovers

  return (
    <div
      className="thumbnail-image-container"
      onMouseEnter={mode === 'onHover' ? () => setIsHovered(true) : undefined}
      onMouseLeave={mode === 'onHover' ? () => setIsHovered(false) : undefined}
    >
      {needsStill && (
        <canvas
          ref={canvasRef}
          className={`thumbnail-image thumbnail-image-still${stillCovers ? '' : ' is-hidden'}`}
          aria-label={modelName || 'Model Thumbnail'}
        />
      )}
      {showLive && (
        <img
          src={imgSrc}
          alt={modelName || 'Model Thumbnail'}
          title={modelName || 'Model Thumbnail'}
          className="thumbnail-image"
          loading="lazy"
          onError={() => setImageError(true)}
        />
      )}
    </div>
  )
}
