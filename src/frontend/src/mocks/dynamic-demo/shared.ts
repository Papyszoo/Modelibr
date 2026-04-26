import { HttpResponse } from 'msw'

import {
  addRecycledItem,
  addUploadHistory,
  type DemoCategory,
  type DemoEnvironmentMap,
  type DemoEnvironmentMapCubeFaces,
  type DemoEnvironmentMapFile,
  type DemoEnvironmentMapVariant,
  type DemoModel,
  type DemoModelVersion,
  type DemoPack,
  type DemoProject,
  type DemoSound,
  type DemoSprite,
  type DemoTextureSet,
  findRecycledItem,
  getAll,
  getAllRecycledItems,
  getAllUploadHistory,
  getById,
  getDb,
  getFileBlob,
  getThumbnail,
  getVersionsByModelId,
  nextId,
  put,
  remove,
  removeRecycledItem,
  removeThumbnail,
  storeFileBlob,
  storeThumbnail,
} from '../db/demoDb'
import {
  generateEnvironmentMapThumbnail,
  generateExrChannelPreview,
  generateHdrChannelPreview,
  generateImageChannelPreview,
  generateModelThumbnail,
  generateModelThumbnailWithTextures,
  generatePlaceholderThumbnail,
  generateWaveformThumbnail,
  type TextureMapData,
} from '../services/browserAssetProcessor'

export {
  addRecycledItem,
  findRecycledItem,
  generateExrChannelPreview,
  generateHdrChannelPreview,
  generateImageChannelPreview,
  generateModelThumbnail,
  generatePlaceholderThumbnail,
  generateWaveformThumbnail,
  getAll,
  getAllRecycledItems,
  getAllUploadHistory,
  getById,
  getFileBlob,
  getThumbnail,
  getVersionsByModelId,
  nextId,
  put,
  remove,
  removeRecycledItem,
  removeThumbnail,
  storeFileBlob,
  storeThumbnail,
}

export type {
  DemoCategory,
  DemoEnvironmentMap,
  DemoModel,
  DemoModelVersion,
  DemoPack,
  DemoProject,
  DemoSound,
  DemoSprite,
  DemoTextureSet,
  TextureMapData,
}

// ─── Helpers ────────────────────────────────────────────────────────────

const DEMO_BASE = import.meta.env.BASE_URL ?? '/Modelibr/demo/'
export const assetUrl = (file: string) => `${DEMO_BASE}demo-assets/${file}`
export const thumbnailUrl = (file: string) =>
  `${DEMO_BASE}demo-assets/thumbnails/${file}`
export const seedAssetUrl = (file: string) =>
  file.startsWith('hdri/') ? `${DEMO_BASE}${file}` : assetUrl(file)

/**
 * Infer a sensible MIME type for a File/Blob when `file.type` is missing.
 * Falls back to the provided `fallback` when unknown.
 */
export function inferMimeType(
  file: File | Blob | null,
  fileName?: string,
  fallback = 'application/octet-stream'
): string {
  const t = file?.type || ''
  if (t) return t
  const name = fileName || (file instanceof File ? file.name : '')
  const ext = name.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'exr':
      return 'image/x-exr'
    case 'hdr':
      return 'image/vnd.radiance'
    case 'wav':
      return 'audio/wav'
    case 'ogg':
      return 'audio/ogg'
    case 'mp3':
      return 'audio/mpeg'
    case 'glb':
      return 'model/gltf-binary'
    case 'gltf':
      return 'model/gltf+json'
    default:
      return fallback
  }
}

// Map seed file IDs to static asset paths (for pre-seeded data)
export const seedFileAssets: Record<number, string> = {
  101: 'test-cube.glb',
  102: 'test-cone.fbx',
  103: 'test-cylinder.fbx',
  104: 'test-icosphere.fbx',
  105: 'test-torus.fbx',
  201: 'texture.png',
  202: 'texture_albedo.png',
  203: 'texture_blue.png',
  204: 'texture_orm.png',
  205: 'red_color.png',
  206: 'blue_color.png',
  207: 'green_color.png',
  208: 'black_color.png',
  209: 'pink_color.png',
  210: 'yellow_color.png',
  301: 'global texture/diffuse.jpg',
  302: 'global texture/normal.exr',
  303: 'global texture/roughness.exr',
  304: 'global texture/displacement.png',
  401: 'texture.png',
  402: 'texture_albedo.png',
  501: 'test-tone.wav',
  601: 'hdri/potsdamer_platz_1k.hdr',
  602: 'hdri/potsdamer_platz_1k.hdr',
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    totalCount: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
  }
}

export function now() {
  return new Date().toISOString()
}

