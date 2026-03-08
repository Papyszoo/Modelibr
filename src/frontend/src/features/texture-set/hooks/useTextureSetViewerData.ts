import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import {
  getTextureSetByIdQueryOptions,
  useTextureSetByIdQuery,
} from '@/features/texture-set/api/queries'
import { TextureType } from '@/types'

const ALL_PROXY_SIZES = [256, 512, 1024, 2048] as const

export interface QualityOption {
  label: string
  value: number
  available?: boolean
}

export function useTextureSetViewerData(textureSetId: number) {
  const queryClient = useQueryClient()
  const [originalResolution, setOriginalResolution] = useState<number | null>(
    null
  )

  const textureSetQuery = useTextureSetByIdQuery({
    textureSetId,
    queryConfig: {
      enabled: !Number.isNaN(textureSetId),
    },
  })

  const textureSet = textureSetQuery.data ?? null
  const loading = textureSetQuery.isLoading
  const error =
    textureSetQuery.error instanceof Error ? textureSetQuery.error.message : ''

  const { refetch } = textureSetQuery
  const refreshTextureSet = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: getTextureSetByIdQueryOptions(textureSetId).queryKey,
    })
    await refetch()
  }, [queryClient, textureSetId, refetch])

  // Detect original texture resolution by probing the first non-SplitChannel texture
  useEffect(() => {
    if (!textureSet?.textures?.length) return
    const firstTex = textureSet.textures.find(
      t => t.textureType !== TextureType.SplitChannel
    )
    if (!firstTex) return

    const img = new Image()
    img.onload = () => {
      setOriginalResolution(Math.max(img.naturalWidth, img.naturalHeight))
    }
    img.src = getFileUrl(firstTex.fileId.toString())
    return () => {
      img.onload = null
    }
  }, [textureSet])

  // Gather available proxy sizes across all textures in the set
  const availableSizes = useMemo(() => {
    if (!textureSet) return new Set<number>()
    const sizes = new Set<number>()
    for (const tex of textureSet.textures) {
      if (tex.textureType === TextureType.SplitChannel) continue
      for (const proxy of tex.proxies ?? []) {
        sizes.add(proxy.size)
      }
    }
    return sizes
  }, [textureSet])

  // Build quality dropdown options — show actual resolution, filter duplicates
  const qualityOptions = useMemo<QualityOption[]>(() => {
    const origLabel = originalResolution
      ? `${originalResolution} px`
      : 'Full Resolution'
    const options: QualityOption[] = [
      { label: origLabel, value: 0, available: true },
    ]
    for (const size of ALL_PROXY_SIZES) {
      if (originalResolution && size === originalResolution) continue
      if (originalResolution && size >= originalResolution) continue
      options.push({
        label: `${size} px`,
        value: size,
        available: availableSizes.has(size),
      })
    }
    return options
  }, [availableSizes, originalResolution])

  return {
    textureSet,
    loading,
    error,
    refreshTextureSet,
    originalResolution,
    availableSizes,
    qualityOptions,
  }
}
