import { type DataTexture, type Texture } from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { RGBELoader } from 'three-stdlib'

import {
  type EnvironmentMapCubeFace,
  type EnvironmentMapCubeFaceUrls,
} from '@/features/environment-map/types'

export interface EnvironmentMapUploadItem {
  kind: 'single' | 'cube'
  name: string
  sizeLabel?: string
  file?: File
  cubeFaces?: Record<EnvironmentMapCubeFace, File>
  thumbnailFile?: File | null
}

const CUBE_FACE_PATTERN = /(^|[\s._-])(px|nx|py|ny|pz|nz)(?=($|[\s._-]))/i

const CUBE_FACE_ORDER: EnvironmentMapCubeFace[] = [
  'px',
  'nx',
  'py',
  'ny',
  'pz',
  'nz',
]

const STANDARD_SIZE_LABELS = new Map<number, string>([
  [1024, '1K'],
  [2048, '2K'],
  [4096, '4K'],
  [8192, '8K'],
  [16384, '16K'],
  [32768, '32K'],
])

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '')
}

function normalizeName(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function toUploadName(fileName: string) {
  return normalizeName(stripExtension(fileName)) || 'Environment Map'
}

function getCubeFaceMatch(fileName: string) {
  const match = stripExtension(fileName).match(CUBE_FACE_PATTERN)
  return match?.[2]?.toLowerCase() as EnvironmentMapCubeFace | undefined
}

function getCubeGroupKey(fileName: string, face: EnvironmentMapCubeFace) {
  const baseName = stripExtension(fileName)
  const normalized = baseName
    .replace(
      new RegExp(`(^|[\\s._-])${face}($|[\\s._-])`, 'i'),
      (_match, prefix, suffix) => `${prefix}${suffix}`
    )
    .replace(/[\s._-]+/g, ' ')
    .trim()

  return normalized || baseName
}

function getEnvironmentMapFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function getTextureDimensions(texture: Texture | DataTexture) {
  const candidate = texture as Texture & {
    image?: { width?: number; height?: number } | null
    source?: { data?: { width?: number; height?: number } }
  }

  const width = candidate.image?.width ?? candidate.source?.data?.width ?? 0
  const height = candidate.image?.height ?? candidate.source?.data?.height ?? 0

  return width > 0 && height > 0 ? { width, height } : null
}

async function loadStandardImageDimensions(file: File) {
  if (typeof createImageBitmap === 'function') {
    const imageBitmap = await createImageBitmap(file)
    try {
      return { width: imageBitmap.width, height: imageBitmap.height }
    } finally {
      imageBitmap.close()
    }
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    return await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image()
        image.onload = () =>
          resolve({
            width: image.naturalWidth,
            height: image.naturalHeight,
          })
        image.onerror = () =>
          reject(new Error('Unable to read image dimensions'))
        image.src = objectUrl
      }
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function loadHdrDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const texture = await new RGBELoader().loadAsync(objectUrl)
    const dimensions = getTextureDimensions(texture)
    texture.dispose()

    if (!dimensions) {
      throw new Error('Unable to read HDR dimensions')
    }

    return dimensions
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function loadExrDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file)

  try {
    const texture = await new EXRLoader().loadAsync(objectUrl)
    const dimensions = getTextureDimensions(texture)
    texture.dispose()

    if (!dimensions) {
      throw new Error('Unable to read EXR dimensions')
    }

    return dimensions
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export function getDroppedCubeFaceFiles(files: File[]) {
  return files.reduce<Partial<Record<EnvironmentMapCubeFace, File>>>(
    (acc, file) => {
      const face = getCubeFaceMatch(file.name)
      if (face && !acc[face]) {
        acc[face] = file
      }

      return acc
    },
    {}
  )
}

export function getCubeFaceUploadName(files: File[]) {
  const firstMatchedFile = files.find(file =>
    Boolean(getCubeFaceMatch(file.name))
  )
  if (!firstMatchedFile) {
    return 'Environment Map'
  }

  const face = getCubeFaceMatch(firstMatchedFile.name)
  if (!face) {
    return toUploadName(firstMatchedFile.name)
  }

  return (
    normalizeName(getCubeGroupKey(firstMatchedFile.name, face)) ||
    'Environment Map'
  )
}

export function formatInferredEnvironmentMapSizeLabel(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return ''
  }

  const roundedSize = Math.round(size)
  return STANDARD_SIZE_LABELS.get(roundedSize) ?? `${roundedSize}px`
}

export async function inferEnvironmentMapSizeLabel(
  file?: File | null,
  cubeFaces?: Partial<Record<EnvironmentMapCubeFace, File | null>>
): Promise<string | null> {
  const files = file
    ? [file]
    : (Object.values(cubeFaces ?? {}).filter(Boolean) as File[])
  const isCubeSource = !file && files.length > 1

  if (files.length === 0) {
    return null
  }

  try {
    const dimensions = await Promise.all(
      files.map(candidate => {
        const extension = getEnvironmentMapFileExtension(candidate.name)
        if (extension === 'hdr') {
          return loadHdrDimensions(candidate)
        }

        if (extension === 'exr') {
          return loadExrDimensions(candidate)
        }

        return loadStandardImageDimensions(candidate)
      })
    )

    const maxDimension = Math.max(
      ...dimensions.map(({ width, height }) => Math.max(width, height))
    )

    return formatInferredEnvironmentMapSizeLabel(
      isCubeSource ? maxDimension * 4 : maxDimension
    )
  } catch {
    return null
  }
}

export function prepareEnvironmentMapUploadItems(
  files: File[]
): EnvironmentMapUploadItem[] {
  const cubeGroups = new Map<
    string,
    {
      faces: Partial<Record<EnvironmentMapCubeFace, File>>
      duplicates: Set<EnvironmentMapCubeFace>
      firstIndex: number
    }
  >()
  const consumedFiles = new Set<File>()

  files.forEach((file, index) => {
    const face = getCubeFaceMatch(file.name)
    if (!face) {
      return
    }

    const groupKey = getCubeGroupKey(file.name, face)
    const existing = cubeGroups.get(groupKey) ?? {
      faces: {},
      duplicates: new Set<EnvironmentMapCubeFace>(),
      firstIndex: index,
    }

    if (existing.faces[face]) {
      existing.duplicates.add(face)
    } else {
      existing.faces[face] = file
      existing.firstIndex = Math.min(existing.firstIndex, index)
    }

    cubeGroups.set(groupKey, existing)
  })

  const items = [...cubeGroups.entries()]
    .filter(([, group]) => {
      const hasAllFaces = CUBE_FACE_ORDER.every(face => group.faces[face])
      return hasAllFaces && group.duplicates.size === 0
    })
    .sort((left, right) => left[1].firstIndex - right[1].firstIndex)
    .map(([groupKey, group]) => {
      CUBE_FACE_ORDER.forEach(face => {
        const file = group.faces[face]
        if (file) {
          consumedFiles.add(file)
        }
      })

      return {
        kind: 'cube' as const,
        name: normalizeName(groupKey) || 'Environment Map',
        cubeFaces: group.faces as Record<EnvironmentMapCubeFace, File>,
      }
    })

  const singleItems = files
    .filter(file => !consumedFiles.has(file))
    .map(file => ({
      kind: 'single' as const,
      name: toUploadName(file.name),
      file,
    }))

  return [...items, ...singleItems]
}

export function toCubeFaceFiles(
  cubeFaces: EnvironmentMapCubeFaceUrls | Record<EnvironmentMapCubeFace, File>
) {
  return CUBE_FACE_ORDER.map(face => cubeFaces[face]).filter(Boolean)
}