/**
 * Fetch a static asset from the public directory and return it as an
 * HttpResponse. This avoids using HttpResponse.redirect() which does not
 * work reliably inside a ServiceWorker for sub-resource requests (images).
 */
export async function fetchStaticAsset(
  url: string,
  contentType?: string
): Promise<Response> {
  try {
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return new HttpResponse(null, { status: 404 })
    const blob = await res.blob()
    return new HttpResponse(blob, {
      headers: {
        'Content-Type':
          contentType ?? (blob.type || 'application/octet-stream'),
      },
    })
  } catch {
    return new HttpResponse(null, { status: 404 })
  }
}

/**
 * Serve a file by ID — check IndexedDB first (user uploads), fall back to
 * seed static assets.
 */
export async function serveFile(fileId: number): Promise<Response> {
  const stored = await getFileBlob(fileId)
  if (stored) {
    return new HttpResponse(stored.blob, {
      headers: { 'Content-Type': stored.mimeType },
    })
  }
  const seedPath = seedFileAssets[fileId]
  if (seedPath) {
    return fetchStaticAsset(seedAssetUrl(seedPath))
  }
  return new HttpResponse(null, { status: 404 })
}

/** Parse textureType from a string name (e.g. "Albedo") or numeric string to its enum number. */
const textureTypeMap: Record<string, number> = {
  albedo: 1,
  normal: 2,
  roughness: 5,
  metallic: 6,
  ao: 7,
  ambientocclusion: 7,
  emissive: 8,
  opacity: 9,
  height: 10,
  specular: 11,
  displacement: 12,
  orm: 13,
}
export function parseTextureType(raw: string | null | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!isNaN(n)) return n
  return textureTypeMap[raw.toLowerCase()] ?? 1
}

// ─── Recycled Items (persisted to IndexedDB) ────────────────────────────

// ─── Upload History (persisted to IndexedDB) ─────────────────────────────

interface UploadHistoryEntry {
  id: number
  batchId: string
  uploadType: string
  uploadedAt: string
  fileId: number
  fileName: string
  packId: number | null
  packName: string | null
  projectId: number | null
  projectName: string | null
  modelId: number | null
  modelName: string | null
  textureSetId: number | null
  textureSetName: string | null
  spriteId: number | null
  spriteName: string | null
  environmentMapId?: number | null
  environmentMapName?: string | null
}

export async function trackUpload(
  entry: Omit<UploadHistoryEntry, 'id' | 'uploadedAt'>
) {
  const id = await nextId('uploadHistory')
  const full: UploadHistoryEntry = {
    ...entry,
    id,
    uploadedAt: now(),
  }
  await addUploadHistory(full)
}

/** Recalculate pack counts from its association arrays. */
export function recomputePackCounts(pack: DemoPack) {
  pack.modelCount = pack.models.length
  pack.textureSetCount = pack.textureSets.length
  pack.spriteCount = pack.sprites.length
  pack.soundCount = pack.sounds.length
  pack.environmentMapCount = (pack.environmentMaps ?? []).length
  pack.isEmpty =
    pack.modelCount +
      pack.textureSetCount +
      pack.spriteCount +
      pack.soundCount +
      (pack.environmentMapCount ?? 0) ===
    0
}

export function recomputeProjectCounts(project: DemoProject) {
  project.modelCount = project.models.length
  project.textureSetCount = project.textureSets.length
  project.spriteCount = project.sprites.length
  project.soundCount = project.sounds.length
  project.environmentMapCount = (project.environmentMaps ?? []).length
  project.isEmpty =
    project.modelCount +
      project.textureSetCount +
      project.spriteCount +
      project.soundCount +
      (project.environmentMapCount ?? 0) ===
    0
}

export function getActiveEnvironmentMapVariants(
  environmentMap: DemoEnvironmentMap
) {
  return (environmentMap.variants ?? []).filter(variant => !variant.isDeleted)
}

const ENVIRONMENT_MAP_CUBE_FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const

function parseEnvironmentMapFileId(fileUrl?: string | null): number | null {
  if (!fileUrl) return null

  const match = fileUrl.match(/\/files\/(\d+)/)
  if (!match) return null

  const fileId = Number(match[1])
  return Number.isFinite(fileId) ? fileId : null
}

function buildDemoEnvironmentMapFile(
  fileId: number,
  fileName: string,
  fileSizeBytes: number,
  fileUrl?: string | null,
  previewUrl?: string | null
): DemoEnvironmentMapFile {
  return {
    fileId,
    fileName,
    fileSizeBytes,
    previewUrl: previewUrl ?? `/files/${fileId}/preview?channel=rgb`,
    fileUrl: fileUrl ?? `/files/${fileId}`,
  }
}

