import { http, HttpResponse } from 'msw'

import { containerHandlers } from './dynamic-demo/containerHandlers'
import {
  addRecycledItem,
  assetUrl,
  buildCategoryPath,
  buildConceptImage,
  type DemoEnvironmentMap,
  type DemoModel,
  type DemoModelVersion,
  type DemoSound,
  type DemoSprite,
  type DemoTextureSet,
  enrichModel,
  fetchStaticAsset,
  generateExrChannelPreview,
  generateImageChannelPreview,
  generateModelThumbnail,
  generateModelThumbnailAsync,
  generatePlaceholderThumbnail,
  generateVersionThumbnailAsync,
  generateWaveformThumbnail,
  getAll,
  getById,
  getFileBlob,
  getThumbnail,
  getVersionsByModelId,
  getVersionTextureMaps,
  inferMimeType,
  nextId,
  now,
  paginate,
  parseTextureType,
  put,
  recomputePackCounts,
  recomputeProjectCounts,
  remove,
  seedFileAssets,
  serveFile,
  storeFileBlob,
  storeThumbnail,
  syncEnvironmentMapDerivedFields,
  thumbnailUrl,
  toEnvironmentMapDto,
  trackUpload,
} from './dynamic-demo/shared'
import { systemHandlers } from './dynamic-demo/systemHandlers'

