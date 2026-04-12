import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CARD_IMAGE_RETRY_DELAY_MS = 3000
const MAX_CARD_IMAGE_RETRY_ATTEMPTS = 10

interface EnvironmentMapCardImageProps {
  src: string
  alt: string
}

export function EnvironmentMapCardImage({
  src,
  alt,
}: EnvironmentMapCardImageProps) {
  const [retryAttempt, setRetryAttempt] = useState(0)
  const retryTimeoutRef = useRef<number | null>(null)

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current == null) {
      return
    }

    window.clearTimeout(retryTimeoutRef.current)
    retryTimeoutRef.current = null
  }, [])

  useEffect(() => {
    setRetryAttempt(0)
    clearRetryTimeout()

    return () => {
      clearRetryTimeout()
    }
  }, [clearRetryTimeout, src])

  const resolvedSrc = useMemo(() => {
    if (retryAttempt === 0) {
      return src
    }

    const separator = src.includes('?') ? '&' : '?'
    return `${src}${separator}thumbnailRetry=${retryAttempt}`
  }, [retryAttempt, src])

  const scheduleRetry = useCallback(() => {
    if (
      retryTimeoutRef.current != null ||
      retryAttempt >= MAX_CARD_IMAGE_RETRY_ATTEMPTS
    ) {
      return
    }

    retryTimeoutRef.current = window.setTimeout(() => {
      retryTimeoutRef.current = null
      setRetryAttempt(previous => previous + 1)
    }, CARD_IMAGE_RETRY_DELAY_MS)
  }, [retryAttempt])

  const handleLoad = useCallback(() => {
    clearRetryTimeout()
  }, [clearRetryTimeout])

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      data-testid="environment-map-card-thumbnail"
      onLoad={handleLoad}
      onError={scheduleRetry}
    />
  )
}