function getEnvironmentMapCubeFaces(
  variant: DemoEnvironmentMapVariant
): DemoEnvironmentMapCubeFaces | null {
  if (variant.cubeFaces) {
    return variant.cubeFaces
  }

  const cubeFaceUrls = variant.cubeFaceUrls ?? null
  if (!cubeFaceUrls) {
    return null
  }

  const faces = ENVIRONMENT_MAP_CUBE_FACES.map(face => {
    const fileUrl = cubeFaceUrls[face]
    const fileId = parseEnvironmentMapFileId(fileUrl)
    if (!fileUrl || !fileId) {
      return null
    }

    return [
      face,
      buildDemoEnvironmentMapFile(
        fileId,
        `${variant.fileName || 'Cube map'}_${face}`,
        0,
        fileUrl,
        `/files/${fileId}/preview?channel=rgb`
      ),
    ] as const
  })

  if (faces.some(face => face === null)) {
    return null
  }

  return Object.fromEntries(
    faces as Array<
      readonly [
        (typeof ENVIRONMENT_MAP_CUBE_FACES)[number],
        DemoEnvironmentMapFile,
      ]
    >
  ) as DemoEnvironmentMapCubeFaces
}

function getEnvironmentMapCubeFaceUrls(
  variant?: DemoEnvironmentMapVariant | null
): Partial<
  Record<(typeof ENVIRONMENT_MAP_CUBE_FACES)[number], string | null>
> | null {
  if (!variant) return null

  if (variant.cubeFaceUrls) {
    return variant.cubeFaceUrls
  }

  const cubeFaces = getEnvironmentMapCubeFaces(variant)
  if (!cubeFaces) {
    return null
  }

  return {
    px: cubeFaces.px.fileUrl,
    nx: cubeFaces.nx.fileUrl,
    py: cubeFaces.py.fileUrl,
    ny: cubeFaces.ny.fileUrl,
    pz: cubeFaces.pz.fileUrl,
    nz: cubeFaces.nz.fileUrl,
  }
}

function getEnvironmentMapPanoramicFile(
  variant: DemoEnvironmentMapVariant
): DemoEnvironmentMapFile | null {
  if (variant.panoramicFile) {
    return variant.panoramicFile
  }

  if (!variant.fileId) {
    return null
  }

  return buildDemoEnvironmentMapFile(
    variant.fileId,
    variant.fileName,
    variant.fileSizeBytes,
    variant.fileUrl
  )
}

function getEnvironmentMapVariantSourceType(
  variant?: DemoEnvironmentMapVariant | null
) {
  if (!variant) return 'single'
  return (
    variant.sourceType ??
    (getEnvironmentMapCubeFaces(variant) ? 'cube' : 'single')
  )
}

function getEnvironmentMapVariantProjectionType(
  variant?: DemoEnvironmentMapVariant | null
) {
  if (!variant) return 'equirectangular'
  return (
    variant.projectionType ??
    (getEnvironmentMapCubeFaces(variant) ? 'cube' : 'equirectangular')
  )
}

function getEnvironmentMapVariantPreviewFileId(
  variant?: DemoEnvironmentMapVariant | null
) {
  if (!variant) return null

  return (
    variant.previewFileId ??
    variant.panoramicFile?.fileId ??
    getEnvironmentMapCubeFaces(variant)?.px.fileId ??
    variant.fileId ??
    null
  )
}

export function syncEnvironmentMapDerivedFields(
  environmentMap: DemoEnvironmentMap
): DemoEnvironmentMap {
  const variants = getActiveEnvironmentMapVariants(environmentMap)
  const previewVariant =
    variants.find(variant => variant.id === environmentMap.previewVariantId) ??
    variants[0] ??
    null
  const representativeVariant = previewVariant ?? variants[0] ?? null

  environmentMap.variantCount = variants.length
  environmentMap.previewVariantId = previewVariant?.id ?? null
  environmentMap.previewSizeLabel = previewVariant?.sizeLabel ?? null
  environmentMap.previewFileId =
    getEnvironmentMapVariantPreviewFileId(previewVariant)
  environmentMap.previewUrl = previewVariant
    ? `/environment-maps/${environmentMap.id}/preview`
    : null
  environmentMap.sourceType = getEnvironmentMapVariantSourceType(
    representativeVariant
  )
  environmentMap.projectionType = getEnvironmentMapVariantProjectionType(
    representativeVariant
  )
  environmentMap.panoramicFile = representativeVariant
    ? getEnvironmentMapPanoramicFile(representativeVariant)
    : null
  environmentMap.cubeFaces = representativeVariant
    ? getEnvironmentMapCubeFaces(representativeVariant)
    : null
  environmentMap.cubeFaceUrls = getEnvironmentMapCubeFaceUrls(
    representativeVariant
  )

  return environmentMap
}