export { prewarmSeedThumbnails } from './dynamic-demo/shared'

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
    const categoryIds = url.searchParams
      .getAll('categoryId')
      .map(value => Number(value))
      .filter(Number.isFinite)
    const tags = url.searchParams
      .getAll('tag')
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean)
    const hasConceptImages = url.searchParams.get('hasConceptImages')

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
    if (categoryIds.length > 0) {
      models = models.filter(
        model => model.categoryId && categoryIds.includes(model.categoryId)
      )
    }
    if (tags.length > 0) {
      models = models.filter(model =>
        (model.tags ?? []).some(tag => tags.includes(tag.toLowerCase()))
      )
    }
    if (hasConceptImages !== null) {
      const wantsConceptImages = hasConceptImages === 'true'
      models = models.filter(
        m => (m.conceptImages ?? []).length > 0 === wantsConceptImages
      )
    }

    const enriched = await Promise.all(models.map(model => enrichModel(model)))

    if (url.searchParams.has('page')) {
      const result = paginate(enriched, page, pageSize)
      return HttpResponse.json({
        items: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }
    return HttpResponse.json(enriched)
  }),

  http.get('*/model-tags', async () => {
    const models = await getAll('models')
    const tags = [...new Set(models.flatMap(model => model.tags ?? []))]
      .sort((left, right) => left.localeCompare(right))
      .map(name => ({ name }))

    return HttpResponse.json({ tags })
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
    return HttpResponse.json(await enrichModel(model, true))
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
      tags: [],
      files: [demoFile],
      createdAt: ts,
      updatedAt: ts,
      activeVersionId: versionId,
      defaultTextureSetId: null,
      categoryId: null,
      conceptImages: [],
      textureSets: [],
      packs: [],
      projects: [],
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
      tags?: string[]
      description?: string
      categoryId?: number | null
    }
    model.tags = body.tags ?? model.tags
    model.description = body.description ?? model.description
    if (body.categoryId !== undefined) {
      model.categoryId = body.categoryId
    }
    model.updatedAt = now()
    await put('models', model)
    return HttpResponse.json({
      modelId: model.id,
      tags: model.tags,
      description: model.description,
      categoryId: model.categoryId ?? null,
    })
  }),

  http.post('*/models/:id/concept-images', async ({ params, request }) => {
    const model = await getById('models', Number(params.id))
    if (!model) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { fileId: number }
    const blob = await getFileBlob(body.fileId)
    if (!blob) return new HttpResponse(null, { status: 404 })

    const conceptImage = buildConceptImage(
      body.fileId,
      blob.fileName,
      blob.mimeType
    )
    conceptImage.sortOrder = model.conceptImages.length
    model.conceptImages = [...(model.conceptImages ?? []), conceptImage]
    model.updatedAt = now()
    await put('models', model)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/models/:id/concept-images/:fileId', async ({ params }) => {
    const model = await getById('models', Number(params.id))
    if (!model) return new HttpResponse(null, { status: 404 })
    model.conceptImages = (model.conceptImages ?? [])
      .filter(image => image.fileId !== Number(params.fileId))
      .map((image, index) => ({ ...image, sortOrder: index }))
    model.updatedAt = now()
    await put('models', model)
    return new HttpResponse(null, { status: 204 })
  }),

  http.get('*/model-categories', async () => {
    const categories = await getAll('modelCategories')
    return HttpResponse.json({
      categories: categories.map(category => ({
        id: category.id,
        name: category.name,
        description: category.description ?? undefined,
        parentId: category.parentId ?? null,
        path: buildCategoryPath(category, categories),
      })),
    })
  }),

  http.post('*/model-categories', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
      parentId?: number | null
    }
    const categories = await getAll('modelCategories')
    const duplicate = categories.find(
      category =>
        category.parentId === (body.parentId ?? null) &&
        category.name.trim().toLowerCase() === body.name.trim().toLowerCase()
    )
    if (duplicate) {
      return HttpResponse.json(
        {
          error: 'CategoryAlreadyExists',
          message: `A model category named '${body.name}' already exists in this branch.`,
        },
        { status: 400 }
      )
    }

    const id = await nextId('modelCategories')
    const ts = now()
    const category = {
      id,
      name: body.name,
      description: body.description ?? null,
      parentId: body.parentId ?? null,
      createdAt: ts,
      updatedAt: ts,
    }
    await put('modelCategories', category)
    return HttpResponse.json(
      {
        id: category.id,
        name: category.name,
        description: category.description ?? undefined,
        parentId: category.parentId ?? null,
        path: buildCategoryPath(category, [...categories, category]),
      },
      { status: 201 }
    )
  }),

  http.put('*/model-categories/:id', async ({ params, request }) => {
    const category = await getById('modelCategories', Number(params.id))
    if (!category) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name: string
      description?: string
      parentId?: number | null
    }
    const categories = await getAll('modelCategories')
    if (body.parentId === category.id) {
      return HttpResponse.json(
        {
          error: 'InvalidCategoryParent',
          message: 'A category cannot be its own parent.',
        },
        { status: 400 }
      )
    }

    let currentParentId = body.parentId ?? null
    while (currentParentId) {
      if (currentParentId === category.id) {
        return HttpResponse.json(
          {
            error: 'InvalidCategoryParent',
            message: 'A category cannot be moved under one of its descendants.',
          },
          { status: 400 }
        )
      }
      currentParentId =
        categories.find(item => item.id === currentParentId)?.parentId ?? null
    }

    const duplicate = categories.find(
      item =>
        item.id !== category.id &&
        item.parentId === (body.parentId ?? null) &&
        item.name.trim().toLowerCase() === body.name.trim().toLowerCase()
    )
    if (duplicate) {
      return HttpResponse.json(
        {
          error: 'CategoryAlreadyExists',
          message: `A model category named '${body.name}' already exists in this branch.`,
        },
        { status: 400 }
      )
    }

    category.name = body.name
    category.description = body.description ?? null
    category.parentId = body.parentId ?? null
    category.updatedAt = now()
    await put('modelCategories', category)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/model-categories/:id', async ({ params }) => {
    const categoryId = Number(params.id)
    const categories = await getAll('modelCategories')
    if (categories.some(category => category.parentId === categoryId)) {
      return HttpResponse.json(
        {
          error: 'CategoryHasChildren',
          message:
            'Delete or move child categories before removing this category.',
        },
        { status: 400 }
      )
    }

    await remove('modelCategories', categoryId)
    const models = await getAll('models')
    for (const model of models) {
      if (model.categoryId === categoryId) {
        model.categoryId = null
        await put('models', model)
      }
    }
    return new HttpResponse(null, { status: 204 })
  }),

  // Delete model (soft) → move to recycled
  http.delete('*/models/:id', async ({ params }) => {
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

    await storeFileBlob(
      fileId,
      file,
      file.name,
      file.type || inferMimeType(file, file.name, 'image/png')
    )

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

  http.delete('*/texture-sets/:id/hard', async ({ params }) => {
    await remove('textureSets', Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/texture-sets/:id', async ({ params }) => {
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
  //  ENVIRONMENT MAPS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/environment-maps', async ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '50')
    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')

    let environmentMaps = await getAll('environmentMaps')

    if (packId) {
      const id = Number(packId)
      environmentMaps = environmentMaps.filter(environmentMap =>
        (environmentMap.packs ?? []).some(pack => pack.id === id)
      )
    }

    if (projectId) {
      const id = Number(projectId)
      environmentMaps = environmentMaps.filter(environmentMap =>
        (environmentMap.projects ?? []).some(project => project.id === id)
      )
    }

    const items = environmentMaps.map(environmentMap =>
      toEnvironmentMapDto(environmentMap)
    )

    if (url.searchParams.has('page')) {
      const result = paginate(items, page, pageSize)
      return HttpResponse.json({
        environmentMaps: result.items,
        totalCount: result.totalCount,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      })
    }

    return HttpResponse.json({ environmentMaps: items })
  }),

  http.get('*/environment-maps/:id', async ({ params }) => {
    const environmentMap = await getById('environmentMaps', Number(params.id))
    if (!environmentMap) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(toEnvironmentMapDto(environmentMap))
  }),

  http.post('*/environment-maps/with-file', async ({ request }) => {
    const url = new URL(request.url)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

    const environmentMapId = await nextId('environmentMaps')
    const variantId = await nextId('environmentMapVariants')
    const fileId = await nextId('files')
    const ts = now()
    const name =
      url.searchParams.get('name') || file.name.replace(/\.[^.]+$/, '')
    const sizeLabel = url.searchParams.get('sizeLabel') || '1K'
    const previewUrl = `/files/${fileId}/preview?channel=rgb`
    const fileUrl = `/files/${fileId}`

    await storeFileBlob(
      fileId,
      file,
      file.name,
      file.type || inferMimeType(file, file.name, 'image/vnd.radiance')
    )

    const environmentMap: DemoEnvironmentMap = syncEnvironmentMapDerivedFields({
      id: environmentMapId,
      name,
      variantCount: 1,
      previewVariantId: variantId,
      previewFileId: fileId,
      previewUrl,
      createdAt: ts,
      updatedAt: ts,
      variants: [
        {
          id: variantId,
          sizeLabel,
          fileId,
          fileName: file.name,
          fileSizeBytes: file.size,
          createdAt: ts,
          updatedAt: ts,
          isDeleted: false,
          previewUrl,
          fileUrl,
        },
      ],
      packs: [],
      projects: [],
    })

    const packId = url.searchParams.get('packId')
    const projectId = url.searchParams.get('projectId')
    let trackPackName: string | null = null
    let trackProjectName: string | null = null

    if (packId) {
      const pack = await getById('packs', Number(packId))
      if (pack) {
        trackPackName = pack.name
        environmentMap.packs.push({ id: pack.id, name: pack.name })
        if (!pack.environmentMaps?.some(item => item.id === environmentMapId)) {
          pack.environmentMaps = [
            ...(pack.environmentMaps ?? []),
            { id: environmentMapId, name },
          ]
          recomputePackCounts(pack)
          pack.updatedAt = ts
          await put('packs', pack)
        }
      }
    }

    if (projectId) {
      const project = await getById('projects', Number(projectId))
      if (project) {
        trackProjectName = project.name
        environmentMap.projects.push({ id: project.id, name: project.name })
        if (
          !project.environmentMaps?.some(item => item.id === environmentMapId)
        ) {
          project.environmentMaps = [
            ...(project.environmentMaps ?? []),
            { id: environmentMapId, name },
          ]
          recomputeProjectCounts(project)
          project.updatedAt = ts
          await put('projects', project)
        }
      }
    }

    await put('environmentMaps', environmentMap)

    trackUpload({
      batchId: url.searchParams.get('batchId') || `batch-${Date.now()}`,
      uploadType: 'EnvironmentMap',
      fileId,
      fileName: file.name,
      packId: packId ? Number(packId) : null,
      packName: trackPackName,
      projectId: projectId ? Number(projectId) : null,
      projectName: trackProjectName,
      modelId: null,
      modelName: null,
      textureSetId: null,
      textureSetName: null,
      spriteId: null,
      spriteName: null,
      environmentMapId,
      environmentMapName: name,
    })

    return HttpResponse.json(
      {
        environmentMapId,
        name,
        variantId,
        fileId,
        previewVariantId: environmentMap.previewVariantId,
      },
      { status: 201 }
    )
  }),

  http.post(
    '*/environment-maps/:id/variants/with-file',
    async ({ params, request }) => {
      const environmentMap = await getById('environmentMaps', Number(params.id))
      if (!environmentMap) return new HttpResponse(null, { status: 404 })

      const url = new URL(request.url)
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) return HttpResponse.json({ error: 'No file' }, { status: 400 })

      const sizeLabel = url.searchParams.get('sizeLabel') || '1K'
      const duplicate = (environmentMap.variants ?? []).some(
        variant =>
          !variant.isDeleted &&
          variant.sizeLabel.toLowerCase() === sizeLabel.toLowerCase()
      )
      if (duplicate) {
        return HttpResponse.json(
          { error: 'EnvironmentMapVariantAlreadyExists' },
          { status: 400 }
        )
      }

      const variantId = await nextId('environmentMapVariants')
      const fileId = await nextId('files')
      const ts = now()
      const previewUrl = `/files/${fileId}/preview?channel=rgb`
      const fileUrl = `/files/${fileId}`

      await storeFileBlob(
        fileId,
        file,
        file.name,
        file.type || inferMimeType(file, file.name, 'image/vnd.radiance')
      )

      environmentMap.variants.push({
        id: variantId,
        sizeLabel,
        fileId,
        fileName: file.name,
        fileSizeBytes: file.size,
        createdAt: ts,
        updatedAt: ts,
        isDeleted: false,
        previewUrl,
        fileUrl,
      })
      environmentMap.updatedAt = ts
      syncEnvironmentMapDerivedFields(environmentMap)
      await put('environmentMaps', environmentMap)

      return HttpResponse.json({
        variantId,
        fileId,
        sizeLabel,
      })
    }
  ),

  http.delete('*/environment-maps/:id/soft', async ({ params }) => {
    const id = Number(params.id)
    const environmentMap = await getById('environmentMaps', id)
    if (environmentMap) {
      const recycledId = await nextId('recycledItems')
      await addRecycledItem({
        id: recycledId,
        type: 'environmentMap',
        entityId: id,
        name: environmentMap.name,
        deletedAt: now(),
        entity: { ...environmentMap } as unknown as Record<string, unknown>,
        extra: { previewFileId: environmentMap.previewFileId ?? null },
      })

      const packs = await getAll('packs')
      for (const pack of packs) {
        const before = pack.environmentMaps?.length ?? 0
        pack.environmentMaps = (pack.environmentMaps ?? []).filter(
          item => item.id !== id
        )
        if ((pack.environmentMaps?.length ?? 0) !== before) {
          recomputePackCounts(pack)
          await put('packs', pack)
        }
      }

      const projects = await getAll('projects')
      for (const project of projects) {
        const before = project.environmentMaps?.length ?? 0
        project.environmentMaps = (project.environmentMaps ?? []).filter(
          item => item.id !== id
        )
        if ((project.environmentMaps?.length ?? 0) !== before) {
          recomputeProjectCounts(project)
          await put('projects', project)
        }
      }
    }

    await remove('environmentMaps', id)
    return new HttpResponse(null, { status: 204 })
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

    await storeFileBlob(
      fileId,
      file,
      file.name,
      file.type || inferMimeType(file, file.name, 'image/png')
    )

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

  http.delete('*/sprites/:id', async ({ params }) => {
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

  http.delete('*/sounds/:id', async ({ params }) => {
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

  ...containerHandlers,
  ...systemHandlers,
]
