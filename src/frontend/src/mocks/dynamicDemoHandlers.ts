/**
 * Dynamic Demo MSW Handlers
 *
 * These handlers intercept all frontend API calls and route them to the
 * local IndexedDB database (demoDb). Write operations actually persist
 * data. File uploads are stored as Blobs in IndexedDB. Thumbnail
 * generation is triggered in-browser via browserAssetProcessor.
 */
import { http, HttpResponse } from 'msw'

import {
  addRecycledItem,
  addUploadHistory,
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
  getFileBlob,
  getThumbnail,
  getVersionsByModelId,
  nextId,
  put,
  remove,
  removeRecycledItem,
  storeFileBlob,
  storeThumbnail,
} from './db/demoDb'
import {
  generateExrChannelPreview,
  generateImageChannelPreview,
  generateModelThumbnail,
  generateModelThumbnailWithTextures,
  generatePlaceholderThumbnail,
  generateWaveformThumbnail,
  type TextureMapData,
} from './services/browserAssetProcessor'

// ─── Helpers ────────────────────────────────────────────────────────────

const DEMO_BASE = import.meta.env.BASE_URL ?? '/Modelibr/demo/'
const assetUrl = (file: string) => `${DEMO_BASE}demo-assets/${file}`
const thumbnailUrl = (file: string) =>
  `${DEMO_BASE}demo-assets/thumbnails/${file}`

// Map seed file IDs to static asset paths (for pre-seeded data)
const seedFileAssets: Record<number, string> = {
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
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    totalCount: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
  }
}

function now() {
  return new Date().toISOString()
}

/**
 * Fetch a static asset from the public directory and return it as an
 * HttpResponse. This avoids using HttpResponse.redirect() which does not
 * work reliably inside a ServiceWorker for sub-resource requests (images).
 */