export function toEnvironmentMapDto(environmentMap: DemoEnvironmentMap) {
  const synced = syncEnvironmentMapDerivedFields({ ...environmentMap })

  return {
    ...synced,
    previewFileId: synced.previewFileId ?? null,
    previewUrl: synced.previewUrl ?? null,
    customThumbnailFileId: synced.customThumbnailFileId ?? null,
    customThumbnailUrl: synced.customThumbnailUrl ?? null,
    categoryId: synced.categoryId ?? null,
    previewSizeLabel: synced.previewSizeLabel ?? null,
    tags: synced.tags ?? [],
    sourceType: synced.sourceType ?? 'single',
    projectionType: synced.projectionType ?? 'equirectangular',
    cubeFaceUrls: synced.cubeFaceUrls ?? null,
    panoramicFile: synced.panoramicFile ?? null,
    cubeFaces: synced.cubeFaces ?? null,
    variants: getActiveEnvironmentMapVariants(synced).map(variant => ({
      ...variant,
      previewFileId: getEnvironmentMapVariantPreviewFileId(variant),
      fileId:
        getEnvironmentMapVariantSourceType(variant) === 'cube'
          ? null
          : (variant.fileId ?? variant.panoramicFile?.fileId ?? null),
      fileName:
        getEnvironmentMapVariantSourceType(variant) === 'cube'
          ? 'Cube map'
          : variant.fileName,
      previewUrl: getEnvironmentMapVariantPreviewFileId(variant)
        ? `/environment-maps/${synced.id}/variants/${variant.id}/preview`
        : null,
      fileUrl:
        getEnvironmentMapVariantSourceType(variant) === 'cube'
          ? null
          : (variant.fileUrl ?? variant.panoramicFile?.fileUrl ?? null),
      sourceType: getEnvironmentMapVariantSourceType(variant),
      projectionType: getEnvironmentMapVariantProjectionType(variant),
      cubeFaceUrls: getEnvironmentMapCubeFaceUrls(variant),
      panoramicFile:
        getEnvironmentMapVariantSourceType(variant) === 'cube'
          ? null
          : getEnvironmentMapPanoramicFile(variant),
      cubeFaces: getEnvironmentMapCubeFaces(variant),
    })),
    packs: synced.packs ?? [],
    projects: synced.projects ?? [],
  }
}

export function buildCategoryPath(
  category: DemoCategory,
  categories: DemoCategory[]
): string {
  const segments: string[] = []
  let current: DemoCategory | undefined = category
  while (current) {
    segments.unshift(current.name)
    current = current.parentId
      ? categories.find(item => item.id === current?.parentId)
      : undefined
  }
  return segments.join(' / ')
}

export async function enrichModel(model: DemoModel, stringId = false) {
  const versions = await getVersionsByModelId(model.id)
  const latestVersion = versions.reduce<DemoModelVersion | null>(
    (latest, version) => {
      if (!latest || version.versionNumber > latest.versionNumber) {
        return version
      }
      return latest
    },
    null
  )

  const categories = model.categoryId ? await getAll('modelCategories') : []
  const category = model.categoryId
    ? categories.find(item => item.id === model.categoryId)
    : null

  const categoryDto = category
    ? {
        id: category.id,
        name: category.name,
        description: category.description ?? undefined,
        parentId: category.parentId ?? null,
        path: buildCategoryPath(category, categories),
      }
    : null

  const conceptImages = model.conceptImages ?? []

  return {
    ...model,
    id: stringId ? String(model.id) : model.id,
    categoryId: model.categoryId ?? null,
    category: categoryDto,
    categoryPath: categoryDto?.path ?? null,
    conceptImages,
    conceptImageCount: conceptImages.length,
    hasConceptImages: conceptImages.length > 0,
    technicalMetadata: {
      latestVersionId: latestVersion?.id ?? null,
      latestVersionNumber: latestVersion?.versionNumber ?? null,
      triangleCount: latestVersion?.triangleCount ?? null,
      vertexCount: latestVersion?.vertexCount ?? null,
      meshCount: latestVersion?.meshCount ?? null,
      materialCount: latestVersion?.materialCount ?? null,
      updatedAt: latestVersion?.technicalDetailsUpdatedAt ?? null,
    },
    latestVersionId: latestVersion?.id ?? null,
    latestVersionNumber: latestVersion?.versionNumber ?? null,
    triangleCount: latestVersion?.triangleCount ?? null,
    vertexCount: latestVersion?.vertexCount ?? null,
    meshCount: latestVersion?.meshCount ?? null,
    materialCount: latestVersion?.materialCount ?? null,
  }
}

