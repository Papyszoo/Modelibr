import { getFileUrl } from '@/features/models/api/modelApi'
import { resolveApiAssetUrl } from '@/lib/apiBase'

import {
  type EnvironmentMapCubeFace,
  type EnvironmentMapCubeFacesDto,
  type EnvironmentMapCubeFaceUrls,
  type EnvironmentMapDto,
  type EnvironmentMapFileDto,
  type EnvironmentMapVariantDto,
} from '../types'

export interface EnvironmentMapPreviewOption {
  key: string
  variantId?: number
  label: string
  previewUrl: string | null
  assetUrl: string | null
  fileName?: string | null
  sourceType: string
  projectionType: string
  cubeFaceUrls: EnvironmentMapCubeFaceUrls | null
}

const CUBE_FACES: EnvironmentMapCubeFace[] = [
  'px',
  'nx',
  'py',
  'ny',
  'pz',
  'nz',
]

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
    resolveApiAssetUrl(variant.panoramicFile?.previewUrl) ||
    resolveApiAssetUrl(variant.panoramicFile?.fileUrl) ||
    resolveApiAssetUrl(variant.fileUrl) ||
    (variant.fileId ? getFileUrl(variant.fileId.toString()) : null)
  )
}

function getEnvironmentMapTopLevelPreviewUrl(
  environmentMap?: EnvironmentMapDto | null
): string | null {
  if (!environmentMap) return null

  return (
    resolveApiAssetUrl(environmentMap.previewUrl) ||
    resolveApiAssetUrl(getNestedPanoramicFile(environmentMap)?.previewUrl) ||
    (environmentMap.previewFileId
      ? getFileUrl(environmentMap.previewFileId.toString())
      : null)
  )
}

export function getEnvironmentMapCustomThumbnailUrl(
  environmentMap?: EnvironmentMapDto | null
): string | null {
  if (!environmentMap) return null

  return (
    resolveApiAssetUrl(environmentMap.customThumbnailUrl) ||
    (environmentMap.customThumbnailFileId
      ? getFileUrl(environmentMap.customThumbnailFileId.toString())
      : null)
  )
}

export function getEnvironmentMapPrimaryPreviewUrl(
  environmentMap?: EnvironmentMapDto | null
): string | null {
  if (!environmentMap) return null

  const customThumbnailUrl = getEnvironmentMapCustomThumbnailUrl(environmentMap)
  if (customThumbnailUrl) {
    return customThumbnailUrl
  }

  const directPreviewUrl = getEnvironmentMapTopLevelPreviewUrl(environmentMap)

  if (directPreviewUrl) {
    return directPreviewUrl
  }

  const variants = [...(environmentMap.variants ?? [])].sort(
    (a, b) => toNormalizedSize(b.sizeLabel) - toNormalizedSize(a.sizeLabel)
  )

  return getEnvironmentMapVariantPreviewUrl(variants[0]) || null
}

export function getEnvironmentMapSizeLabels(
  environmentMap?: EnvironmentMapDto | null
): string[] {
  if (!environmentMap) {
    return []
  }

  const rawLabels = [
    ...(environmentMap.sizeLabels ?? []),
    ...(environmentMap.previewSizeLabel
      ? [environmentMap.previewSizeLabel]
      : []),
    ...(environmentMap.variants ?? []).map(variant => variant.sizeLabel),
  ]

  const normalizedLabels = rawLabels
    .map(sizeLabel => formatEnvironmentMapSizeLabel(sizeLabel))
    .filter(
      (value, index, values) =>
        value.length > 0 && values.indexOf(value) === index
    )
    .sort((left, right) => toNormalizedSize(right) - toNormalizedSize(left))

  if (normalizedLabels.length > 0) {
    return normalizedLabels
  }

  return [formatEnvironmentMapSizeLabel(null)]
}

type EnvironmentMapSourceCandidate =
  | EnvironmentMapDto
  | EnvironmentMapVariantDto
  | null
  | undefined

function getNestedPanoramicFile(
  source?: EnvironmentMapSourceCandidate
): EnvironmentMapFileDto | null {
  if (!source || typeof source !== 'object') return null

  const candidate = source.panoramicFile
  return candidate && typeof candidate === 'object' ? candidate : null
}

function getNestedCubeFaces(
  source?: EnvironmentMapSourceCandidate
): EnvironmentMapCubeFacesDto | null {
  if (!source || typeof source !== 'object') return null

  const candidate = source.cubeFaces
  return candidate && typeof candidate === 'object' ? candidate : null
}

const humanizeDescriptor = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, char => char.toUpperCase())

function getRepresentativeVariant(
  source?: EnvironmentMapSourceCandidate
): EnvironmentMapVariantDto | null {
  if (!source || !('variants' in source) || !Array.isArray(source.variants)) {
    return null
  }

  return (
    source.variants.find(variant => variant.id === source.previewVariantId) ??
    source.variants[0] ??
    null
  )
}

