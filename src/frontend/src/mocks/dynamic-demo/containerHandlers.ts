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

/**
 * A small closed vocabulary for the demo. Not the server's 48 seeded options -
 * enough to show what the five dimensions are for, without turning the walkthrough
 * into a data-entry exercise.
 */
const demoProfileOptions: {
  id: number
  dimension: string
  name: string
  isBuiltIn: boolean
  isHidden: boolean
  sortOrder: number
}[] = [
  { dimension: 'engine', name: 'Unity' },
  { dimension: 'engine', name: 'Godot' },
  { dimension: 'engine', name: 'Blender' },
  { dimension: 'platform', name: 'PC' },
  { dimension: 'platform', name: 'Web' },
  { dimension: 'platform', name: 'Quest' },
  { dimension: 'genre', name: 'Adventure' },
  { dimension: 'genre', name: 'Simulation' },
  { dimension: 'style', name: 'Low Poly' },
  { dimension: 'style', name: 'Realistic' },
  { dimension: 'style', name: 'Stylized' },
  { dimension: 'perspective', name: 'Third Person' },
  { dimension: 'perspective', name: 'Top Down' },
].map((option, index) => ({
  ...option,
  id: 100 + index,
  isBuiltIn: true,
  isHidden: false,
  sortOrder: index,
}))

/**
 * The brief, assembled the way the server assembles it: a reading of the stored
 * profile rather than a stored answer.
 *
 * The guidance lines are what the panel shows verbatim, so the demo has to
 * produce real ones - an empty brief would demonstrate the opposite of the
 * feature, which is that the user can read exactly what the agent was told.
 */