export function buildConceptImage(
  fileId: number,
  fileName: string,
  mimeType?: string
) {
  return {
    fileId,
    fileName,
    previewUrl: `/files/${fileId}/preview?channel=rgb`,
    fileUrl: `/files/${fileId}`,
    sortOrder: 0,
    mimeType,
  }
}

// Background thumbnail generation — fire and forget
export function generateModelThumbnailAsync(
  modelId: number,
  fileBlob: Blob,
  fileName?: string,
  textures?: TextureMapData[]
) {
  const gen =
    textures && textures.length > 0
      ? generateModelThumbnailWithTextures(
          fileBlob,
          textures,
          256,
          256,
          fileName
        )
      : generateModelThumbnail(fileBlob, 256, 256, fileName)
  gen
    .then(thumb => storeThumbnail(`model:${modelId}`, thumb))
    .catch(() => {
      // Silently ignore — thumbnail will just be missing
    })
}

export function generateVersionThumbnailAsync(
  versionId: number,
  fileBlob: Blob,
  fileName?: string,
  textures?: TextureMapData[]
) {
  const gen =
    textures && textures.length > 0
      ? generateModelThumbnailWithTextures(
          fileBlob,
          textures,
          256,
          256,
          fileName
        )
      : generateModelThumbnail(fileBlob, 256, 256, fileName)
  gen
    .then(thumb => storeThumbnail(`version:${versionId}`, thumb))
    .catch(() => {})
}

export function generateEnvironmentMapThumbnailAsync(
  envMapId: number,
  fileBlob: Blob,
  fileName: string,
  variantId?: number
) {
  generateEnvironmentMapThumbnail(fileBlob, fileName)
    .then(preview => {
      const writes: Promise<void>[] = [
        storeThumbnail(`envMapPreview:${envMapId}`, preview),
      ]
      if (variantId) {
        writes.push(
          storeThumbnail(`envMapVariantPreview:${variantId}`, preview)
        )
      }
      return Promise.all(writes)
    })
    .catch(() => {})
}

export function generateEnvironmentMapVariantThumbnailAsync(
  variantId: number,
  fileBlob: Blob,
  fileName: string
) {
  generateEnvironmentMapThumbnail(fileBlob, fileName)
    .then(preview =>
      storeThumbnail(`envMapVariantPreview:${variantId}`, preview)
    )
    .catch(() => {})
}