async function fetchStaticAsset(
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
async function serveFile(fileId: number): Promise<Response> {
  const stored = await getFileBlob(fileId)
  if (stored) {
    return new HttpResponse(stored.blob, {
      headers: { 'Content-Type': stored.mimeType },
    })
  }
  const seedPath = seedFileAssets[fileId]
  if (seedPath) {
    return fetchStaticAsset(assetUrl(seedPath))
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
function parseTextureType(raw: string | null | undefined): number {
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
}

async function trackUpload(
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
function recomputePackCounts(pack: DemoPack) {
  pack.modelCount = pack.models.length
  pack.textureSetCount = pack.textureSets.length
  pack.spriteCount = pack.sprites.length
  pack.soundCount = pack.sounds.length
  pack.isEmpty =
    pack.modelCount +
      pack.textureSetCount +
      pack.spriteCount +
      pack.soundCount ===
    0
}

function recomputeProjectCounts(project: DemoProject) {
  project.modelCount = project.models.length
  project.textureSetCount = project.textureSets.length
  project.spriteCount = project.sprites.length
  project.soundCount = project.sounds.length
  project.isEmpty =
    project.modelCount +
      project.textureSetCount +
      project.spriteCount +
      project.soundCount ===
    0
}

// Background thumbnail generation — fire and forget
function generateModelThumbnailAsync(
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

function generateVersionThumbnailAsync(
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

/** Fetch texture blobs for a version's texture mappings (for the main variant). */
async function getVersionTextureMaps(
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

// ─── Handlers ───────────────────────────────────────────────────────────

export const dynamicDemoHandlers = [
  // ════════════════════════════════════════════════════════════════════════
  //  MODELS
  // ════════════════════════════════════════════════════════════════════════

  // List models (paginated or flat)
  http.get('*/models', async ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    const textureSetId = url.searchParams.get('textureSetId')

    let models = await getAll('models')

    if (packId) {
      const pack = await getById('packs', Number(packId))
      if (pack) {
        const ids = new Set(pack.models.map(m => m.id))
        models = models.filter(m => ids.has(m.id))
      }
    }
    if (projectId) {
      const project = await getById('projects', Number(projectId))
      if (project) {
        const ids = new Set(project.models.map(m => m.id))
        models = models.filter(m => ids.has(m.id))
      }
    }
    if (textureSetId) {
      models = models.filter(m =>
        m.textureSets?.some(ts => ts.id === Number(textureSetId))
      )
    }

    if (url.searchParams.has('page')) {
      const result = paginate(models, page, pageSize)
      return HttpResponse.json({
        items: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }
    return HttpResponse.json(models)
  }),

  // Get single model
  http.get('*/models/:id/file', async ({ params }) => {
    const model = await getById('models', Number(params.id))
    if (!model?.files[0]) return new HttpResponse(null, { status: 404 })
    return serveFile(model.files[0].id)
  }),

  http.get('*/models/:id/thumbnail/file', async ({ params }) => {
    const id = Number(params.id)
    const thumb = await getThumbnail(`model:${id}`)
    if (thumb) {
      return new HttpResponse(thumb, {
        headers: { 'Content-Type': thumb.type || 'image/webp' },
      })
    }
    // Generate a real thumbnail for seed models on first request
    const model = await getById('models', id)
    if (model?.files[0]) {
      const fileId = model.files[0].id
      const fileName = model.files[0].originalFileName
      try {
        let blob: Blob | undefined
        const stored = await getFileBlob(fileId)
        if (stored) {
          blob = stored.blob
        } else {
          const seedPath = seedFileAssets[fileId]
          if (seedPath) {
            const res = await fetch(assetUrl(seedPath), {
              cache: 'force-cache',
            })
            if (res.ok) blob = await res.blob()
          }
        }
        if (blob) {
          const thumbnail = await generateModelThumbnail(
            blob,
            256,
            256,
            fileName
          )
          await storeThumbnail(`model:${id}`, thumbnail)
          return new HttpResponse(thumbnail, {
            headers: { 'Content-Type': thumbnail.type || 'image/webp' },
          })
        }
      } catch {
        // fall through to placeholder
      }
    }
    // Generate placeholder
    const placeholder = await generatePlaceholderThumbnail()
    return new HttpResponse(placeholder, {
      headers: { 'Content-Type': 'image/png' },
    })
  }),

  http.get('*/models/:id/thumbnail', async ({ params }) => {
    const id = Number(params.id)
    const model = await getById('models', id)
    // Also check if a thumbnail exists (e.g. recycled models still have thumbnails)
    if (!model) {
      const thumb = await getThumbnail(`model:${id}`)
      if (thumb) {
        return HttpResponse.json({
          status: 'Ready',
          sizeBytes: thumb.size,
          width: 256,
          height: 256,
        })
      }
      return new HttpResponse(null, { status: 404 })
    }
    return HttpResponse.json({
      status: 'Ready',
      sizeBytes: 4096,
      width: 256,
      height: 256,
      createdAt: model.createdAt,
      processedAt: model.createdAt,
    })
  }),

  http.get('*/models/:id', async ({ params }) => {
    const model = await getById('models', Number(params.id))
    if (!model) return new HttpResponse(null, { status: 404 })
    // Return with string id for compatibility
    return HttpResponse.json({ ...model, id: String(model.id) })
  }),

  // Upload a new model (multipart form)
  http.post('*/models', async ({ request }) => {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file)
      return HttpResponse.json({ error: 'No file provided' }, { status: 400 })

    const modelId = await nextId('models')
    const fileId = await nextId('files')
    const versionId = await nextId('modelVersions')
    const ext = file.name.split('.').pop() ?? ''
    const isRenderable = ['glb', 'gltf', 'fbx', 'obj'].includes(
      ext.toLowerCase()
    )
    const ts = now()

    const demoFile = {
      id: fileId,
      originalFileName: file.name,
      storedFileName: file.name,
      filePath: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      sha256Hash: `demo-${fileId}`,
      fileType: ext.toLowerCase(),
      isRenderable,
      createdAt: ts,
      updatedAt: ts,
    }

    const model: DemoModel = {
      id: modelId,
      name: file.name.replace(/\.[^.]+$/, ''),
      description: '',
      tags: '',
      files: [demoFile],
      createdAt: ts,
      updatedAt: ts,
      activeVersionId: versionId,
      defaultTextureSetId: null,
      textureSets: [],
      packs: [],
    }

    const version: DemoModelVersion = {
      id: versionId,
      modelId,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: ts,
      defaultTextureSetId: null,
      thumbnailUrl: null,
      pngThumbnailUrl: null,
      files: [
        {
          id: fileId,
          originalFileName: file.name,
          mimeType: demoFile.mimeType,
          fileType: demoFile.fileType,
          sizeBytes: file.size,
          isRenderable,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: '',
      variantNames: [],
      textureMappings: [],
      textureSetIds: [],
    }

    // Store file blob, model, and version
    await storeFileBlob(fileId, file, file.name, demoFile.mimeType)
    await put('models', model)
    await put('modelVersions', version)

    // Track upload
    const batchId = `batch-${Date.now()}`
    trackUpload({
      batchId,
      uploadType: 'Model',
      fileId,
      fileName: file.name,
      packId: null,
      packName: null,
      projectId: null,
      projectName: null,
      modelId,
      modelName: model.name,
      textureSetId: null,
      textureSetName: null,
      spriteId: null,
      spriteName: null,
    })

    // Generate thumbnail in background
    if (isRenderable && ['glb', 'fbx'].includes(ext.toLowerCase())) {
      generateModelThumbnailAsync(modelId, file, file.name)
      generateVersionThumbnailAsync(versionId, file, file.name)
    }

    return HttpResponse.json(
      { id: modelId, alreadyExists: false },
      { status: 201 }
    )
  }),

  // Update model (tags/description)
  http.post('*/models/:id/tags', async ({ params, request }) => {
    const model = await getById('models', Number(params.id))
    if (!model) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      tags?: string
      description?: string
    }
    model.tags = body.tags ?? model.tags
    model.description = body.description ?? model.description
    model.updatedAt = now()
    await put('models', model)
    return HttpResponse.json({
      modelId: model.id,
      tags: model.tags,
      description: model.description,
    })
  }),

  // Delete model (soft) → move to recycled
  http.delete('*//:host/models/:id', async ({ params }) => {
    const id = Number(params.id)
    const model = await getById('models', id)
    if (model) {
      const recycledId = await nextId('recycledItems')
      await addRecycledItem({
        id: recycledId,
        type: 'model',
        entityId: id,
        name: model.name,
        deletedAt: now(),
        entity: { ...model } as unknown as Record<string, unknown>,
        extra: { fileCount: model.files.length },
      })
      // Clean up pack/project associations
      const packs = await getAll('packs')
      for (const pack of packs) {
        const before = pack.models.length
        pack.models = pack.models.filter(m => m.id !== id)
        if (pack.models.length !== before) {
          recomputePackCounts(pack)
          await put('packs', pack)
        }
      }
      const projects = await getAll('projects')
      for (const proj of projects) {
        const before = proj.models.length
        proj.models = proj.models.filter(m => m.id !== id)
        if (proj.models.length !== before) {
          recomputeProjectCounts(proj)
          await put('projects', proj)
        }
      }
    }
    await remove('models', id)
    return new HttpResponse(null, { status: 204 })
  }),

  // Set default texture set
  http.put('*/models/:id/default-texture-set', async ({ params, request }) => {
    const model = await getById('models', Number(params.id))
    if (!model) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { TextureSetId: number | null }
    model.defaultTextureSetId = body.TextureSetId
    model.updatedAt = now()
    await put('models', model)
    return HttpResponse.json({
      modelId: model.id,
      defaultTextureSetId: model.defaultTextureSetId,
    })
  }),

  // Regenerate thumbnail
  http.post('*/models/:id/thumbnail/regenerate', async ({ params }) => {
    const model = await getById('models', Number(params.id))
    if (!model?.files[0]) return new HttpResponse(null, { status: 404 })
    const fileBlob = await getFileBlob(model.files[0].id)
    if (fileBlob) {
      // Find the active version to get texture mappings
      const versions = await getVersionsByModelId(model.id)
      const activeVersion =
        versions.find(v => v.id === model.activeVersionId) ?? versions[0]
      const textureMaps = activeVersion
        ? await getVersionTextureMaps(activeVersion)
        : []
      generateModelThumbnailAsync(
        model.id,
        fileBlob.blob,
        fileBlob.fileName,
        textureMaps
      )
      if (activeVersion) {
        generateVersionThumbnailAsync(
          activeVersion.id,
          fileBlob.blob,
          fileBlob.fileName,
          textureMaps
        )
      }
    }
    return HttpResponse.json({ status: 'Processing' })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  MODEL VERSIONS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/models/:modelId/versions', async ({ params }) => {
    const versions = await getVersionsByModelId(Number(params.modelId))
    return HttpResponse.json(versions)
  }),

  http.post('*/models/:modelId/versions', async ({ params, request }) => {
    const modelId = Number(params.modelId)
    const model = await getById('models', modelId)
    if (!model) return new HttpResponse(null, { status: 404 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

    const fileId = await nextId('files')
    const versionId = await nextId('modelVersions')
    const ext = file.name.split('.').pop() ?? ''
    const isRenderable = ['glb', 'gltf', 'fbx', 'obj'].includes(
      ext.toLowerCase()
    )
    const ts = now()

    const existing = await getVersionsByModelId(modelId)
    const nextVersionNum =
      existing.length > 0
        ? Math.max(...existing.map(v => v.versionNumber)) + 1
        : 1

    const version: DemoModelVersion = {
      id: versionId,
      modelId,
      versionNumber: nextVersionNum,
      description: new URL(request.url).searchParams.get('description') ?? '',
      createdAt: ts,
      defaultTextureSetId: null,
      thumbnailUrl: null,
      pngThumbnailUrl: null,
      files: [
        {
          id: fileId,
          originalFileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileType: ext.toLowerCase(),
          sizeBytes: file.size,
          isRenderable,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: [],
      textureMappings: [],
      textureSetIds: [],
    }

    await storeFileBlob(
      fileId,
      file,
      file.name,
      file.type || 'application/octet-stream'
    )
    await put('modelVersions', version)

    // Update model active version
    model.activeVersionId = versionId
    model.updatedAt = ts
    await put('models', model)

    if (isRenderable && ['glb', 'fbx'].includes(ext.toLowerCase())) {
      generateVersionThumbnailAsync(versionId, file, file.name)
    }

    return HttpResponse.json(
      { versionId, versionNumber: nextVersionNum, fileId },
      { status: 201 }
    )
  }),

  http.post(
    '*/models/:modelId/active-version/:versionId',
    async ({ params }) => {
      const model = await getById('models', Number(params.modelId))
      if (!model) return new HttpResponse(null, { status: 404 })
      model.activeVersionId = Number(params.versionId)
      model.updatedAt = now()
      await put('models', model)
      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.delete('*/models/:modelId/versions/:versionId', async ({ params }) => {
    await remove('modelVersions', Number(params.versionId))
    return new HttpResponse(null, { status: 204 })
  }),

  // Version thumbnail
  http.get('*/model-versions/:id/thumbnail', async () => {
    return HttpResponse.json({
      status: 'Ready',
      sizeBytes: 4096,
      width: 256,
      height: 256,
    })
  }),

  http.get('*/model-versions/:id/thumbnail/file', async ({ params }) => {
    const versionId = Number(params.id)
    const thumb = await getThumbnail(`version:${versionId}`)
    if (thumb) {
      return new HttpResponse(thumb, {
        headers: { 'Content-Type': thumb.type || 'image/webp' },
      })
    }
    // Generate a real thumbnail for seed versions on first request
    const allVersions = await getAll('modelVersions')
    const version = allVersions.find(v => v.id === versionId)
    if (version?.files[0]) {
      const fileId = version.files[0].id
      const fileName = version.files[0].originalFileName
      try {
        let blob: Blob | undefined
        const stored = await getFileBlob(fileId)
        if (stored) {
          blob = stored.blob
        } else {
          const seedPath = seedFileAssets[fileId]
          if (seedPath) {
            const res = await fetch(assetUrl(seedPath), {
              cache: 'force-cache',
            })
            if (res.ok) blob = await res.blob()
          }
        }
        if (blob) {
          const thumbnail = await generateModelThumbnail(
            blob,
            256,
            256,
            fileName
          )
          await storeThumbnail(`version:${versionId}`, thumbnail)
          return new HttpResponse(thumbnail, {
            headers: { 'Content-Type': thumbnail.type || 'image/webp' },
          })
        }
      } catch {
        // fall through to placeholder
      }
    }
    const placeholder = await generatePlaceholderThumbnail()
    return new HttpResponse(placeholder, {
      headers: { 'Content-Type': 'image/png' },
    })
  }),

  // Version file URL
  http.get('*/model-versions/:versionId/files/:fileId', async ({ params }) => {
    return serveFile(Number(params.fileId))
  }),

  // Version file URL (alternative pattern used by frontend)
  http.get(
    '*/models/:modelId/versions/:versionId/files/:fileId',
    async ({ params }) => {
      return serveFile(Number(params.fileId))
    }
  ),

  // Variant management
  http.put('*/model-versions/:id/main-variant', async ({ params, request }) => {
    const version = await getById('modelVersions', Number(params.id))
    if (!version) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { variantName: string }
    version.mainVariantName = body.variantName
    await put('modelVersions', version)
    // Regenerate thumbnail when main variant changes
    const fileId = version.files[0]?.id
    if (fileId) {
      const stored = await getFileBlob(fileId)
      let blob: Blob | undefined = stored?.blob
      if (!blob) {
        const seedPath = seedFileAssets[fileId]
        if (seedPath) {
          try {
            const res = await fetch(assetUrl(seedPath), {
              cache: 'force-cache',
            })
            if (res.ok) blob = await res.blob()
          } catch {
            // ignore
          }
        }
      }
      if (blob) {
        const fileName = version.files[0]?.originalFileName
        const textureMaps = await getVersionTextureMaps(version)
        generateModelThumbnailAsync(
          version.modelId,
          blob,
          fileName,
          textureMaps
        )
        generateVersionThumbnailAsync(version.id, blob, fileName, textureMaps)
      }
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/model-versions/:id/variants', async ({ params, request }) => {
    const version = await getById('modelVersions', Number(params.id))
    if (!version) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { variantName: string }
    if (!version.variantNames.includes(body.variantName)) {
      version.variantNames.push(body.variantName)
      await put('modelVersions', version)
    }
    return HttpResponse.json({ variantName: body.variantName }, { status: 201 })
  }),

  http.delete('*/model-versions/:id/variants/:name', async ({ params }) => {
    const version = await getById('modelVersions', Number(params.id))
    if (!version) return new HttpResponse(null, { status: 404 })
    version.variantNames = version.variantNames.filter(
      v => v !== String(params.name)
    )
    await put('modelVersions', version)
    return new HttpResponse(null, { status: 204 })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  FILES
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/files/:id', async ({ params }) => {
    return serveFile(Number(params.id))
  }),

  http.get('*/files/:id/preview', async ({ params, request }) => {
    const fileId = Number(params.id)
    const url = new URL(request.url)
    const channel = url.searchParams.get('channel') || 'rgb'

    // Determine the file name to detect EXR
    let fileName: string | undefined
    const stored = await getFileBlob(fileId)
    if (stored) {
      fileName = stored.fileName
    } else {
      const seedPath = seedFileAssets[fileId]
      if (seedPath) {
        fileName = seedPath.split('/').pop()
      }
    }

    const isExr = fileName?.toLowerCase().endsWith('.exr')
    const isImage =
      !isExr && /\.(png|jpg|jpeg|webp|bmp|gif)$/i.test(fileName ?? '')

    if (isExr || (isImage && channel !== 'rgb')) {
      try {
        // Get the raw file blob
        let blob: Blob
        if (stored) {
          blob = stored.blob
        } else {
          const seedPath = seedFileAssets[fileId]
          if (!seedPath) return new HttpResponse(null, { status: 404 })
          const res = await fetch(assetUrl(seedPath), { cache: 'force-cache' })
          if (!res.ok) return new HttpResponse(null, { status: 404 })
          blob = await res.blob()
        }

        const preview = isExr
          ? await generateExrChannelPreview(blob, channel)
          : await generateImageChannelPreview(blob, channel)
        return new HttpResponse(preview, {
          headers: { 'Content-Type': 'image/png' },
        })
      } catch {
        return new HttpResponse(null, { status: 404 })
      }
    }

    // For standard images with channel=rgb, serve the raw file
    return serveFile(fileId)
  }),

  http.post('*/files', async ({ request }) => {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

    const fileId = await nextId('files')
    await storeFileBlob(
      fileId,
      file,
      file.name,
      file.type || 'application/octet-stream'
    )
    return HttpResponse.json({ fileId, alreadyExists: false }, { status: 201 })
  }),

  http.delete('*/files/:id', async () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  TEXTURE SETS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/texture-sets', async ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    const kind = url.searchParams.get('kind')

    let sets = await getAll('textureSets')

    if (packId) {
      const pack = await getById('packs', Number(packId))
      if (pack) {
        const ids = new Set(pack.textureSets.map(ts => ts.id))
        sets = sets.filter(ts => ids.has(ts.id))
      }
    }
    if (projectId) {
      const project = await getById('projects', Number(projectId))
      if (project) {
        const ids = new Set(project.textureSets.map(ts => ts.id))
        sets = sets.filter(ts => ids.has(ts.id))
      }
    }
    if (kind !== null && kind !== undefined) {
      sets = sets.filter(ts => ts.kind === Number(kind))
    }

    if (url.searchParams.has('page')) {
      const result = paginate(sets, page, pageSize)
      return HttpResponse.json({
        textureSets: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }
    return HttpResponse.json({ textureSets: sets })
  }),

  http.get('*/texture-sets/by-file/:fileId', async () => {
    return HttpResponse.json({ textureSetId: null })
  }),

  http.get('*/texture-sets/:id/thumbnail/file', async ({ params }) => {
    const id = Number(params.id)
    const thumb = await getThumbnail(`textureSet:${id}`)
    if (thumb) {
      return new HttpResponse(thumb, {
        headers: { 'Content-Type': 'image/png' },
      })
    }
    return fetchStaticAsset(thumbnailUrl('global-material.png'), 'image/png')
  }),

  http.get('*/texture-sets/:id', async ({ params }) => {
    const ts = await getById('textureSets', Number(params.id))
    if (!ts) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(ts)
  }),

  http.post('*/texture-sets/with-file', async ({ request }) => {
    const url = new URL(request.url)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

    const tsId = await nextId('textureSets')
    const fileId = await nextId('files')
    const textureId = await nextId('textures')
    const ts = now()
    const name =
      url.searchParams.get('name') || file.name.replace(/\.[^.]+$/, '')
    const textureType = parseTextureType(url.searchParams.get('textureType'))
    const kind = Number(url.searchParams.get('kind') || '0')

    await storeFileBlob(fileId, file, file.name, file.type || 'image/png')

    const textureSet: DemoTextureSet = {
      id: tsId,
      name,
      kind,
      tilingScaleX: 1,
      tilingScaleY: 1,
      uvMappingMode: 0,
      uvScale: 1,
      createdAt: ts,
      updatedAt: ts,
      textureCount: 1,
      isEmpty: false,
      thumbnailPath: null,
      pngThumbnailPath: null,
      textures: [
        {
          id: textureId,
          textureType,
          sourceChannel: 5,
          fileId,
          fileName: file.name,
          createdAt: ts,
          proxies: [],
        },
      ],
      associatedModels: [],
      packs: [],
    }
    await put('textureSets', textureSet)

    // Track upload
    trackUpload({
      batchId: `batch-${Date.now()}`,
      uploadType: 'TextureSet',
      fileId,
      fileName: file.name,
      packId: null,
      packName: null,
      projectId: null,
      projectName: null,
      modelId: null,
      modelName: null,
      textureSetId: tsId,
      textureSetName: name,
      spriteId: null,
      spriteName: null,
    })

    return HttpResponse.json(
      {
        textureSetId: tsId,
        name,
        fileId,
        textureId,
        textureType: String(textureType),
      },
      { status: 201 }
    )
  }),

  http.post('*/texture-sets', async ({ request }) => {
    const body = (await request.json()) as { name: string; kind?: number }
    const tsId = await nextId('textureSets')
    const ts = now()
    const kind = body.kind ?? 0

    const textureSet: DemoTextureSet = {
      id: tsId,
      name: body.name,
      kind,
      tilingScaleX: 1,
      tilingScaleY: 1,
      uvMappingMode: 0,
      uvScale: 1,
      createdAt: ts,
      updatedAt: ts,
      textureCount: 0,
      isEmpty: true,
      thumbnailPath: null,
      pngThumbnailPath: null,
      textures: [],
      associatedModels: [],
      packs: [],
    }
    await put('textureSets', textureSet)
    return HttpResponse.json(
      { id: tsId, name: body.name, kind },
      { status: 201 }
    )
  }),

  http.put('*/texture-sets/:id/tiling-scale', async ({ params, request }) => {
    const ts = await getById('textureSets', Number(params.id))
    if (!ts) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      tilingScaleX: number
      tilingScaleY: number
      uvMappingMode?: number
      uvScale?: number
    }
    ts.tilingScaleX = body.tilingScaleX
    ts.tilingScaleY = body.tilingScaleY
    if (body.uvMappingMode !== undefined) ts.uvMappingMode = body.uvMappingMode
    if (body.uvScale !== undefined) ts.uvScale = body.uvScale
    ts.updatedAt = now()
    await put('textureSets', ts)
    return HttpResponse.json({
      id: ts.id,
      tilingScaleX: ts.tilingScaleX,
      tilingScaleY: ts.tilingScaleY,
      uvMappingMode: ts.uvMappingMode,
      uvScale: ts.uvScale,
    })
  }),

  http.put('*/texture-sets/:id/kind', async ({ params, request }) => {
    const ts = await getById('textureSets', Number(params.id))
    if (!ts) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { kind: number }
    ts.kind = body.kind
    ts.updatedAt = now()
    await put('textureSets', ts)
    return new HttpResponse(null, { status: 204 })
  }),

  http.put('*/texture-sets/:id', async ({ params, request }) => {
    const ts = await getById('textureSets', Number(params.id))
    if (!ts) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { name: string }
    ts.name = body.name
    ts.updatedAt = now()
    await put('textureSets', ts)
    return HttpResponse.json({ id: ts.id, name: ts.name })
  }),

  http.delete('*//:host/texture-sets/:id/hard', async ({ params }) => {
    await remove('textureSets', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*//:host/texture-sets/:id', async ({ params }) => {
    const id = Number(params.id)
    const ts = await getById('textureSets', id)
    if (ts) {
      const recycledId = await nextId('recycledItems')
      await addRecycledItem({
        id: recycledId,
        type: 'textureSet',
        entityId: id,
        name: ts.name,
        deletedAt: now(),
        entity: { ...ts } as unknown as Record<string, unknown>,
        extra: {
          textureCount: ts.textureCount,
          previewFileId:
            ts.textures.find(t => t.textureType === 1)?.fileId ??
            ts.textures[0]?.fileId ??
            null,
        },
      })
      // Clean up pack/project associations
      const packs = await getAll('packs')
      for (const pack of packs) {
        const before = pack.textureSets.length
        pack.textureSets = pack.textureSets.filter(t => t.id !== id)
        if (pack.textureSets.length !== before) {
          recomputePackCounts(pack)
          await put('packs', pack)
        }
      }
      const projects = await getAll('projects')
      for (const proj of projects) {
        const before = proj.textureSets.length
        proj.textureSets = proj.textureSets.filter(t => t.id !== id)
        if (proj.textureSets.length !== before) {
          recomputeProjectCounts(proj)
          await put('projects', proj)
        }
      }
    }
    await remove('textureSets', id)
    return new HttpResponse(null, { status: 204 })
  }),

  // Add texture to set
  http.post('*/texture-sets/:setId/textures', async ({ params, request }) => {
    const ts = await getById('textureSets', Number(params.setId))
    if (!ts) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      fileId: number
      textureType: number
      sourceChannel?: number
    }
    const textureId = await nextId('textures')
    const fileBlob = await getFileBlob(body.fileId)
    ts.textures.push({
      id: textureId,
      textureType: body.textureType,
      sourceChannel: body.sourceChannel ?? 5,
      fileId: body.fileId,
      fileName: fileBlob?.fileName ?? 'unknown',
      createdAt: now(),
      proxies: [],
    })
    ts.textureCount = ts.textures.length
    ts.isEmpty = ts.textures.length === 0
    ts.updatedAt = now()
    await put('textureSets', ts)
    return HttpResponse.json(
      { textureId, setId: ts.id, sourceChannel: body.sourceChannel ?? 5 },
      { status: 201 }
    )
  }),

  // Remove texture from set
  http.delete(
    '*/texture-sets/:setId/textures/:textureId',
    async ({ params }) => {
      const ts = await getById('textureSets', Number(params.setId))
      if (!ts) return new HttpResponse(null, { status: 404 })
      ts.textures = ts.textures.filter(t => t.id !== Number(params.textureId))
      ts.textureCount = ts.textures.length
      ts.isEmpty = ts.textures.length === 0
      ts.updatedAt = now()
      await put('textureSets', ts)
      return new HttpResponse(null, { status: 204 })
    }
  ),

  // Change texture type / channel
  http.put(
    '*/texture-sets/:setId/textures/:textureId/type',
    async ({ params, request }) => {
      const ts = await getById('textureSets', Number(params.setId))
      if (!ts) return new HttpResponse(null, { status: 404 })
      const body = (await request.json()) as { textureType: number }
      const tex = ts.textures.find(t => t.id === Number(params.textureId))
      if (tex) tex.textureType = body.textureType
      ts.updatedAt = now()
      await put('textureSets', ts)
      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.put(
    '*/texture-sets/:setId/textures/:textureId/channel',
    async ({ params, request }) => {
      const ts = await getById('textureSets', Number(params.setId))
      if (!ts) return new HttpResponse(null, { status: 404 })
      const body = (await request.json()) as { sourceChannel: number }
      const tex = ts.textures.find(t => t.id === Number(params.textureId))
      if (tex) tex.sourceChannel = body.sourceChannel
      ts.updatedAt = now()
      await put('textureSets', ts)
      return new HttpResponse(null, { status: 204 })
    }
  ),

  // Associate texture set with model version
  http.post(
    '*/texture-sets/:setId/model-versions/:versionId',
    async ({ params, request }) => {
      const url = new URL(request.url)
      const setId = Number(params.setId)
      const versionId = Number(params.versionId)
      const materialName = url.searchParams.get('materialName') || 'Material'
      const variantName = url.searchParams.get('variantName') ?? ''

      const ts = await getById('textureSets', setId)
      const version = await getById('modelVersions', versionId)
      if (!ts || !version) return new HttpResponse(null, { status: 404 })

      // Add mapping to version
      const existIdx = version.textureMappings.findIndex(
        m => m.materialName === materialName && m.variantName === variantName
      )
      if (existIdx >= 0) {
        version.textureMappings[existIdx].textureSetId = setId
      } else {
        version.textureMappings.push({
          materialName,
          textureSetId: setId,
          variantName,
        })
      }
      if (!version.textureSetIds.includes(setId))
        version.textureSetIds.push(setId)
      await put('modelVersions', version)

      // Update texture set's associated models
      const model = await getById('models', version.modelId)
      if (
        model &&
        !ts.associatedModels.some(
          am =>
            am.modelVersionId === versionId && am.materialName === materialName
        )
      ) {
        ts.associatedModels.push({
          id: model.id,
          name: model.name,
          versionNumber: version.versionNumber,
          modelVersionId: versionId,
          materialName,
        })
        await put('textureSets', ts)
      }

      // Update model's textureSets ref
      if (model && !model.textureSets.some(r => r.id === setId)) {
        model.textureSets.push({ id: setId, name: ts.name })
        await put('models', model)
      }

      // Regenerate thumbnail when texture mapping changes
      const fileId = version.files[0]?.id
      if (fileId) {
        const stored = await getFileBlob(fileId)
        let blob: Blob | undefined = stored?.blob
        if (!blob) {
          const seedPath = seedFileAssets[fileId]
          if (seedPath) {
            try {
              const res = await fetch(assetUrl(seedPath), {
                cache: 'force-cache',
              })
              if (res.ok) blob = await res.blob()
            } catch {
              /* ignore */
            }
          }
        }
        if (blob) {
          const fileName = version.files[0]?.originalFileName
          // Re-read version to get updated texture mappings
          const updatedVersion = await getById('modelVersions', version.id)
          const textureMaps = updatedVersion
            ? await getVersionTextureMaps(updatedVersion)
            : []
          generateModelThumbnailAsync(
            version.modelId,
            blob,
            fileName,
            textureMaps
          )
          generateVersionThumbnailAsync(version.id, blob, fileName, textureMaps)
        }
      }

      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.delete(
    '*/texture-sets/:setId/model-versions/:versionId',
    async ({ params, request }) => {
      const url = new URL(request.url)
      const setId = Number(params.setId)
      const versionId = Number(params.versionId)
      const materialName = url.searchParams.get('materialName') || 'Material'
      const variantName = url.searchParams.get('variantName') ?? ''

      const ts = await getById('textureSets', setId)
      const version = await getById('modelVersions', versionId)
      if (!ts || !version) return new HttpResponse(null, { status: 404 })

      version.textureMappings = version.textureMappings.filter(
        m =>
          !(
            m.materialName === materialName &&
            m.variantName === variantName &&
            m.textureSetId === setId
          )
      )
      version.textureSetIds = [
        ...new Set(version.textureMappings.map(m => m.textureSetId)),
      ]
      await put('modelVersions', version)

      ts.associatedModels = ts.associatedModels.filter(
        am =>
          !(am.modelVersionId === versionId && am.materialName === materialName)
      )
      await put('textureSets', ts)

      // Regenerate thumbnail after removing texture mapping
      const fileId = version.files[0]?.id
      if (fileId) {
        const stored = await getFileBlob(fileId)
        let blob: Blob | undefined = stored?.blob
        if (!blob) {
          const seedPath = seedFileAssets[fileId]
          if (seedPath) {
            try {
              const res = await fetch(assetUrl(seedPath), {
                cache: 'force-cache',
              })
              if (res.ok) blob = await res.blob()
            } catch {
              /* ignore */
            }
          }
        }
        if (blob) {
          const fileName = version.files[0]?.originalFileName
          // Re-read version to get updated texture mappings (after removal)
          const updatedVersion = await getById('modelVersions', version.id)
          const textureMaps = updatedVersion
            ? await getVersionTextureMaps(updatedVersion)
            : []
          generateModelThumbnailAsync(
            version.modelId,
            blob,
            fileName,
            textureMaps
          )
          generateVersionThumbnailAsync(version.id, blob, fileName, textureMaps)
        }
      }

      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.post(
    '*/texture-sets/:setId/models/:modelId/all-versions',
    async ({ params, request }) => {
      const setId = Number(params.setId)
      const modelId = Number(params.modelId)
      const url = new URL(request.url)
      const materialName = url.searchParams.get('materialName') || 'Material'

      const ts = await getById('textureSets', setId)
      const model = await getById('models', modelId)
      if (!ts || !model) return new HttpResponse(null, { status: 404 })

      const versions = await getVersionsByModelId(modelId)
      for (const v of versions) {
        if (
          !v.textureMappings.some(
            m => m.materialName === materialName && m.textureSetId === setId
          )
        ) {
          v.textureMappings.push({
            materialName,
            textureSetId: setId,
            variantName: '',
          })
          if (!v.textureSetIds.includes(setId)) v.textureSetIds.push(setId)
          await put('modelVersions', v)
        }
        if (
          !ts.associatedModels.some(
            am => am.modelVersionId === v.id && am.materialName === materialName
          )
        ) {
          ts.associatedModels.push({
            id: model.id,
            name: model.name,
            versionNumber: v.versionNumber,
            modelVersionId: v.id,
            materialName,
          })
        }
      }
      await put('textureSets', ts)

      if (!model.textureSets.some(r => r.id === setId)) {
        model.textureSets.push({ id: setId, name: ts.name })
        await put('models', model)
      }

      return new HttpResponse(null, { status: 204 })
    }
  ),

  // Texture set thumbnail regenerate
  http.post('*/texture-sets/:id/thumbnail/regenerate', async () => {
    return HttpResponse.json({ status: 'Processing' })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  SPRITES
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/sprites', async ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    const categoryId = url.searchParams.get('categoryId')

    let sprites = await getAll('sprites')

    if (packId) {
      const pack = await getById('packs', Number(packId))
      if (pack) {
        const ids = new Set(pack.sprites.map(s => s.id))
        sprites = sprites.filter(s => ids.has(s.id))
      }
    }
    if (projectId) {
      const project = await getById('projects', Number(projectId))
      if (project) {
        const ids = new Set(project.sprites.map(s => s.id))
        sprites = sprites.filter(s => ids.has(s.id))
      }
    }
    if (categoryId) {
      sprites = sprites.filter(s => s.categoryId === Number(categoryId))
    }

    if (url.searchParams.has('page')) {
      const result = paginate(sprites, page, pageSize)
      return HttpResponse.json({
        sprites: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }
    return HttpResponse.json({ sprites })
  }),

  http.get('*/sprites/:id', async ({ params }) => {
    const sprite = await getById('sprites', Number(params.id))
    if (!sprite) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(sprite)
  }),

  http.post('*/sprites/with-file', async ({ request }) => {
    const url = new URL(request.url)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

    const spriteId = await nextId('sprites')
    const fileId = await nextId('files')
    const ts = now()
    const name =
      url.searchParams.get('name') || file.name.replace(/\.[^.]+$/, '')
    const spriteType = Number(url.searchParams.get('spriteType') || '0')
    const categoryId = url.searchParams.get('categoryId')
      ? Number(url.searchParams.get('categoryId'))
      : null

    await storeFileBlob(fileId, file, file.name, file.type || 'image/png')

    let categoryName: string | null = null
    if (categoryId) {
      const cat = await getById('spriteCategories', categoryId)
      categoryName = cat?.name ?? null
    }

    const sprite: DemoSprite = {
      id: spriteId,
      name,
      fileId,
      spriteType,
      categoryId,
      categoryName,
      fileName: file.name,
      fileSizeBytes: file.size,
      createdAt: ts,
      updatedAt: ts,
    }
    await put('sprites', sprite)

    // Track upload
    const packIdParam = url.searchParams.get('packId')
    const projectIdParam = url.searchParams.get('projectId')
    let trackPackName: string | null = null
    let trackProjectName: string | null = null
    if (packIdParam) {
      const p = await getById('packs', Number(packIdParam))
      trackPackName = p?.name ?? null
    }
    if (projectIdParam) {
      const p = await getById('projects', Number(projectIdParam))
      trackProjectName = p?.name ?? null
    }
    trackUpload({
      batchId: `batch-${Date.now()}`,
      uploadType: 'Sprite',
      fileId,
      fileName: file.name,
      packId: packIdParam ? Number(packIdParam) : null,
      packName: trackPackName,
      projectId: projectIdParam ? Number(projectIdParam) : null,
      projectName: trackProjectName,
      modelId: null,
      modelName: null,
      textureSetId: null,
      textureSetName: null,
      spriteId,
      spriteName: name,
    })

    // Auto-add to pack/project if specified
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    if (packId) {
      const pack = await getById('packs', Number(packId))
      if (pack && !pack.sprites.some(s => s.id === spriteId)) {
        pack.sprites.push({ id: spriteId, name })
        recomputePackCounts(pack)
        await put('packs', pack)
      }
    }
    if (projectId) {
      const project = await getById('projects', Number(projectId))
      if (project && !project.sprites.some(s => s.id === spriteId)) {
        project.sprites.push({ id: spriteId, name })
        recomputeProjectCounts(project)
        await put('projects', project)
      }
    }

    return HttpResponse.json(
      { spriteId, name, fileId, spriteType, fileSizeBytes: file.size },
      { status: 201 }
    )
  }),

  http.put('*/sprites/:id', async ({ params, request }) => {
    const sprite = await getById('sprites', Number(params.id))
    if (!sprite) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name?: string
      spriteType?: number
      categoryId?: number | null
    }
    if (body.name !== undefined) sprite.name = body.name
    if (body.spriteType !== undefined) sprite.spriteType = body.spriteType
    if (body.categoryId !== undefined) {
      sprite.categoryId = body.categoryId
      if (body.categoryId) {
        const cat = await getById('spriteCategories', body.categoryId)
        sprite.categoryName = cat?.name ?? null
      } else {
        sprite.categoryName = null
      }
    }
    sprite.updatedAt = now()
    await put('sprites', sprite)
    return HttpResponse.json({
      id: sprite.id,
      name: sprite.name,
      spriteType: sprite.spriteType,
      categoryId: sprite.categoryId,
    })
  }),

  http.delete('*/sprites/:id/soft', async ({ params }) => {
    const id = Number(params.id)
    const sprite = await getById('sprites', id)
    if (sprite) {
      const recycledId = await nextId('recycledItems')
      await addRecycledItem({
        id: recycledId,
        type: 'sprite',
        entityId: id,
        name: sprite.name,
        deletedAt: now(),
        entity: { ...sprite } as unknown as Record<string, unknown>,
        extra: { fileId: sprite.fileId },
      })
      // Clean up pack/project associations
      const packs = await getAll('packs')
      for (const pack of packs) {
        const before = pack.sprites.length
        pack.sprites = pack.sprites.filter(s => s.id !== id)
        if (pack.sprites.length !== before) {
          recomputePackCounts(pack)
          await put('packs', pack)
        }
      }
      const projects = await getAll('projects')
      for (const proj of projects) {
        const before = proj.sprites.length
        proj.sprites = proj.sprites.filter(s => s.id !== id)
        if (proj.sprites.length !== before) {
          recomputeProjectCounts(proj)
          await put('projects', proj)
        }
      }
    }
    await remove('sprites', id)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*//:host/sprites/:id', async ({ params }) => {
    await remove('sprites', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  // Sprite categories
  http.get('*/sprite-categories', async () => {
    const cats = await getAll('spriteCategories')
    return HttpResponse.json({ categories: cats })
  }),

  http.post('*/sprite-categories', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    const id = await nextId('spriteCategories')
    const ts = now()
    const cat = {
      id,
      name: body.name,
      description: body.description ?? null,
      createdAt: ts,
      updatedAt: ts,
    }
    await put('spriteCategories', cat)
    return HttpResponse.json(cat, { status: 201 })
  }),

  http.put('*/sprite-categories/:id', async ({ params, request }) => {
    const cat = await getById('spriteCategories', Number(params.id))
    if (!cat) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    cat.name = body.name
    if (body.description !== undefined) cat.description = body.description
    cat.updatedAt = now()
    await put('spriteCategories', cat)
    return HttpResponse.json(cat)
  }),

  http.delete('*/sprite-categories/:id', async ({ params }) => {
    await remove('spriteCategories', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  SOUNDS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/sounds', async ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    const categoryId = url.searchParams.get('categoryId')

    let sounds = await getAll('sounds')

    if (packId) {
      const pack = await getById('packs', Number(packId))
      if (pack) {
        const ids = new Set(pack.sounds.map(s => s.id))
        sounds = sounds.filter(s => ids.has(s.id))
      }
    }
    if (projectId) {
      const project = await getById('projects', Number(projectId))
      if (project) {
        const ids = new Set(project.sounds.map(s => s.id))
        sounds = sounds.filter(s => ids.has(s.id))
      }
    }
    if (categoryId) {
      sounds = sounds.filter(s => s.categoryId === Number(categoryId))
    }

    if (url.searchParams.has('page')) {
      const result = paginate(sounds, page, pageSize)
      return HttpResponse.json({
        sounds: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }
    return HttpResponse.json({ sounds })
  }),

  http.get('*/sounds/:id', async ({ params }) => {
    const sound = await getById('sounds', Number(params.id))
    if (!sound) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(sound)
  }),

  http.get('*/sounds/:id/file', async ({ params }) => {
    const sound = await getById('sounds', Number(params.id))
    if (!sound) return new HttpResponse(null, { status: 404 })
    return serveFile(sound.fileId)
  }),

  http.get('*/sounds/:id/waveform', async ({ params }) => {
    const id = Number(params.id)
    const thumb = await getThumbnail(`waveform:${id}`)
    if (thumb) {
      return new HttpResponse(thumb, {
        headers: { 'Content-Type': 'image/png' },
      })
    }
    return new HttpResponse(null, { status: 404 })
  }),

  http.post('*/sounds/with-file', async ({ request }) => {
    const url = new URL(request.url)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

    const soundId = await nextId('sounds')
    const fileId = await nextId('files')
    const ts = now()
    const name =
      url.searchParams.get('name') || file.name.replace(/\.[^.]+$/, '')
    const categoryId = url.searchParams.get('categoryId')
      ? Number(url.searchParams.get('categoryId'))
      : null

    await storeFileBlob(fileId, file, file.name, file.type || 'audio/wav')

    let categoryName: string | null = null
    if (categoryId) {
      const cat = await getById('soundCategories', categoryId)
      categoryName = cat?.name ?? null
    }

    // Try to generate waveform in background
    let duration = Number(url.searchParams.get('duration') || '0')
    const peaksParam = url.searchParams.get('peaks')

    const sound: DemoSound = {
      id: soundId,
      name,
      fileId,
      categoryId,
      categoryName,
      duration,
      peaks: peaksParam,
      fileName: file.name,
      fileSizeBytes: file.size,
      createdAt: ts,
      updatedAt: ts,
      waveformUrl: null,
    }
    await put('sounds', sound)

    // Track upload
    {
      const pId = url.searchParams.get('packId')
      const prId = url.searchParams.get('projectId')
      let pName: string | null = null
      let prName: string | null = null
      if (pId) {
        const p = await getById('packs', Number(pId))
        pName = p?.name ?? null
      }
      if (prId) {
        const p = await getById('projects', Number(prId))
        prName = p?.name ?? null
      }
      trackUpload({
        batchId: `batch-${Date.now()}`,
        uploadType: 'Sound',
        fileId,
        fileName: file.name,
        packId: pId ? Number(pId) : null,
        packName: pName,
        projectId: prId ? Number(prId) : null,
        projectName: prName,
        modelId: null,
        modelName: null,
        textureSetId: null,
        textureSetName: null,
        spriteId: null,
        spriteName: null,
      })
    }

    // Generate waveform asynchronously
    generateWaveformThumbnail(file)
      .then(async result => {
        sound.duration = result.duration
        sound.peaks = JSON.stringify(result.peaks)
        sound.waveformUrl = `__demo_waveform_${soundId}__`
        await put('sounds', sound)
        await storeThumbnail(`waveform:${soundId}`, result.thumbnail)
      })
      .catch(() => {
        // Waveform generation failed, leave as-is
      })

    // Auto-add to pack/project if specified
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    if (packId) {
      const pack = await getById('packs', Number(packId))
      if (pack && !pack.sounds.some(s => s.id === soundId)) {
        pack.sounds.push({ id: soundId, name })
        recomputePackCounts(pack)
        await put('packs', pack)
      }
    }
    if (projectId) {
      const project = await getById('projects', Number(projectId))
      if (project && !project.sounds.some(s => s.id === soundId)) {
        project.sounds.push({ id: soundId, name })
        recomputeProjectCounts(project)
        await put('projects', project)
      }
    }

    return HttpResponse.json(
      { soundId, name, fileId, duration, fileSizeBytes: file.size },
      { status: 201 }
    )
  }),

  http.put('*/sounds/:id', async ({ params, request }) => {
    const sound = await getById('sounds', Number(params.id))
    if (!sound) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name?: string
      categoryId?: number | null
    }
    if (body.name !== undefined) sound.name = body.name
    if (body.categoryId !== undefined) {
      sound.categoryId = body.categoryId
      if (body.categoryId) {
        const cat = await getById('soundCategories', body.categoryId)
        sound.categoryName = cat?.name ?? null
      } else {
        sound.categoryName = null
      }
    }
    sound.updatedAt = now()
    await put('sounds', sound)
    return HttpResponse.json({ id: sound.id, name: sound.name })
  }),

  http.delete('*/sounds/:id/soft', async ({ params }) => {
    const id = Number(params.id)
    const sound = await getById('sounds', id)
    if (sound) {
      const recycledId = await nextId('recycledItems')
      await addRecycledItem({
        id: recycledId,
        type: 'sound',
        entityId: id,
        name: sound.name,
        deletedAt: now(),
        entity: { ...sound } as unknown as Record<string, unknown>,
        extra: { fileId: sound.fileId, duration: sound.duration },
      })
      // Clean up pack/project associations
      const packs = await getAll('packs')
      for (const pack of packs) {
        const before = pack.sounds.length
        pack.sounds = pack.sounds.filter(s => s.id !== id)
        if (pack.sounds.length !== before) {
          recomputePackCounts(pack)
          await put('packs', pack)
        }
      }
      const projects = await getAll('projects')
      for (const proj of projects) {
        const before = proj.sounds.length
        proj.sounds = proj.sounds.filter(s => s.id !== id)
        if (proj.sounds.length !== before) {
          recomputeProjectCounts(proj)
          await put('projects', proj)
        }
      }
    }
    await remove('sounds', id)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*//:host/sounds/:id', async ({ params }) => {
    await remove('sounds', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  // Sound categories
  http.get('*/sound-categories', async () => {
    const cats = await getAll('soundCategories')
    return HttpResponse.json({ categories: cats })
  }),

  http.post('*/sound-categories', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    const id = await nextId('soundCategories')
    const ts = now()
    const cat = {
      id,
      name: body.name,
      description: body.description ?? null,
      createdAt: ts,
      updatedAt: ts,
    }
    await put('soundCategories', cat)
    return HttpResponse.json(cat, { status: 201 })
  }),

  http.put('*/sound-categories/:id', async ({ params, request }) => {
    const cat = await getById('soundCategories', Number(params.id))
    if (!cat) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    cat.name = body.name
    if (body.description !== undefined) cat.description = body.description
    cat.updatedAt = now()
    await put('soundCategories', cat)
    return HttpResponse.json(cat)
  }),

  http.delete('*/sound-categories/:id', async ({ params }) => {
    await remove('soundCategories', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  PACKS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/packs', async () => {
    const packs = await getAll('packs')
    return HttpResponse.json({ packs })
  }),

  http.get('*/packs/:id', async ({ params }) => {
    const pack = await getById('packs', Number(params.id))
    if (!pack) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(pack)
  }),

  http.post('*/packs', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    const id = await nextId('packs')
    const ts = now()
    const pack: DemoPack = {
      id,
      name: body.name,
      description: body.description ?? '',
      createdAt: ts,
      updatedAt: ts,
      modelCount: 0,
      textureSetCount: 0,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: true,
      models: [],
      textureSets: [],
      sprites: [],
      sounds: [],
    }
    await put('packs', pack)
    return HttpResponse.json(
      { id, name: body.name, description: body.description },
      { status: 201 }
    )
  }),

  http.put('*/packs/:id', async ({ params, request }) => {
    const pack = await getById('packs', Number(params.id))
    if (!pack) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    pack.name = body.name
    if (body.description !== undefined) pack.description = body.description
    pack.updatedAt = now()
    await put('packs', pack)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:id', async ({ params }) => {
    await remove('packs', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  // Pack ↔ Model
  http.post('*/packs/:packId/models/:modelId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    const model = await getById('models', Number(params.modelId))
    if (!pack || !model) return new HttpResponse(null, { status: 404 })
    if (!pack.models.some(m => m.id === model.id)) {
      pack.models.push({ id: model.id, name: model.name })
      recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
    }
    if (!model.packs.some(p => p.id === pack.id)) {
      model.packs.push({ id: pack.id, name: pack.name })
      await put('models', model)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:packId/models/:modelId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    const model = await getById('models', Number(params.modelId))
    if (!pack) return new HttpResponse(null, { status: 404 })
    pack.models = pack.models.filter(m => m.id !== Number(params.modelId))
    recomputePackCounts(pack)
    pack.updatedAt = now()
    await put('packs', pack)
    if (model) {
      model.packs = model.packs.filter(p => p.id !== pack.id)
      await put('models', model)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // Pack ↔ TextureSet
  http.post('*/packs/:packId/texture-sets/:tsId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    const ts = await getById('textureSets', Number(params.tsId))
    if (!pack || !ts) return new HttpResponse(null, { status: 404 })
    if (!pack.textureSets.some(t => t.id === ts.id)) {
      pack.textureSets.push({ id: ts.id, name: ts.name })
      recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
    }
    if (!ts.packs.some(p => p.id === pack.id)) {
      ts.packs.push({ id: pack.id, name: pack.name })
      await put('textureSets', ts)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:packId/texture-sets/:tsId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    if (!pack) return new HttpResponse(null, { status: 404 })
    pack.textureSets = pack.textureSets.filter(
      t => t.id !== Number(params.tsId)
    )
    recomputePackCounts(pack)
    pack.updatedAt = now()
    await put('packs', pack)
    const ts = await getById('textureSets', Number(params.tsId))
    if (ts) {
      ts.packs = ts.packs.filter(p => p.id !== pack.id)
      await put('textureSets', ts)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // Pack ↔ Sprite
  http.post('*/packs/:packId/sprites/:spriteId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    const sprite = await getById('sprites', Number(params.spriteId))
    if (!pack || !sprite) return new HttpResponse(null, { status: 404 })
    if (!pack.sprites.some(s => s.id === sprite.id)) {
      pack.sprites.push({ id: sprite.id, name: sprite.name })
      recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:packId/sprites/:spriteId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    if (!pack) return new HttpResponse(null, { status: 404 })
    pack.sprites = pack.sprites.filter(s => s.id !== Number(params.spriteId))
    recomputePackCounts(pack)
    pack.updatedAt = now()
    await put('packs', pack)
    return new HttpResponse(null, { status: 204 })
  }),

  // Pack ↔ Sound
  http.post('*/packs/:packId/sounds/:soundId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    const sound = await getById('sounds', Number(params.soundId))
    if (!pack || !sound) return new HttpResponse(null, { status: 404 })
    if (!pack.sounds.some(s => s.id === sound.id)) {
      pack.sounds.push({ id: sound.id, name: sound.name })
      recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:packId/sounds/:soundId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    if (!pack) return new HttpResponse(null, { status: 404 })
    pack.sounds = pack.sounds.filter(s => s.id !== Number(params.soundId))
    recomputePackCounts(pack)
    pack.updatedAt = now()
    await put('packs', pack)
    return new HttpResponse(null, { status: 204 })
  }),

  // Pack texture with file upload
  http.post(
    '*/packs/:packId/textures/with-file',
    async ({ params, request }) => {
      const packId = Number(params.packId)
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

      const name =
        (formData.get('name') as string) || file.name.replace(/\.[^.]+$/, '')
      const textureType = parseTextureType(
        formData.get('textureType') as string
      )
      const tsId = await nextId('textureSets')
      const fileId = await nextId('files')
      const textureId = await nextId('textures')
      const ts = now()

      await storeFileBlob(fileId, file, file.name, file.type || 'image/png')

      const textureSet: DemoTextureSet = {
        id: tsId,
        name,
        kind: 0,
        tilingScaleX: 1,
        tilingScaleY: 1,
        uvMappingMode: 0,
        uvScale: 1,
        createdAt: ts,
        updatedAt: ts,
        textureCount: 1,
        isEmpty: false,
        thumbnailPath: null,
        pngThumbnailPath: null,
        textures: [
          {
            id: textureId,
            textureType,
            sourceChannel: 5,
            fileId,
            fileName: file.name,
            createdAt: ts,
            proxies: [],
          },
        ],
        associatedModels: [],
        packs: [{ id: packId, name: '' }],
      }
      const pack = await getById('packs', packId)
      if (pack) {
        textureSet.packs = [{ id: packId, name: pack.name }]
        pack.textureSets.push({ id: tsId, name })
        recomputePackCounts(pack)
        pack.updatedAt = ts
        await put('packs', pack)
      }
      await put('textureSets', textureSet)

      return HttpResponse.json({ textureSetId: tsId }, { status: 201 })
    }
  ),

  // ════════════════════════════════════════════════════════════════════════
  //  PROJECTS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/projects', async () => {
    const projects = await getAll('projects')
    return HttpResponse.json({ projects })
  }),

  http.get('*/projects/:id', async ({ params }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(project)
  }),

  http.post('*/projects', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    const id = await nextId('projects')
    const ts = now()
    const project: DemoProject = {
      id,
      name: body.name,
      description: body.description ?? '',
      createdAt: ts,
      updatedAt: ts,
      modelCount: 0,
      textureSetCount: 0,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: true,
      models: [],
      textureSets: [],
      sprites: [],
      sounds: [],
    }
    await put('projects', project)
    return HttpResponse.json(
      { id, name: body.name, description: body.description },
      { status: 201 }
    )
  }),

  http.put('*/projects/:id', async ({ params, request }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    project.name = body.name
    if (body.description !== undefined) project.description = body.description
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:id', async ({ params }) => {
    await remove('projects', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  // Project ↔ Model
  http.post('*/projects/:projectId/models/:modelId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    const model = await getById('models', Number(params.modelId))
    if (!project || !model) return new HttpResponse(null, { status: 404 })
    if (!project.models.some(m => m.id === model.id)) {
      project.models.push({ id: model.id, name: model.name })
      recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:projectId/models/:modelId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    if (!project) return new HttpResponse(null, { status: 404 })
    project.models = project.models.filter(m => m.id !== Number(params.modelId))
    recomputeProjectCounts(project)
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  // Project ↔ TextureSet
  http.post('*/projects/:projectId/texture-sets/:tsId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    const ts = await getById('textureSets', Number(params.tsId))
    if (!project || !ts) return new HttpResponse(null, { status: 404 })
    if (!project.textureSets.some(t => t.id === ts.id)) {
      project.textureSets.push({ id: ts.id, name: ts.name })
      recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(
    '*/projects/:projectId/texture-sets/:tsId',
    async ({ params }) => {
      const project = await getById('projects', Number(params.projectId))
      if (!project) return new HttpResponse(null, { status: 404 })
      project.textureSets = project.textureSets.filter(
        t => t.id !== Number(params.tsId)
      )
      recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
      return new HttpResponse(null, { status: 204 })
    }
  ),

  // Project ↔ Sprite
  http.post('*/projects/:projectId/sprites/:spriteId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    const sprite = await getById('sprites', Number(params.spriteId))
    if (!project || !sprite) return new HttpResponse(null, { status: 404 })
    if (!project.sprites.some(s => s.id === sprite.id)) {
      project.sprites.push({ id: sprite.id, name: sprite.name })
      recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:projectId/sprites/:spriteId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    if (!project) return new HttpResponse(null, { status: 404 })
    project.sprites = project.sprites.filter(
      s => s.id !== Number(params.spriteId)
    )
    recomputeProjectCounts(project)
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  // Project ↔ Sound
  http.post('*/projects/:projectId/sounds/:soundId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    const sound = await getById('sounds', Number(params.soundId))
    if (!project || !sound) return new HttpResponse(null, { status: 404 })
    if (!project.sounds.some(s => s.id === sound.id)) {
      project.sounds.push({ id: sound.id, name: sound.name })
      recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:projectId/sounds/:soundId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    if (!project) return new HttpResponse(null, { status: 404 })
    project.sounds = project.sounds.filter(s => s.id !== Number(params.soundId))
    recomputeProjectCounts(project)
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  // Project texture with file upload
  http.post(
    '*/projects/:projectId/textures/with-file',
    async ({ params, request }) => {
      const projectId = Number(params.projectId)
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

      const name =
        (formData.get('name') as string) || file.name.replace(/\.[^.]+$/, '')
      const textureType = parseTextureType(
        formData.get('textureType') as string
      )
      const tsId = await nextId('textureSets')
      const fileId = await nextId('files')
      const textureId = await nextId('textures')
      const ts = now()

      await storeFileBlob(fileId, file, file.name, file.type || 'image/png')

      const textureSet: DemoTextureSet = {
        id: tsId,
        name,
        kind: 0,
        tilingScaleX: 1,
        tilingScaleY: 1,
        uvMappingMode: 0,
        uvScale: 1,
        createdAt: ts,
        updatedAt: ts,
        textureCount: 1,
        isEmpty: false,
        thumbnailPath: null,
        pngThumbnailPath: null,
        textures: [
          {
            id: textureId,
            textureType,
            sourceChannel: 5,
            fileId,
            fileName: file.name,
            createdAt: ts,
            proxies: [],
          },
        ],
        associatedModels: [],
        packs: [],
      }
      const project = await getById('projects', projectId)
      if (project) {
        project.textureSets.push({ id: tsId, name })
        recomputeProjectCounts(project)
        project.updatedAt = ts
        await put('projects', project)
      }
      await put('textureSets', textureSet)

      return HttpResponse.json({ textureSetId: tsId }, { status: 201 })
    }
  ),

  // ════════════════════════════════════════════════════════════════════════
  //  STAGES
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/stages', async () => {
    return HttpResponse.json({ stages: [] })
  }),

  http.get('*/stages/:id', async () => {
    return HttpResponse.json({
      id: 1,
      name: 'Default',
      configurationJson: '{}',
      createdAt: now(),
      updatedAt: now(),
    })
  }),

  http.post('*/stages', async ({ request }) => {
    const body = (await request.json()) as { name: string }
    return HttpResponse.json(
      { id: Date.now(), name: body.name },
      { status: 201 }
    )
  }),

  http.put('*/stages/:id', async ({ request }) => {
    const body = (await request.json()) as { configurationJson: string }
    return HttpResponse.json({ id: Number('1'), name: 'Stage', ...body })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  SETTINGS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/settings', async () => {
    return HttpResponse.json({
      maxFileSizeBytes: 104857600,
      maxThumbnailSizeBytes: 10485760,
      thumbnailFrameCount: 30,
      thumbnailCameraVerticalAngle: 25,
      thumbnailWidth: 256,
      thumbnailHeight: 256,
      generateThumbnailOnUpload: true,
      textureProxySize: 512,
      blenderPath: 'blender',
      blenderEnabled: false,
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
    })
  }),

  http.get('*/settings/blender-enabled', async () => {
    return HttpResponse.json({
      enableBlender: false,
      blenderPath: 'blender',
      settingEnabled: false,
      installed: false,
      installedVersion: null,
    })
  }),

  http.get('*/settings/blender/versions', async () => {
    return HttpResponse.json({
      versions: [
        { version: '5.1.0', label: 'Blender 5.1.0', isLts: false },
        { version: '5.0.0', label: 'Blender 5.0.0', isLts: false },
        { version: '4.4.3', label: 'Blender 4.4.3', isLts: false },
        { version: '4.2.9', label: 'Blender 4.2.9 LTS', isLts: true },
        { version: '3.6.16', label: 'Blender 3.6.16 LTS', isLts: true },
      ],
      isOffline: false,
    })
  }),

  http.get('*/settings/blender/status', async () => {
    return HttpResponse.json({
      state: 'none',
      installedVersion: null,
      installedPath: null,
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      error: null,
    })
  }),

  http.post('*/settings/blender/install', async () => {
    return HttpResponse.json({
      state: 'none',
      installedVersion: null,
      installedPath: null,
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      error: 'Not available in demo mode',
    })
  }),

  http.post('*/settings/blender/uninstall', async () => {
    return HttpResponse.json({
      state: 'none',
      installedVersion: null,
      installedPath: null,
      progress: 0,
      downloadedBytes: null,
      totalBytes: null,
      error: null,
    })
  }),

  http.put('*/settings', async ({ request }) => {
    const body = await request.json()
    return HttpResponse.json({ ...(body as object), updatedAt: now() })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  RECYCLED FILES
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/recycled', async () => {
    const allRecycled = await getAllRecycledItems()
    const models = allRecycled
      .filter(r => r.type === 'model')
      .map(r => ({
        id: r.entityId,
        name: r.name,
        deletedAt: r.deletedAt,
        fileCount: (r.extra?.fileCount as number) ?? 0,
      }))
    const textureSets = allRecycled
      .filter(r => r.type === 'textureSet')
      .map(r => ({
        id: r.entityId,
        name: r.name,
        deletedAt: r.deletedAt,
        textureCount: (r.extra?.textureCount as number) ?? 0,
        previewFileId: (r.extra?.previewFileId as number) ?? null,
      }))
    const sprites = allRecycled
      .filter(r => r.type === 'sprite')
      .map(r => ({
        id: r.entityId,
        name: r.name,
        fileId: (r.extra?.fileId as number) ?? 0,
        deletedAt: r.deletedAt,
      }))
    const sounds = allRecycled
      .filter(r => r.type === 'sound')
      .map(r => ({
        id: r.entityId,
        name: r.name,
        fileId: (r.extra?.fileId as number) ?? 0,
        duration: (r.extra?.duration as number) ?? 0,
        deletedAt: r.deletedAt,
      }))
    return HttpResponse.json({
      models,
      modelVersions: [],
      files: [],
      textureSets,
      textures: [],
      sprites,
      sounds,
    })
  }),

  http.post('*/recycled/:type/:id/restore', async ({ params }) => {
    const type = String(params.type)
    const entityId = Number(params.id)
    const item = await findRecycledItem(type, entityId)
    if (item) {
      // Re-add entity to its IDB store from saved entity data
      if (item.entity) {
        if (type === 'model') {
          await put('models', item.entity as unknown as DemoModel)
        } else if (type === 'textureSet') {
          await put('textureSets', item.entity as unknown as DemoTextureSet)
        } else if (type === 'sprite') {
          await put('sprites', item.entity as unknown as DemoSprite)
        } else if (type === 'sound') {
          await put('sounds', item.entity as unknown as DemoSound)
        }
      }
      await removeRecycledItem(item.id)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('*/recycled/:type/:id/preview', async ({ params }) => {
    const type = String(params.type)
    const entityId = Number(params.id)
    const item = await findRecycledItem(type, entityId)

    const filesToDelete: {
      filePath: string
      originalFileName: string
      sizeBytes: number
    }[] = []
    const relatedEntities: string[] = []

    if (item?.entity) {
      if (type === 'model') {
        const model = item.entity as unknown as DemoModel
        const seenFiles = new Set<string>()
        const addFile = (f: {
          storedFileName?: string
          originalFileName: string
          sizeBytes?: number
        }) => {
          const key = f.storedFileName ?? f.originalFileName
          if (seenFiles.has(key)) return
          seenFiles.add(key)
          filesToDelete.push({
            filePath: key,
            originalFileName: f.originalFileName,
            sizeBytes: f.sizeBytes ?? 0,
          })
        }
        for (const f of model.files ?? []) addFile(f)
        // List versions as related
        const versions = await getAll('modelVersions')
        const modelVersions = versions.filter(v => v.modelId === entityId)
        for (const v of modelVersions) {
          relatedEntities.push(`Version ${v.versionNumber}`)
          for (const f of v.files ?? []) addFile(f)
        }
      } else if (type === 'textureSet') {
        const ts = item.entity as unknown as DemoTextureSet
        for (const tex of ts.textures ?? []) {
          filesToDelete.push({
            filePath: tex.fileName,
            originalFileName: tex.fileName,
            sizeBytes: 0,
          })
        }
      } else if (type === 'sprite') {
        const sprite = item.entity as unknown as DemoSprite
        filesToDelete.push({
          filePath: sprite.fileName,
          originalFileName: sprite.fileName,
          sizeBytes: sprite.fileSizeBytes ?? 0,
        })
      } else if (type === 'sound') {
        const sound = item.entity as unknown as DemoSound
        filesToDelete.push({
          filePath: sound.fileName,
          originalFileName: sound.fileName,
          sizeBytes: sound.fileSizeBytes ?? 0,
        })
      }
    }

    return HttpResponse.json({
      entityName: item?.name ?? 'Unknown',
      filesToDelete,
      relatedEntities,
    })
  }),

  http.delete('*/recycled/:type/:id/permanent', async ({ params }) => {
    const item = await findRecycledItem(String(params.type), Number(params.id))
    if (item) await removeRecycledItem(item.id)
    return new HttpResponse(null, { status: 204 })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  BATCH UPLOADS / HISTORY
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/batch-uploads/history', async () => {
    const uploads = await getAllUploadHistory()
    return HttpResponse.json({ uploads })
  }),

  http.post('*/batch-uploads/*', async () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  SIGNALR (thumbnailHub) — no-op stubs to prevent 405 errors
  // ════════════════════════════════════════════════════════════════════════

  http.post('*/thumbnailHub/negotiate', async () => {
    return HttpResponse.json(
      {
        negotiateVersion: 1,
        connectionId: 'demo-connection-id',
        connectionToken: 'demo-token',
        availableTransports: [
          { transport: 'LongPolling', transferFormats: ['Text'] },
        ],
      },
      { status: 200 }
    )
  }),

  http.options('*/thumbnailHub/negotiate', async () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // Long polling: the GET hangs until there's data (we never send any)
  http.get('*/thumbnailHub', async () => {
    // Return empty 200 after a delay to simulate an idle long-poll cycle
    await new Promise(resolve => setTimeout(resolve, 30000))
    return new HttpResponse(null, { status: 200 })
  }),

  // SignalR sends messages via POST on the hub URL
  http.post('*/thumbnailHub', async () => {
    return new HttpResponse(null, { status: 200 })
  }),

  // Connection cleanup
  http.delete('*/thumbnailHub', async () => {
    return new HttpResponse(null, { status: 202 })
  }),
]

// ─── Seed Thumbnail Pre-warming ──────────────────────────────────────────

/**
 * Eagerly generates and caches Three.js thumbnails for all seed models
 * into IndexedDB, so they are available immediately on first page load.
 *
 * Called once at demo startup (fire-and-forget). Safe to call multiple
 * times — skips models that already have a cached thumbnail.
 */
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
    // Skip if already cached
    const existing = await getThumbnail(modelKey)
    if (existing) continue

    const seedPath = seedFileAssets[fileId]
    if (!seedPath) continue

    try {
      const res = await fetch(assetUrl(seedPath), { cache: 'force-cache' })
      if (!res.ok) continue
      const blob = await res.blob()
      const thumbnail = await generateModelThumbnail(blob, 256, 256, fileName)
      await storeThumbnail(modelKey, thumbnail)
      await storeThumbnail(`version:${versionId}`, thumbnail)
    } catch {
      // Silently ignore — thumbnail requests will still generate on demand
    }
  }
}
