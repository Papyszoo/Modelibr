import { useCallback, useEffect, useRef, useState } from 'react'

import { EquirectangularReflectionMapping } from 'three'
import type { DataTexture } from 'three'
import { RGBELoader } from 'three-stdlib'

import {
  BUNDLED_HDR_PATH,
  BUNDLED_PRESET,
  ENVIRONMENT_PRESETS,
  getCachedPresets,
  resolveHdrUrl,
} from '@/features/model-viewer/utils/environmentPresets'

export interface EnvironmentAvailability {
  /** Whether the browser is currently online. */
  isOnline: boolean
  /** Set of presets that are available (bundled or cached). */
  availablePresets: Set<string>
  /** The loaded HDR environment map texture, or null while loading. */
  envMap: DataTexture | null
  /** Whether the HDR is still being fetched/resolved. */
  loading: boolean
  /** The effective preset name (may differ from requested if fallback occurred). */
  effectivePreset: string
}

/**
 * Manages environment preset availability based on online/offline status
 * and Cache API state. Loads the HDR texture via RGBELoader and returns
 * it directly — this avoids drei's extension-detection which fails on
 * blob URLs.
 */
export function useEnvironmentPresets(
  requestedPreset: string
): EnvironmentAvailability {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [availablePresets, setAvailablePresets] = useState<Set<string>>(
    () => new Set([BUNDLED_PRESET])
  )
  const [envMap, setEnvMap] = useState<DataTexture | null>(null)
  const [loading, setLoading] = useState(false)
  const [effectivePreset, setEffectivePreset] = useState(requestedPreset)
  const prevTexture = useRef<DataTexture | null>(null)

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Refresh cached presets when online status changes
  const refreshAvailability = useCallback(async () => {
    const cached = await getCachedPresets()
    // When online, all presets are available (can be fetched)
    if (navigator.onLine) {
      setAvailablePresets(new Set(ENVIRONMENT_PRESETS))
    } else {
      setAvailablePresets(cached)
    }
  }, [])

  useEffect(() => {
    void refreshAvailability()
  }, [isOnline, refreshAvailability])

  // Resolve and load HDR texture when preset changes
  useEffect(() => {
    let cancelled = false

    async function resolve() {
      setLoading(true)

      const url = await resolveHdrUrl(requestedPreset)
      if (cancelled) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
        return
      }

      const loader = new RGBELoader()
      loader.load(
        url,
        texture => {
          if (cancelled) {
            texture.dispose()
            if (url.startsWith('blob:')) URL.revokeObjectURL(url)
            return
          }

          texture.mapping = EquirectangularReflectionMapping

          // Dispose the previous texture
          if (prevTexture.current) prevTexture.current.dispose()
          prevTexture.current = texture

          setEnvMap(texture)
          setLoading(false)
          setEffectivePreset(requestedPreset)

          if (url.startsWith('blob:')) URL.revokeObjectURL(url)
          void refreshAvailability()
        },
        undefined,
        () => {
          // Loading failed — fall back to bundled city preset
          if (cancelled) {
            if (url.startsWith('blob:')) URL.revokeObjectURL(url)
            return
          }

          if (url.startsWith('blob:')) URL.revokeObjectURL(url)

          if (requestedPreset !== BUNDLED_PRESET) {
            const fallbackLoader = new RGBELoader()
            fallbackLoader.load(BUNDLED_HDR_PATH, texture => {
              if (cancelled) {
                texture.dispose()
                return
              }
              texture.mapping = EquirectangularReflectionMapping
              if (prevTexture.current) prevTexture.current.dispose()
              prevTexture.current = texture
              setEnvMap(texture)
              setLoading(false)
              setEffectivePreset(BUNDLED_PRESET)
            })
          } else {
            setLoading(false)
          }
        }
      )
    }

    void resolve()

    return () => {
      cancelled = true
    }
  }, [requestedPreset, refreshAvailability])

  // Cleanup texture on unmount
  useEffect(() => {
    return () => {
      if (prevTexture.current) {
        prevTexture.current.dispose()
        prevTexture.current = null
      }
    }
  }, [])

  return { isOnline, availablePresets, envMap, loading, effectivePreset }
}
