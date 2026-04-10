import { getFileUrl } from '@/features/models/api/modelApi'
import { resolveApiAssetUrl } from '@/lib/apiBase'

import { type EnvironmentMapDto, type EnvironmentMapVariantDto } from '../types'

export interface EnvironmentMapPreviewOption {
  key: string
  label: string
  url: string | null
}

const toNormalizedSize = (sizeLabel?: string | null): number => {
  if (!sizeLabel) return 0

  const normalizedLabel = sizeLabel.trim().toLowerCase()
  const kiloMatch = normalizedLabel.match(/^(\d+(?:\.\d+)?)k$/)
  if (kiloMatch) {
    return Math.round(Number(kiloMatch[1]) * 1024)
  }

  const pixelMatch = normalizedLabel.match(/^(\d+)px$/)
  if (pixelMatch) {
    return Number(pixelMatch[1])
  }

  const numericValue = Number(normalizedLabel)
  return Number.isFinite(numericValue) ? numericValue : 0
}

export function formatEnvironmentMapSizeLabel(
  sizeLabel?: string | null,
  fallback = 'Original'
): string {
  if (!sizeLabel) return fallback

  const normalizedLabel = sizeLabel.trim().toUpperCase()
  if (normalizedLabel.endsWith('K')) {
    return normalizedLabel
  }

  const normalizedSize = toNormalizedSize(sizeLabel)
  if (normalizedSize <= 0) return fallback

  if (normalizedSize >= 1024 && normalizedSize % 1024 === 0) {
    return `${normalizedSize / 1024}K`
  }

  return `${normalizedSize}px`
}

export function getEnvironmentMapVariantPreviewUrl(
  variant?: EnvironmentMapVariantDto | null
): string | null {
  if (!variant) return null

  return (
    resolveApiAssetUrl(variant.previewUrl) ||
    resolveApiAssetUrl(variant.fileUrl) ||
    getFileUrl(variant.fileId.toString())
  )
}

function getEnvironmentMapTopLevelPreviewUrl(
  environmentMap?: EnvironmentMapDto | null
): string | null {
  if (!environmentMap) return null

  return (
    resolveApiAssetUrl(environmentMap.previewUrl) ||
    (environmentMap.previewFileId
      ? getFileUrl(environmentMap.previewFileId.toString())
      : null)
  )
}

export function getEnvironmentMapPrimaryPreviewUrl(
  environmentMap?: EnvironmentMapDto | null
): string | null {
  if (!environmentMap) return null

  const directPreviewUrl = getEnvironmentMapTopLevelPreviewUrl(environmentMap)

  if (directPreviewUrl) {
    return directPreviewUrl
  }

  const variants = [...(environmentMap.variants ?? [])].sort(
    (a, b) => toNormalizedSize(b.sizeLabel) - toNormalizedSize(a.sizeLabel)
  )

  return getEnvironmentMapVariantPreviewUrl(variants[0]) || null
}

export function getEnvironmentMapPreviewOptions(
  environmentMap?: EnvironmentMapDto | null
): EnvironmentMapPreviewOption[] {
  if (!environmentMap) return []

  const variants = [...(environmentMap.variants ?? [])]
    .sort(
      (a, b) => toNormalizedSize(b.sizeLabel) - toNormalizedSize(a.sizeLabel)
    )
    .map((variant, index) => ({
      key: `variant-${variant.id}-${index}`,
      label: formatEnvironmentMapSizeLabel(variant.sizeLabel),
      url: getEnvironmentMapVariantPreviewUrl(variant),
    }))
    .filter(option => option.url)

  const directUrl = getEnvironmentMapTopLevelPreviewUrl(environmentMap) || null

  if (directUrl && !variants.some(option => option.url === directUrl)) {
    variants.unshift({
      key: 'original',
      label: 'Original',
      url: directUrl,
    })
  }

  if (variants.length > 0) {
    return variants
  }

  return [
    {
      key: 'original',
      label: 'Original',
      url: directUrl,
    },
  ]
}