function demoProjectBrief(project: DemoProject) {
  const stored = project.profile ?? { dimensions: {}, settings: {} }

  const values = (dimension: string) =>
    (stored.dimensions?.[dimension] ?? []).flatMap(assignment => {
      const option = demoProfileOptions.find(o => o.id === assignment.optionId)
      return option
        ? [
            {
              optionId: option.id,
              name: option.name,
              role: assignment.role ?? null,
            },
          ]
        : []
    })

  const styles = values('style')
  const platforms = values('platform')
  const engines = values('engine')
  const budget = {
    maxTrianglesPerAsset: stored.settings?.maxTrianglesPerAsset ?? null,
    maxTextureSize: stored.settings?.maxTextureSize ?? null,
    targetSceneTriangles: stored.settings?.targetSceneTriangles ?? null,
    pixelsPerUnit: null,
  }

  const guidance: string[] = []
  if (styles.length > 0) {
    guidance.push(
      `Prefer assets that read as ${styles.map(s => s.name).join(' or ')}.`
    )
  }
  if (budget.maxTrianglesPerAsset !== null) {
    guidance.push(
      `Keep every asset under ${budget.maxTrianglesPerAsset.toLocaleString()} triangles.`
    )
  }
  if (platforms.length > 0) {
    guidance.push(`This ships on ${platforms.map(p => p.name).join(', ')}.`)
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description ?? null,
    notes: project.notes ?? null,
    engines,
    platforms,
    genres: values('genre'),
    styles,
    perspectives: values('perspective'),
    budget,
    // The tightest selected platform decides. A hint beside an empty field,
    // never a value - the user accepts it or does not.
    budgetSuggestion: platforms.some(p => p.name === 'Quest')
      ? {
          maxTrianglesPerAsset: 5000,
          maxTextureSize: 1024,
          platform: 'Quest',
          note: 'Quest is the tightest platform here: 5,000 triangles per asset.',
        }
      : null,
    worldConvention: {
      unitsPerMetre: 1,
      upAxis: 'Y',
      handedness: 'right',
      isDefault: true,
      engineConversions: engines.map(
        e => `${e.name}: 1 unit = 1 m, Y up, right-handed`
      ),
      conflicts: [],
    },
    styleSignals: {
      maxTriangles: null,
      maxTextureSize: null,
      maxMaterials: null,
      preferredUvStatus: null,
      boostTokens: styles.map(s => s.name.toLowerCase()),
      penaltyTokens: [],
      familyHint: null,
      unmappedStyles: [],
    },
    paletteHex: [],
    conceptImages: [],
    environmentMaps: [],
    scenes: [],
    assetCounts: {
      models: project.modelCount ?? 0,
      textureSets: 0,
      sprites: project.spriteCount ?? 0,
      sounds: project.soundCount ?? 0,
      scripts: project.scriptCount ?? 0,
      environmentMaps: project.environmentMapCount ?? 0,
      scenes: 0,
    },
    guidance,
  }
}

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
      globalMaterialCount: 0,
      multiModelTextureCount: 0,
      spriteCount: 0,
      soundCount: 0,
      scriptCount: 0,
      isEmpty: true,
      customThumbnailFileId: null,
      customThumbnailUrl: null,
      models: [],
      textureSets: [],
      sprites: [],
      sounds: [],
      scripts: [],
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
      await recomputePackCounts(pack)
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
    await recomputePackCounts(pack)
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
      await recomputePackCounts(pack)
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
    await recomputePackCounts(pack)
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
      await recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:packId/sprites/:spriteId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    if (!pack) return new HttpResponse(null, { status: 404 })
    pack.sprites = pack.sprites.filter(s => s.id !== Number(params.spriteId))
    await recomputePackCounts(pack)
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
      await recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:packId/sounds/:soundId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    if (!pack) return new HttpResponse(null, { status: 404 })
    pack.sounds = pack.sounds.filter(s => s.id !== Number(params.soundId))
    await recomputePackCounts(pack)
    pack.updatedAt = now()
    await put('packs', pack)
    return new HttpResponse(null, { status: 204 })
  }),

  // Pack ↔ Script
  http.post('*/packs/:packId/scripts/:scriptId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    const script = await getById('scripts', Number(params.scriptId))
    if (!pack || !script) return new HttpResponse(null, { status: 404 })
    if (!(pack.scripts ?? []).some(s => s.id === script.id)) {
      pack.scripts = [
        ...(pack.scripts ?? []),
        { id: script.id, name: script.name },
      ]
      await recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/packs/:packId/scripts/:scriptId', async ({ params }) => {
    const pack = await getById('packs', Number(params.packId))
    if (!pack) return new HttpResponse(null, { status: 404 })
    pack.scripts = (pack.scripts ?? []).filter(
      s => s.id !== Number(params.scriptId)
    )
    await recomputePackCounts(pack)
    pack.updatedAt = now()
    await put('packs', pack)
    return new HttpResponse(null, { status: 204 })
  }),

  // Pack ↔ EnvironmentMap
  http.post(
    '*/packs/:packId/environment-maps/:environmentMapId',
    async ({ params }) => {
      const pack = await getById('packs', Number(params.packId))
      const environmentMap = await getById(
        'environmentMaps',
        Number(params.environmentMapId)
      )
      if (!pack || !environmentMap)
        return new HttpResponse(null, { status: 404 })
      if (!pack.environmentMaps?.some(item => item.id === environmentMap.id)) {
        pack.environmentMaps = [
          ...(pack.environmentMaps ?? []),
          { id: environmentMap.id, name: environmentMap.name },
        ]
        await recomputePackCounts(pack)
        pack.updatedAt = now()
        await put('packs', pack)
      }
      if (!environmentMap.packs.some(item => item.id === pack.id)) {
        environmentMap.packs.push({ id: pack.id, name: pack.name })
        await put('environmentMaps', environmentMap)
      }
      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.delete(
    '*/packs/:packId/environment-maps/:environmentMapId',
    async ({ params }) => {
      const pack = await getById('packs', Number(params.packId))
      const environmentMap = await getById(
        'environmentMaps',
        Number(params.environmentMapId)
      )
      if (!pack) return new HttpResponse(null, { status: 404 })
      pack.environmentMaps = (pack.environmentMaps ?? []).filter(
        item => item.id !== Number(params.environmentMapId)
      )
      await recomputePackCounts(pack)
      pack.updatedAt = now()
      await put('packs', pack)
      if (environmentMap) {
        environmentMap.packs = environmentMap.packs.filter(
          item => item.id !== pack.id
        )
        await put('environmentMaps', environmentMap)
      }
      return new HttpResponse(null, { status: 204 })
    }
  ),

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
        await recomputePackCounts(pack)
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

  // ════════════════════════════════════════════════════════════════════════
  //  PROJECT PROFILE (v0.6 prompt 13)
  // ════════════════════════════════════════════════════════════════════════
  //
  //  Ordered BEFORE `*/projects/:id`: MSW matches in order, and that route would
  //  otherwise swallow `/projects/profile-options` with id="profile-options".

  http.get('*/projects/profile-options', () =>
    HttpResponse.json({ options: demoProfileOptions })
  ),

  http.post('*/projects/profile-options', async ({ request }) => {
    const body = (await request.json()) as { dimension: string; name: string }
    const option = {
      id: 900 + demoProfileOptions.length,
      dimension: body.dimension,
      name: body.name,
      isBuiltIn: false,
      isHidden: false,
      sortOrder: 900 + demoProfileOptions.length,
    }
    demoProfileOptions.push(option)
    return HttpResponse.json(option)
  }),

  http.get('*/projects/:id/profile', async ({ params }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(demoProjectBrief(project))
  }),

  http.put('*/projects/:id/profile', async ({ params, request }) => {
    const project = await getById('projects', Number(params.id))
    if (!project) return new HttpResponse(null, { status: 404 })

    const body = (await request.json()) as {
      dimensions?: Record<string, { optionId: number; role?: string | null }[]>
      settings?: Record<string, number | null>
    }

    // Kept on the demo project so a save survives a reload, the way the real
    // one does. The demo is a walkthrough, and a form that forgot what was
    // typed would misrepresent the feature rather than simplify it.
    project.profile = {
      dimensions: body.dimensions ?? {},
      settings: body.settings ?? {},
    }
    await put('projects', project)

    return HttpResponse.json(demoProjectBrief(project))
  }),

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
      globalMaterialCount: 0,
      multiModelTextureCount: 0,
      spriteCount: 0,
      soundCount: 0,
      scriptCount: 0,
      isEmpty: true,
      customThumbnailFileId: null,
      customThumbnailUrl: null,
      conceptImages: [],
      models: [],
      textureSets: [],
      sprites: [],
      sounds: [],
      scripts: [],
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
      await recomputeProjectCounts(project)
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
    await recomputeProjectCounts(project)
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
      await recomputeProjectCounts(project)
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
      await recomputeProjectCounts(project)
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
      await recomputeProjectCounts(project)
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
    await recomputeProjectCounts(project)
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
      await recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:projectId/sounds/:soundId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    if (!project) return new HttpResponse(null, { status: 404 })
    project.sounds = project.sounds.filter(s => s.id !== Number(params.soundId))
    await recomputeProjectCounts(project)
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  // Project ↔ Script
  http.post('*/projects/:projectId/scripts/:scriptId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    const script = await getById('scripts', Number(params.scriptId))
    if (!project || !script) return new HttpResponse(null, { status: 404 })
    if (!(project.scripts ?? []).some(s => s.id === script.id)) {
      project.scripts = [
        ...(project.scripts ?? []),
        { id: script.id, name: script.name },
      ]
      await recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
    }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete('*/projects/:projectId/scripts/:scriptId', async ({ params }) => {
    const project = await getById('projects', Number(params.projectId))
    if (!project) return new HttpResponse(null, { status: 404 })
    project.scripts = (project.scripts ?? []).filter(
      s => s.id !== Number(params.scriptId)
    )
    await recomputeProjectCounts(project)
    project.updatedAt = now()
    await put('projects', project)
    return new HttpResponse(null, { status: 204 })
  }),

  // Project ↔ EnvironmentMap
  http.post(
    '*/projects/:projectId/environment-maps/:environmentMapId',
    async ({ params }) => {
      const project = await getById('projects', Number(params.projectId))
      const environmentMap = await getById(
        'environmentMaps',
        Number(params.environmentMapId)
      )
      if (!project || !environmentMap)
        return new HttpResponse(null, { status: 404 })
      if (
        !project.environmentMaps?.some(item => item.id === environmentMap.id)
      ) {
        project.environmentMaps = [
          ...(project.environmentMaps ?? []),
          { id: environmentMap.id, name: environmentMap.name },
        ]
        await recomputeProjectCounts(project)
        project.updatedAt = now()
        await put('projects', project)
      }
      if (!environmentMap.projects.some(item => item.id === project.id)) {
        environmentMap.projects.push({ id: project.id, name: project.name })
        await put('environmentMaps', environmentMap)
      }
      return new HttpResponse(null, { status: 204 })
    }
  ),

  http.delete(
    '*/projects/:projectId/environment-maps/:environmentMapId',
    async ({ params }) => {
      const project = await getById('projects', Number(params.projectId))
      const environmentMap = await getById(
        'environmentMaps',
        Number(params.environmentMapId)
      )
      if (!project) return new HttpResponse(null, { status: 404 })
      project.environmentMaps = (project.environmentMaps ?? []).filter(
        item => item.id !== Number(params.environmentMapId)
      )
      await recomputeProjectCounts(project)
      project.updatedAt = now()
      await put('projects', project)
      if (environmentMap) {
        environmentMap.projects = environmentMap.projects.filter(
          item => item.id !== project.id
        )
        await put('environmentMaps', environmentMap)
      }
      return new HttpResponse(null, { status: 204 })
    }
  ),

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
        await recomputeProjectCounts(project)
        project.updatedAt = ts
        await put('projects', project)
      }
      await put('textureSets', textureSet)

      return HttpResponse.json({ textureSetId: tsId }, { status: 201 })
    }
  ),
]
