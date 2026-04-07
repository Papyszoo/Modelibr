import { http, HttpResponse } from 'msw'

import {
  buildConceptImage,
  type DemoPack,
  type DemoProject,
  type DemoTextureSet,
  getAll,
  getById,
  getFileBlob,
  inferMimeType,
  nextId,
  now,
  parseTextureType,
  put,
  recomputePackCounts,
  recomputeProjectCounts,
  remove,
  storeFileBlob,
  toPackDto,
  toProjectDto,
} from './shared'

export const containerHandlers = [
  // ════════════════════════════════════════════════════════════════════════
  //  PACKS
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/packs', async () => {
    const packs = await getAll('packs')
    return HttpResponse.json({ packs: packs.map(toPackDto) })
  }),

  http.get('*/packs/:id', async ({ params }) => {
    const pack = await getById('packs', Number(params.id))
    if (!pack) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(toPackDto(pack))
  }),

  http.post('*/packs', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
      licenseType?: string
      url?: string
    }
    const id = await nextId('packs')
    const ts = now()
    const pack: DemoPack = {
      id,
      name: body.name,
      description: body.description ?? '',
      licenseType: body.licenseType ?? '',
      url: body.url ?? '',
      createdAt: ts,
      updatedAt: ts,
      modelCount: 0,
      textureSetCount: 0,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: true,
      customThumbnailFileId: null,
      customThumbnailUrl: null,
      models: [],
      textureSets: [],
      sprites: [],
      sounds: [],
    }
    await put('packs', pack)
    return HttpResponse.json(toPackDto(pack), { status: 201 })
  }),

  http.put('*/packs/:id', async ({ params, request }) => {
    const pack = await getById('packs', Number(params.id))
    if (!pack) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name: string
      description?: string
      licenseType?: string
      url?: string
    }
    pack.name = body.name
    if (body.description !== undefined) pack.description = body.description
    if (body.licenseType !== undefined) pack.licenseType = body.licenseType
    if (body.url !== undefined) pack.url = body.url
    pack.updatedAt = now()
    await put('packs', pack)
    return new HttpResponse(null, { status: 204 })
  }),

  http.put('*/packs/:id/thumbnail', async ({ params, request }) => {
    const pack = await getById('packs', Number(params.id))
    if (!pack) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { fileId?: number | null }
    pack.customThumbnailFileId = body.fileId ?? null
    pack.customThumbnailUrl = body.fileId
      ? `/files/${body.fileId}/preview?channel=rgb`
      : null
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

      await storeFileBlob(
        fileId,
        file,
        file.name,
        file.type || inferMimeType(file, file.name, 'image/png')
      )

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
    return HttpResponse.json({ projects: projects.map(toProjectDto) })
  }),

  http.get('*/projects/:id', async ({ params }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(toProjectDto(project))
  }),

  http.post('*/projects', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
      notes?: string
    }
    const id = await nextId('projects')
    const ts = now()
    const project: DemoProject = {
      id,
      name: body.name,
      description: body.description ?? '',
      notes: body.notes ?? '',
      createdAt: ts,
      updatedAt: ts,
      modelCount: 0,
      textureSetCount: 0,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: true,
      customThumbnailFileId: null,
      customThumbnailUrl: null,
      conceptImages: [],
      models: [],
      textureSets: [],
      sprites: [],
      sounds: [],
    }
    await put('projects', project)
    return HttpResponse.json(toProjectDto(project), { status: 201 })
  }),

  http.put('*/projects/:id', async ({ params, request }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as {
      name: string
      description?: string
      notes?: string
    }
    project.name = body.name
    if (body.description !== undefined) project.description = body.description
    if (body.notes !== undefined) project.notes = body.notes
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  http.put('*/projects/:id/thumbnail', async ({ params, request }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { fileId?: number | null }
    project.customThumbnailFileId = body.fileId ?? null
    project.customThumbnailUrl = body.fileId
      ? `/files/${body.fileId}/preview?channel=rgb`
      : null
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post('*/projects/:id/concept-images', async ({ params, request }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    const body = (await request.json()) as { fileId: number }
    const blob = await getFileBlob(body.fileId)
    if (!blob) return new HttpResponse(null, { status: 404 })

    const conceptImage = buildConceptImage(
      body.fileId,
      blob.fileName,
      blob.mimeType
    )
    conceptImage.sortOrder = project.conceptImages.length
    project.conceptImages = [...(project.conceptImages ?? []), conceptImage]
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:id/concept-images/:fileId', async ({ params }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    project.conceptImages = (project.conceptImages ?? [])
      .filter(image => image.fileId !== Number(params.fileId))
      .map((image, index) => ({ ...image, sortOrder: index }))
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
    if (!(model.projects ?? []).some(p => p.id === project.id)) {
      model.projects = [
        ...(model.projects ?? []),
        { id: project.id, name: project.name },
      ]
      await put('models', model)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:projectId/models/:modelId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    const model = await getById('models', Number(params.modelId))
    if (!project) return new HttpResponse(null, { status: 404 })
    project.models = project.models.filter(m => m.id !== Number(params.modelId))
    recomputeProjectCounts(project)
    project.updatedAt = now()
    await put('projects', project)
    if (model) {
      model.projects = (model.projects ?? []).filter(p => p.id !== project.id)
      await put('models', model)
    }
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

      await storeFileBlob(
        fileId,
        file,
        file.name,
        file.type || inferMimeType(file, file.name, 'image/png')
      )

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
]