/** Fetch texture blobs for a version's texture mappings (for the main variant). */
export async function getVersionTextureMaps(
  version: DemoModelVersion
): Promise<TextureMapData[]> {
  const mainVariant = version.mainVariantName ?? ''
  // "__embedded__" means use the model's original materials — skip texture maps
  if (mainVariant === '__embedded__') return []
  // Get mappings for the main variant (or empty variant name)
  const mappings = version.textureMappings.filter(
    m => m.variantName === mainVariant || m.variantName === ''
  )
  if (mappings.length === 0) return []

  const results: TextureMapData[] = []
  for (const mapping of mappings) {
    const ts = await getById('textureSets', mapping.textureSetId)
    if (!ts) continue
    for (const tex of ts.textures) {
      // Only include key texture types for thumbnails
      if (![1, 2, 5, 6].includes(tex.textureType)) continue
      const fileBlob = await getFileBlob(tex.fileId)
      if (fileBlob) {
        results.push({ textureType: tex.textureType, blob: fileBlob.blob })
        continue
      }
      // Fall back to static seed assets (seed texture files are not stored in IDB)
      const seedPath = seedFileAssets[tex.fileId]
      if (seedPath) {
        try {
          const res = await fetch(assetUrl(seedPath), { cache: 'force-cache' })
          if (res.ok) {
            results.push({
              textureType: tex.textureType,
              blob: await res.blob(),
            })
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return results
}

export function toPackDto(pack: DemoPack) {
  return {
    ...pack,
    environmentMapCount: pack.environmentMapCount ?? 0,
    environmentMaps: pack.environmentMaps ?? [],
    licenseType: pack.licenseType ?? '',
    url: pack.url ?? '',
    customThumbnailFileId: pack.customThumbnailFileId ?? null,
    customThumbnailUrl: pack.customThumbnailUrl ?? null,
  }
}

export function toProjectDto(project: DemoProject) {
  const conceptImages = project.conceptImages ?? []

  return {
    ...project,
    notes: project.notes ?? '',
    environmentMapCount: project.environmentMapCount ?? 0,
    environmentMaps: project.environmentMaps ?? [],
    customThumbnailFileId: project.customThumbnailFileId ?? null,
    customThumbnailUrl: project.customThumbnailUrl ?? null,
    conceptImages,
    conceptImageCount: conceptImages.length,
  }
}

export async function ensureDemoDataShape(): Promise<void> {
  const models = await getAll('models')
  for (const model of models) {
    let changed = false

    if (!Array.isArray(model.tags)) {
      model.tags = []
      changed = true
    }
    if (!Array.isArray(model.conceptImages)) {
      model.conceptImages = []
      changed = true
    }
    if (!Array.isArray(model.textureSets)) {
      model.textureSets = []
      changed = true
    }
    if (!Array.isArray(model.packs)) {
      model.packs = []
      changed = true
    }
    if (!Array.isArray(model.projects)) {
      model.projects = []
      changed = true
    }
    if (typeof model.categoryId === 'undefined') {
      model.categoryId = null
      changed = true
    }
    if (model.id === 1 && (model.conceptImages?.length ?? 0) === 0) {
      model.conceptImages = [
        buildConceptImage(205, 'red_color.png', 'image/png'),
      ]
      changed = true
    }

    if (changed) {
      await put('models', model)
    }
  }

  const packs = await getAll('packs')
  for (const pack of packs) {
    let changed = false

    if (typeof pack.licenseType !== 'string') {
      pack.licenseType = ''
      changed = true
    }
    if (typeof pack.url !== 'string') {
      pack.url = ''
      changed = true
    }
    if (!Array.isArray(pack.models)) {
      pack.models = []
      changed = true
    }
    if (!Array.isArray(pack.textureSets)) {
      pack.textureSets = []
      changed = true
    }
    if (!Array.isArray(pack.sprites)) {
      pack.sprites = []
      changed = true
    }
    if (!Array.isArray(pack.sounds)) {
      pack.sounds = []
      changed = true
    }
    if (!Array.isArray(pack.environmentMaps)) {
      pack.environmentMaps = []
      changed = true
    }
    if (typeof pack.environmentMapCount !== 'number') {
      pack.environmentMapCount = pack.environmentMaps.length
      changed = true
    }
    if (typeof pack.customThumbnailFileId === 'undefined') {
      pack.customThumbnailFileId = null
      changed = true
    }
    if (typeof pack.customThumbnailUrl === 'undefined') {
      pack.customThumbnailUrl = null
      changed = true
    }
    if (pack.id === 1 && !pack.customThumbnailUrl) {
      pack.customThumbnailFileId = 206
      pack.customThumbnailUrl = '/files/206/preview?channel=rgb'
      changed = true
    }

    const previousSignature = [
      pack.modelCount,
      pack.textureSetCount,
      pack.spriteCount,
      pack.soundCount,
      pack.environmentMapCount,
      pack.isEmpty,
    ].join(':')
    recomputePackCounts(pack)
    const nextSignature = [
      pack.modelCount,
      pack.textureSetCount,
      pack.spriteCount,
      pack.soundCount,
      pack.environmentMapCount,
      pack.isEmpty,
    ].join(':')
    if (previousSignature !== nextSignature) {
      changed = true
    }

    if (changed) {
      await put('packs', pack)
    }
  }

  const projects = await getAll('projects')
  for (const project of projects) {
    let changed = false

    if (typeof project.notes !== 'string') {
      project.notes = ''
      changed = true
    }
    if (!Array.isArray(project.conceptImages)) {
      project.conceptImages = []
      changed = true
    }
    if (!Array.isArray(project.models)) {
      project.models = []
      changed = true
    }
    if (!Array.isArray(project.textureSets)) {
      project.textureSets = []
      changed = true
    }
    if (!Array.isArray(project.sprites)) {
      project.sprites = []
      changed = true
    }
    if (!Array.isArray(project.sounds)) {
      project.sounds = []
      changed = true
    }
    if (!Array.isArray(project.environmentMaps)) {
      project.environmentMaps = []
      changed = true
    }
    if (typeof project.environmentMapCount !== 'number') {
      project.environmentMapCount = project.environmentMaps.length
      changed = true
    }
    if (typeof project.customThumbnailFileId === 'undefined') {
      project.customThumbnailFileId = null
      changed = true
    }
    if (typeof project.customThumbnailUrl === 'undefined') {
      project.customThumbnailUrl = null
      changed = true
    }
    if (project.id === 1 && !project.customThumbnailUrl) {
      project.customThumbnailFileId = 207
      project.customThumbnailUrl = '/files/207/preview?channel=rgb'
      changed = true
    }
    if (project.id === 1 && (project.conceptImages?.length ?? 0) === 0) {
      project.conceptImages = [
        buildConceptImage(210, 'yellow_color.png', 'image/png'),
      ]
      changed = true
    }

    const previousSignature = [
      project.modelCount,
      project.textureSetCount,
      project.spriteCount,
      project.soundCount,
      project.environmentMapCount,
      project.isEmpty,
    ].join(':')
    recomputeProjectCounts(project)
    const nextSignature = [
      project.modelCount,
      project.textureSetCount,
      project.spriteCount,
      project.soundCount,
      project.environmentMapCount,
      project.isEmpty,
    ].join(':')
    if (previousSignature !== nextSignature) {
      changed = true
    }

    if (changed) {
      await put('projects', project)
    }
  }

  const sounds = await getAll('sounds')
  for (const sound of sounds) {
    let changed = false

    if (
      sound.id === 1 &&
      sound.name === 'Test Tone' &&
      sound.categoryId !== null
    ) {
      sound.categoryId = null
      changed = true
    }

    if (
      sound.id === 1 &&
      sound.name === 'Test Tone' &&
      sound.categoryName !== null
    ) {
      sound.categoryName = null
      changed = true
    }

    // Fix broken waveform sentinel URLs from older demo data
    if (sound.waveformUrl && sound.waveformUrl.startsWith('__demo_waveform_')) {
      sound.waveformUrl = `/sounds/${sound.id}/waveform`
      changed = true
    }

    if (changed) {
      await put('sounds', sound)
    }
  }

  const environmentMaps = await getAll('environmentMaps')
  if (environmentMaps.length === 0) {
    const ts = now()
    const seedEnvironmentMaps: DemoEnvironmentMap[] = [
      {
        id: 1,
        name: 'City Night Lights',
        variantCount: 2,
        previewVariantId: 1,
        previewFileId: 601,
        previewUrl: '/files/601/preview?channel=rgb',
        createdAt: ts,
        updatedAt: ts,
        variants: [
          {
            id: 1,
            sizeLabel: '1K',
            fileId: 601,
            fileName: 'potsdamer_platz_1k.hdr',
            fileSizeBytes: 0,
            createdAt: ts,
            updatedAt: ts,
            isDeleted: false,
            previewUrl: '/files/601/preview?channel=rgb',
            fileUrl: '/files/601',
          },
          {
            id: 2,
            sizeLabel: '2K',
            fileId: 602,
            fileName: 'potsdamer_platz_2k.exr',
            fileSizeBytes: 0,
            createdAt: ts,
            updatedAt: ts,
            isDeleted: false,
            previewUrl: '/files/602/preview?channel=rgb',
            fileUrl: '/files/602',
          },
        ],
        packs: [{ id: 1, name: 'Demo Pack' }],
        projects: [{ id: 1, name: 'Demo Project' }],
      },
    ]

    for (const environmentMap of seedEnvironmentMaps) {
      await put('environmentMaps', environmentMap)
    }

    const pack1 = await getById('packs', 1)
    if (pack1) {
      pack1.environmentMaps = [{ id: 1, name: 'City Night Lights' }]
      recomputePackCounts(pack1)
      await put('packs', pack1)
    }
    const project1 = await getById('projects', 1)
    if (project1) {
      project1.environmentMaps = [{ id: 1, name: 'City Night Lights' }]
      recomputeProjectCounts(project1)
      await put('projects', project1)
    }
  } else {
    for (const environmentMap of environmentMaps) {
      let changed = false
      if (!Array.isArray(environmentMap.variants)) {
        environmentMap.variants = []
        changed = true
      }
      if (!Array.isArray(environmentMap.packs)) {
        environmentMap.packs = []
        changed = true
      }
      if (!Array.isArray(environmentMap.projects)) {
        environmentMap.projects = []
        changed = true
      }

      const signature = [
        environmentMap.variantCount,
        environmentMap.previewVariantId,
        environmentMap.previewFileId,
        environmentMap.previewUrl,
      ].join(':')
      syncEnvironmentMapDerivedFields(environmentMap)
      const nextSignature = [
        environmentMap.variantCount,
        environmentMap.previewVariantId,
        environmentMap.previewFileId,
        environmentMap.previewUrl,
      ].join(':')
      if (signature !== nextSignature) {
        changed = true
      }

      if (changed) {
        await put('environmentMaps', environmentMap)
      }
    }
  }

  // Remove defunct "Neutral Studio" env map (id: 2) for existing users
  const neutralStudio = await getById('environmentMaps', 2)
  if (neutralStudio && neutralStudio.name === 'Neutral Studio') {
    const db = await getDb()
    await db.delete('environmentMaps', 2)
    // Clean up pack/project references
    const packs = await getAll('packs')
    for (const pack of packs) {
      if (pack.environmentMaps?.some((e: { id: number }) => e.id === 2)) {
        pack.environmentMaps = pack.environmentMaps.filter(
          (e: { id: number }) => e.id !== 2
        )
        recomputePackCounts(pack)
        await put('packs', pack)
      }
    }
    const projects = await getAll('projects')
    for (const project of projects) {
      if (project.environmentMaps?.some((e: { id: number }) => e.id === 2)) {
        project.environmentMaps = project.environmentMaps.filter(
          (e: { id: number }) => e.id !== 2
        )
        recomputeProjectCounts(project)
        await put('projects', project)
      }
    }
  }
}

export async function prewarmSeedThumbnails(): Promise<void> {
  const seedItems = [
    { modelId: 1, versionId: 1, fileId: 101, fileName: 'test-cube.glb' },
    { modelId: 2, versionId: 2, fileId: 102, fileName: 'test-cone.fbx' },
    { modelId: 3, versionId: 3, fileId: 103, fileName: 'test-cylinder.fbx' },
    { modelId: 4, versionId: 4, fileId: 104, fileName: 'test-icosphere.fbx' },
    { modelId: 5, versionId: 5, fileId: 105, fileName: 'test-torus.fbx' },
  ]

  for (const { modelId, versionId, fileId, fileName } of seedItems) {
    const modelKey = `model:${modelId}`
    const existing = await getThumbnail(modelKey)
    if (existing) {
      continue
    }

    const seedPath = seedFileAssets[fileId]
    if (!seedPath) {
      continue
    }

    try {
      const response = await fetch(seedAssetUrl(seedPath), {
        cache: 'force-cache',
      })
      if (!response.ok) {
        continue
      }

      const blob = await response.blob()
      const thumbnail = await generateModelThumbnail(blob, 256, 256, fileName)
      await storeThumbnail(modelKey, thumbnail)
      await storeThumbnail(`version:${versionId}`, thumbnail)
    } catch {
      // Silently ignore — thumbnail requests will still generate on demand.
    }
  }
}

/**
 * Pre-generate environment map preview thumbnails for seed data.
 * Uses the same fire-and-forget pattern as model thumbnail pre-warming.
 */
export async function prewarmSeedEnvironmentMapThumbnails(): Promise<void> {
  const seedItems = [
    {
      envMapId: 1,
      variantId: 1,
      fileId: 601,
      fileName: 'potsdamer_platz_1k.hdr',
      isPreviewVariant: true,
    },
    {
      envMapId: 1,
      variantId: 2,
      fileId: 601,
      fileName: 'potsdamer_platz_1k.hdr',
      isPreviewVariant: false,
    },
  ]

  for (const {
    envMapId,
    variantId,
    fileId,
    fileName,
    isPreviewVariant,
  } of seedItems) {
    const variantKey = `envMapVariantPreview:${variantId}`
    const mapKey = `envMapPreview:${envMapId}`

    const existingVariant = await getThumbnail(variantKey)
    const existingMap = isPreviewVariant ? await getThumbnail(mapKey) : null
    if (existingVariant && (!isPreviewVariant || existingMap)) continue

    const seedPath = seedFileAssets[fileId]
    if (!seedPath) continue

    try {
      const response = await fetch(seedAssetUrl(seedPath), {
        cache: 'force-cache',
      })
      if (!response.ok) continue

      const blob = await response.blob()
      const preview = await generateEnvironmentMapThumbnail(blob, fileName)
      await storeThumbnail(variantKey, preview)
      if (isPreviewVariant) {
        await storeThumbnail(mapKey, preview)
      }
    } catch {
      // Silently ignore — preview requests will still generate on demand.
    }
  }
}

/**
 * Pre-generate waveform thumbnails for seed sounds.
 */
export async function prewarmSeedSoundWaveforms(): Promise<void> {
  const seedItems = [{ soundId: 1, fileId: 501, fileName: 'test-tone.wav' }]

  for (const { soundId, fileId, fileName } of seedItems) {
    const cacheKey = `waveform:${soundId}`
    const existing = await getThumbnail(cacheKey)
    if (existing) continue

    const seedPath = seedFileAssets[fileId]
    if (!seedPath) continue

    try {
      const response = await fetch(assetUrl(seedPath), {
        cache: 'force-cache',
      })
      if (!response.ok) continue

      const fileBlob = new File([await response.blob()], fileName, {
        type: 'audio/wav',
      })
      const result = await generateWaveformThumbnail(fileBlob)
      await storeThumbnail(cacheKey, result.thumbnail)

      // Update the sound record with waveform data
      const sound = await getById('sounds', soundId)
      if (sound) {
        sound.duration = result.duration
        sound.peaks = JSON.stringify(result.peaks)
        sound.waveformUrl = `/sounds/${soundId}/waveform`
        await put('sounds', sound)
      }
    } catch {
      // Silently ignore — waveform will show placeholder.
    }
  }
}