export function getEnvironmentMapCubeFaceUrls(
  source?: EnvironmentMapSourceCandidate
): EnvironmentMapCubeFaceUrls | null {
  if (!source) return null

  const nestedFaces =
    source.cubeFaceUrls && typeof source.cubeFaceUrls === 'object'
      ? source.cubeFaceUrls
      : null
  const typedNestedFaces = getNestedCubeFaces(source)

  const resolved = CUBE_FACES.reduce<EnvironmentMapCubeFaceUrls>(
    (acc, face) => {
      const value =
        typedNestedFaces?.[face]?.fileUrl ??
        nestedFaces?.[face] ??
        (source as Record<string, string | null | undefined>)[`${face}Url`] ??
        (source as Record<string, string | null | undefined>)[face]

      const resolvedValue = resolveApiAssetUrl(value) || value || null
      if (resolvedValue) {
        acc[face] = resolvedValue
      }
      return acc
    },
    {}
  )

  if (CUBE_FACES.every(face => Boolean(resolved[face]))) {
    return resolved
  }

  const representativeVariant = getRepresentativeVariant(source)
  return representativeVariant
    ? getEnvironmentMapCubeFaceUrls(representativeVariant)
    : null
}

export function getEnvironmentMapAssetUrl(
  source?: EnvironmentMapSourceCandidate
): string | null {
  if (!source || getEnvironmentMapCubeFaceUrls(source)) {
    return null
  }

  const sourceRecord = source as Record<
    string,
    string | number | null | undefined
  >
  const fileUrl =
    typeof sourceRecord.fileUrl === 'string' ? sourceRecord.fileUrl : null
  const fileId =
    typeof sourceRecord.fileId === 'number' ? sourceRecord.fileId : null
  const previewUrl =
    typeof sourceRecord.previewUrl === 'string' ? sourceRecord.previewUrl : null

  const resolvedAssetUrl =
    resolveApiAssetUrl(getNestedPanoramicFile(source)?.fileUrl) ||
    resolveApiAssetUrl(fileUrl) ||
    (fileId ? getFileUrl(fileId.toString()) : null) ||
    resolveApiAssetUrl(previewUrl) ||
    resolveApiAssetUrl(getNestedPanoramicFile(source)?.previewUrl) ||
    null

  if (resolvedAssetUrl) {
    return resolvedAssetUrl
  }

  const representativeVariant = getRepresentativeVariant(source)
  return representativeVariant
    ? getEnvironmentMapAssetUrl(representativeVariant)
    : null
}

export function getEnvironmentMapSourceType(
  source?: EnvironmentMapSourceCandidate
): string {
  if (!source) return 'Single'

  if (source.sourceType?.trim()) {
    return humanizeDescriptor(source.sourceType)
  }

  const representativeVariant = getRepresentativeVariant(source)
  if (representativeVariant) {
    return getEnvironmentMapSourceType(representativeVariant)
  }

  return getEnvironmentMapCubeFaceUrls(source) ? 'Cube' : 'Single'
}

export function getEnvironmentMapProjectionType(
  source?: EnvironmentMapSourceCandidate
): string {
  if (!source) return 'Equirectangular'

  if (source.projectionType?.trim()) {
    return humanizeDescriptor(source.projectionType)
  }

  const representativeVariant = getRepresentativeVariant(source)
  if (representativeVariant) {
    return getEnvironmentMapProjectionType(representativeVariant)
  }

  return getEnvironmentMapCubeFaceUrls(source) ? 'Cube' : 'Equirectangular'
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
      variantId: variant.id,
      label: formatEnvironmentMapSizeLabel(variant.sizeLabel),
      previewUrl: getEnvironmentMapVariantPreviewUrl(variant),
      assetUrl: getEnvironmentMapAssetUrl(variant),
      fileName: variant.fileName,
      sourceType: getEnvironmentMapSourceType(variant),
      projectionType: getEnvironmentMapProjectionType(variant),
      cubeFaceUrls: getEnvironmentMapCubeFaceUrls(variant),
    }))
    .filter(
      option => option.previewUrl || option.assetUrl || option.cubeFaceUrls
    )

  const directUrl = getEnvironmentMapTopLevelPreviewUrl(environmentMap) || null

  if (variants.length > 0) {
    return variants
  }

  return [
    {
      key: 'original',
      variantId: environmentMap.previewVariantId ?? undefined,
      label: 'Original',
      previewUrl: directUrl,
      assetUrl: getEnvironmentMapAssetUrl(environmentMap) || directUrl,
      fileName: environmentMap.name,
      sourceType: getEnvironmentMapSourceType(environmentMap),
      projectionType: getEnvironmentMapProjectionType(environmentMap),
      cubeFaceUrls: getEnvironmentMapCubeFaceUrls(environmentMap),
    },
  ]
}
