import { http, HttpResponse } from 'msw'

import {
  type DemoEnvironmentMap,
  type DemoModel,
  type DemoScript,
  type DemoSound,
  type DemoSprite,
  type DemoTextureSet,
  findRecycledItem,
  getAll,
  getAllRecycledItems,
  getAllUploadHistory,
  getById,
  now,
  put,
  recomputePackCounts,
  recomputeProjectCounts,
  removeRecycledItem,
} from './shared'

/**
 * Demo scenes, held in memory for the session.
 *
 * Not persisted to the demo IndexedDB like the asset entities are: a scene
 * references assets by id and version, and the demo's ids are regenerated when
 * its database is seeded, so a scene surviving a reseed would point at assets
 * that no longer exist. A session-scoped scene is the honest version of the
 * feature to demo.
 */
interface DemoScene {
  id: number
  name: string
  description: string | null
  schemaVersion: number
  revision: number
  documentJson: string
  createdAt: string
  updatedAt: string
  /** The project this scene belongs to, or null (v0.6 prompt 13-C). */
  projectId: number | null
  projectName: string | null
}

/** What a person has typed about an asset in this demo session. */
const demoMetadata = new Map<string, Record<string, unknown>>()

/**
 * A cut-down metadata schema. The panel renders whatever it is given, so this
 * shows the shape - grouped fields, closed vocabularies, and a read-only
 * imported field with its provenance badge - without the server's full list.
 */
const demoMetadataFields = [
  {
    key: 'description',
    label: 'Description',
    group: 'descriptive',
    type: 'multiline',
    provenance: 'authored',
    storage: 'entity',
    repeats: false,
    readOnly: false,
  },
  {
    key: 'styles',
    label: 'Styles',
    group: 'descriptive',
    type: 'enum',
    provenance: 'authored',
    storage: 'metadata',
    repeats: true,
    readOnly: false,
    allowedValues: ['Low Poly', 'Realistic', 'Stylized', 'Voxel'],
  },
  {
    key: 'themes',
    label: 'Themes',
    group: 'descriptive',
    type: 'enum',
    provenance: 'authored',
    storage: 'metadata',
    repeats: true,
    readOnly: false,
    allowedValues: ['Fantasy', 'Sci-Fi', 'Modern', 'Historical'],
  },
  {
    key: 'license',
    label: 'Licence',
    group: 'rights',
    type: 'enum',
    provenance: 'authored',
    storage: 'metadata',
    repeats: false,
    readOnly: false,
    allowedValues: ['CC0', 'CC-BY', 'Proprietary'],
  },
  {
    key: 'author',
    label: 'Author',
    group: 'rights',
    type: 'text',
    provenance: 'authored',
    storage: 'metadata',
    repeats: false,
    readOnly: false,
  },
  {
    key: 'sourceKind',
    label: 'Source',
    group: 'provenance',
    type: 'text',
    provenance: 'imported',
    storage: 'metadata',
    repeats: false,
    readOnly: true,
    description: 'Where this asset came from. Written by the importer.',
  },
]

const demoMetadataFamilies = [
  'Model',
  'Sprite',
  'Sound',
  'TextureSet',
  'EnvironmentMap',
  'Material',
].map(assetType => ({ assetType, fields: demoMetadataFields }))

function demoMetadataResponse(assetType: string, assetId: number) {
  const stored = demoMetadata.get(`${assetType}:${assetId}`) ?? {}

  const fields = demoMetadataFields.map(field => ({
    key: field.key,
    group: field.group,
    type: field.type,
    repeats: field.repeats,
    readOnly: field.readOnly,
    provenance: field.provenance,
    storage: field.storage,
    value:
      stored[field.key] ??
      (field.key === 'sourceKind' ? 'demo-seed' : field.repeats ? [] : null),
  }))

  // Counted over what a person could fill, so a derived value cannot make an
  // asset look complete because the extractor did its job.
  const fillable = demoMetadataFields.filter(f => !f.readOnly)
  const filled = fillable.filter(f => {
    const value = stored[f.key]
    return Array.isArray(value) ? value.length > 0 : value != null
  })

  return {
    assetType,
    assetId,
    name: `${assetType} ${assetId}`,
    schemaVersion: Object.keys(stored).length > 0 ? 1 : 0,
    currentSchemaVersion: 1,
    fields,
    completeness: {
      fillableFieldCount: fillable.length,
      filledFieldCount: filled.length,
      missingKeys: fillable.filter(f => !filled.includes(f)).map(f => f.key),
    },
  }
}

const demoScenes = new Map<number, DemoScene>()
let nextDemoSceneId = 1

const emptySceneDocument = JSON.stringify({
  schemaVersion: 1,
  nodes: [],
  lights: [],
})

function demoSceneSummary(scene: DemoScene) {
  const document = JSON.parse(scene.documentJson) as {
    nodes: unknown[]
    lights: unknown[]
    stage?: string | null
  }

  return {
    id: scene.id,
    name: scene.name,
    description: scene.description,
    schemaVersion: scene.schemaVersion,
    revision: scene.revision,
    nodeCount: document.nodes.length,
    lightCount: document.lights.length,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    // Read off the document like the server does. The demo has no gate to
    // enforce the stage with, so this reports what the scene claims rather
    // than anything it has been checked against.
    stage: document.stage ?? null,
    projectId: scene.projectId,
    projectName: scene.projectName,
  }
}

/**
 * The demo cannot derive geometry, so every node reports unknown bounds and no
 * overlaps - which is exactly what the real server returns for an asset that
 * was never extracted, and what the editor is built to display honestly.
 */
function demoSceneView(scene: DemoScene) {
  const document = JSON.parse(scene.documentJson) as {
    nodes: Array<Record<string, unknown>>
    lights: unknown[]
  }

  return {
    scene: demoSceneSummary(scene),
    document,
    nodes: document.nodes.map(node => ({
      nodeId: node.id,
      name: node.name ?? null,
      slotId: node.slotId ?? null,
      asset: node.asset ?? null,
      primitive: node.primitive ?? null,
      transform: node.transform,
      material: node.material ?? null,
      // Per-slot bindings layered over the default one. Carried through for the
      // same reason the default binding is: the editor reads the node view, and
      // a demo scene that dropped them would render undressed.
      materialSlots: node.materialSlots ?? null,
      visible: node.visible ?? true,
      footprint: null,
      sourceDimensions: null,
      originConvention: null,
      gridSize: null,
      groundOffset: null,
      originInBounds: null,
      groundSnap: node.groundSnap ?? false,
      suspended: node.suspended ?? false,
      faceToward: node.faceToward ?? null,
      frontAxis: node.frontAxis ?? '+Z',
      anchor: node.anchor ?? null,
    })),
    overlaps: [],
    scaleWarnings: [],
  }
}

/**
 * Parameter materials for the demo. Held here rather than in the demo database
 * because a material is nothing but numbers - there are no files to seed, which
 * is the entire point of the type.
 */
const DEMO_MATERIALS = [
  demoMaterial(1, 'Matte Black Plastic', '#1A1A1A', 0.6, 0),
  demoMaterial(2, 'Brushed Brass', '#B5892B', 0.35, 1),
  demoMaterial(3, 'Warm Off-White Plaster', '#EDE6D8', 0.95, 0),
]

function demoMaterial(
  id: number,
  name: string,
  hex: string,
  roughness: number,
  metallic: number
) {
  const channel = (offset: number) => {
    const srgb = parseInt(hex.slice(offset, offset + 2), 16) / 255
    // The same sRGB -> linear curve the server applies, so the demo's numbers
    // are the numbers the real API would have stored.
    return srgb <= 0.04045
      ? srgb / 12.92
      : Math.pow((srgb + 0.055) / 1.055, 2.4)
  }

  return {
    id,
    name,
    description: null,
    categoryId: null,
    categoryName: null,
    previewGeometryType: 'sphere',
    requiresUvs: false,
    tags: [],
    createdAt: now(),
    updatedAt: now(),
    parameters: {
      baseColorR: channel(1),
      baseColorG: channel(3),
      baseColorB: channel(5),
      baseColorA: 1,
      baseColorHex: hex,
      roughness,
      metallic,
      emissiveR: 0,
      emissiveG: 0,
      emissiveB: 0,
      normalScale: 1,
      occlusionStrength: 1,
      ior: 1.5,
      alphaMode: 'Opaque',
      alphaCutoff: 0.5,
      doubleSided: false,
    },
  }
}

type DemoMaterial = ReturnType<typeof demoMaterial>

/**
 * Patches a demo material's parameters the way the server does: unmentioned
 * fields keep their value, and a supplied hex wins outright over the float
 * components rather than being layered with them.
 */
function applyParameters(
  material: DemoMaterial,
  patch: Record<string, unknown> | undefined
): DemoMaterial {
  if (!patch) return material

  const hex = patch.baseColorHex as string | undefined
  if (hex) {
    const rebuilt = demoMaterial(material.id, material.name, hex, 0, 0)
    material.parameters.baseColorHex = hex
    material.parameters.baseColorR = rebuilt.parameters.baseColorR
    material.parameters.baseColorG = rebuilt.parameters.baseColorG
    material.parameters.baseColorB = rebuilt.parameters.baseColorB
  }

  for (const key of [
    'baseColorA',
    'roughness',
    'metallic',
    'emissiveR',
    'emissiveG',
    'emissiveB',
    'normalScale',
    'occlusionStrength',
    'ior',
    'alphaMode',
    'alphaCutoff',
    'doubleSided',
  ] as const) {
    if (patch[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(material.parameters as any)[key] = patch[key]
    }
  }

  return material
}

export const systemHandlers = [
  // ════════════════════════════════════════════════════════════════════════
  //  MATERIALS
  // ════════════════════════════════════════════════════════════════════════

  // The merged surface the scene's material-slot picker reads: parameter
  // materials and Global (Universal) texture sets in one list, told apart by
  // `kind` and by `requiresUvs` rather than by which endpoint they came from.
  // Both halves are folded in here because the demo is where the merge is
  // seen - a picker showing only one kind would demonstrate the wrong thing.
  http.get('*/materials/library', async ({ request }) => {
    const url = new URL(request.url)
    const search = url.searchParams.get('searchName')?.toLowerCase() ?? ''
    const requiresUvs = url.searchParams.get('requiresUvs')

    const parameterEntries =
      requiresUvs === 'true'
        ? []
        : DEMO_MATERIALS.filter(material =>
            material.name.toLowerCase().includes(search)
          ).map(material => ({
            kind: 'Material' as const,
            id: material.id,
            name: material.name,
            description: material.description,
            categoryId: material.categoryId,
            categoryName: material.categoryName,
            requiresUvs: false,
            previewGeometryType: material.previewGeometryType,
            hasThumbnail: false,
            parameters: material.parameters,
            tiling: null,
            tags: material.tags,
            createdAt: material.createdAt,
            updatedAt: material.updatedAt,
          }))

    // Kind 1 is Universal - a Global Material. The other kinds belong to one
    // model and are not offered as something to dress another model with.
    const globalEntries =
      requiresUvs === 'false'
        ? []
        : (await getAll<DemoTextureSet>('textureSets'))
            .filter(
              set => set.kind === 1 && set.name.toLowerCase().includes(search)
            )
            .map(set => ({
              kind: 'GlobalMaterial' as const,
              id: set.id,
              name: set.name,
              description: null,
              categoryId: set.categoryId ?? null,
              categoryName: null,
              requiresUvs: true,
              previewGeometryType: set.previewGeometryType ?? 'sphere',
              hasThumbnail: Boolean(set.thumbnailPath),
              parameters: null,
              tiling: {
                tilingScaleX: set.tilingScaleX ?? 1,
                tilingScaleY: set.tilingScaleY ?? 1,
                uvMappingMode: set.uvMappingMode ?? 0,
                uvScale: set.uvScale ?? 1,
                channelCount: set.textureCount ?? 0,
              },
              tags: set.tags ?? [],
              createdAt: set.createdAt,
              updatedAt: set.updatedAt,
            }))

    const entries = [...parameterEntries, ...globalEntries]

    return HttpResponse.json({
      entries,
      totalCount: entries.length,
      page: null,
      pageSize: null,
      totalPages: null,
    })
  }),

  // Parameter materials only - what the PBR Materials page reads. Separate
  // from the merged surface above on purpose: the two are browsed apart.
  http.get('*/materials', async ({ request }) => {
    const url = new URL(request.url)
    const search = url.searchParams.get('searchName')?.toLowerCase() ?? ''

    return HttpResponse.json({
      materials: DEMO_MATERIALS.filter(material =>
        material.name.toLowerCase().includes(search)
      ),
    })
  }),

  http.post('*/materials', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string | null
      parameters?: Record<string, unknown>
    }

    const nextId = DEMO_MATERIALS.reduce((max, m) => Math.max(max, m.id), 0) + 1
    const created = applyParameters(
      demoMaterial(nextId, body.name, '#cccccc', 0.5, 0),
      body.parameters
    )
    created.description = body.description ?? null
    DEMO_MATERIALS.push(created)

    return HttpResponse.json(
      { id: created.id, name: created.name },
      {
        status: 201,
      }
    )
  }),

  http.put('*/materials/:id', async ({ params, request }) => {
    const material = DEMO_MATERIALS.find(m => m.id === Number(params.id))
    if (!material) {
      return HttpResponse.json(
        { error: 'MaterialNotFound', message: 'Material not found.' },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      name?: string
      description?: string | null
      parameters?: Record<string, unknown>
    }

    if (body.name !== undefined) material.name = body.name
    if (body.description !== undefined) material.description = body.description
    applyParameters(material, body.parameters)
    material.updatedAt = now()

    return HttpResponse.json(material)
  }),

  http.delete('*/materials/:id', async ({ params }) => {
    const index = DEMO_MATERIALS.findIndex(m => m.id === Number(params.id))
    if (index >= 0) DEMO_MATERIALS.splice(index, 1)

    return new HttpResponse(null, { status: 204 })
  }),

  http.get('*/materials/:id', async ({ params }) => {
    const material = DEMO_MATERIALS.find(m => m.id === Number(params.id))

    return material
      ? HttpResponse.json(material)
      : HttpResponse.json(
          { error: 'MaterialNotFound', message: 'Material not found.' },
          { status: 404 }
        )
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  SCENES
  // ════════════════════════════════════════════════════════════════════════

  http.get('*/scenes', async () => {
    return HttpResponse.json({
      scenes: [...demoScenes.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(demoSceneSummary),
    })
  }),

  // Literal route before /scenes/:id. The demo has the same batched contract as the real
  // API even though it has no derivation/preview worker behind the returned empty list.
  http.post('*/scenes/resources/resolve', async ({ request }) => {
    const body = (await request.json()) as {
      assets?: Array<{
        assetType: string
        assetId: number
        versionId?: number | null
      }>
    }

    const resources = await Promise.all(
      (body.assets ?? []).map(async asset => {
        const failure = (errorCode: string, errorMessage: string) => ({
          asset,
          resolved: false,
          original: null,
          totalSizeBytes: null,
          triangleCount: null,
          materialCount: null,
          auxiliaries: [],
          previews: [],
          errorCode,
          errorMessage,
        })

        if (asset.assetType === 'Model') {
          if (asset.versionId == null) {
            return failure(
              'SceneResources.ModelVersionRequired',
              'A model resource must pin a versionId.'
            )
          }
          const version = await getById('modelVersions', asset.versionId)
          if (!version || version.modelId !== asset.assetId) {
            return failure(
              'SceneResources.ModelVersionNotFound',
              `Model ${asset.assetId} version ${asset.versionId} was not found.`
            )
          }
          const file =
            version.files.find(candidate => candidate.isRenderable) ??
            version.files[0]
          if (!file) {
            return failure(
              'SceneResources.RenderableFileMissing',
              `Model ${asset.assetId} version ${asset.versionId} has no renderable file.`
            )
          }
          return {
            asset,
            resolved: true,
            original: {
              fileId: file.id,
              originalFileName: file.originalFileName,
              format: file.fileType,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              sha256Hash: `demo-${file.id}`,
            },
            totalSizeBytes: file.sizeBytes,
            triangleCount: version.triangleCount ?? null,
            materialCount: version.materialCount ?? null,
            auxiliaries: [],
            previews: [],
            errorCode: null,
            errorMessage: null,
          }
        }

        if (asset.versionId != null) {
          return failure(
            'SceneResources.UnversionedAsset',
            `${asset.assetType} resources must not pin a versionId.`
          )
        }

        if (asset.assetType === 'Sprite') {
          const sprite = await getById('sprites', asset.assetId)
          if (!sprite) {
            return failure(
              'SceneResources.SpriteNotFound',
              `There is no sprite with id ${asset.assetId}.`
            )
          }
          return {
            asset,
            resolved: true,
            original: {
              fileId: sprite.fileId,
              originalFileName: sprite.fileName,
              format: sprite.fileName.split('.').pop()?.toLowerCase() ?? '',
              mimeType: 'image/*',
              sizeBytes: sprite.fileSizeBytes,
              sha256Hash: `demo-${sprite.fileId}`,
            },
            totalSizeBytes: sprite.fileSizeBytes,
            triangleCount: null,
            materialCount: null,
            auxiliaries: [],
            previews: [],
            errorCode: null,
            errorMessage: null,
          }
        }

        if (asset.assetType === 'EnvironmentMap') {
          const environmentMap = await getById('environmentMaps', asset.assetId)
          const variant =
            environmentMap?.variants.find(
              candidate => candidate.id === environmentMap.previewVariantId
            ) ??
            environmentMap?.variants.find(candidate => !candidate.isDeleted)
          const representative =
            variant?.panoramicFile ?? variant?.cubeFaces?.pz
          const fileId =
            representative?.fileId ?? variant?.previewFileId ?? variant?.fileId
          if (!environmentMap || !variant || fileId == null) {
            return failure(
              'SceneResources.EnvironmentMapNotFound',
              `Environment map ${asset.assetId} has no preview file.`
            )
          }
          const fileName = representative?.fileName ?? variant.fileName
          const sizeBytes =
            representative?.fileSizeBytes ?? variant.fileSizeBytes ?? 0
          return {
            asset,
            resolved: true,
            original: {
              fileId,
              originalFileName: fileName,
              format: fileName.split('.').pop()?.toLowerCase() ?? '',
              mimeType: 'image/*',
              sizeBytes,
              sha256Hash: `demo-${fileId}`,
            },
            totalSizeBytes: sizeBytes,
            triangleCount: null,
            materialCount: null,
            auxiliaries: [],
            previews: [],
            errorCode: null,
            errorMessage: null,
          }
        }

        return failure(
          'SceneResources.UnsupportedAssetType',
          `'${asset.assetType}' is not a placeable scene asset family.`
        )
      })
    )

    return HttpResponse.json({ resources })
  }),

  // Declared before the /scenes/:id handler because MSW matches in order, and
  // ':id' would otherwise swallow this path.
  http.get('*/scenes/asset-facts', async ({ request }) => {
    const url = new URL(request.url)
    const versionId = url.searchParams.get('versionId')

    // The demo has no extraction pipeline, so nothing is derived. Nulls here
    // are the same answer the real server gives for an un-extracted asset:
    // placement still works, and the editor says the bounds are unknown.
    return HttpResponse.json({
      assetType: url.searchParams.get('assetType') ?? 'Model',
      assetId: Number(url.searchParams.get('assetId') ?? 0),
      versionId: versionId ? Number(versionId) : null,
      sourceDimensions: null,
      originConvention: null,
      gridSize: null,
      groundedYAtOrigin: null,
      originInBounds: null,
    })
  }),

  // Also declared before '/scenes/:id'. Demo scenes are composed by hand rather
  // than proposed by an agent, so this always answers "no open decisions" - and
  // the choices panel renders nothing at all for that, which is the correct
  // demo experience rather than an empty frame.
  // ══════════════════════════════════════════════════════════════════════════
  //  ASSET METADATA (v0.6 prompt 16)
  // ══════════════════════════════════════════════════════════════════════════
  //
  //  The demo carries a cut-down schema rather than the server's full one: enough
  //  to show what the panel is for - one contract over every family, with the
  //  vocabularies closed - without turning a walkthrough into data entry.

  http.get('*/metadata/schema', ({ request }) => {
    const family = new URL(request.url).searchParams.get('assetType')
    const families = demoMetadataFamilies.filter(
      f => !family || f.assetType === family
    )
    return HttpResponse.json({ version: 1, families })
  }),

  http.get('*/metadata/:assetType/:assetId', ({ params }) =>
    HttpResponse.json(
      demoMetadataResponse(String(params.assetType), Number(params.assetId))
    )
  ),

  http.patch('*/metadata/:assetType/:assetId', async ({ params, request }) => {
    const assetType = String(params.assetType)
    const assetId = Number(params.assetId)
    const patch = (await request.json()) as Record<string, unknown>

    // A merge, exactly as the server does it: an absent key leaves the field
    // alone and an explicit null clears it. A demo that replaced would teach the
    // opposite of the contract.
    const stored = demoMetadata.get(`${assetType}:${assetId}`) ?? {}
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete stored[key]
      } else {
        stored[key] = value
      }
    }
    demoMetadata.set(`${assetType}:${assetId}`, stored)

    return HttpResponse.json(demoMetadataResponse(assetType, assetId))
  }),

  // Linking is a scene write in the real server - the revision moves and it is
  // audited - so the demo moves the revision too rather than treating it as a label.
  http.put('*/scenes/:id/project', async ({ params, request }) => {
    const scene = demoScenes.get(Number(params.id))
    if (!scene) {
      return HttpResponse.json(
        { error: 'SceneNotFound', message: 'No such scene.' },
        { status: 404 }
      )
    }

    const body = (await request.json()) as { projectId: number | null }
    const previousProjectId = scene.projectId
    const project =
      body.projectId === null ? null : await getById('projects', body.projectId)

    scene.projectId = project?.id ?? null
    scene.projectName = project?.name ?? null
    scene.revision += 1
    scene.updatedAt = now()

    return HttpResponse.json({
      sceneId: scene.id,
      projectId: scene.projectId,
      previousProjectId,
      revision: scene.revision,
    })
  }),

  http.get('*/scenes/:id/slots', async ({ params }) => {
    const scene = demoScenes.get(Number(params.id))
    return scene
      ? HttpResponse.json({
          scene: demoSceneSummary(scene),
          slots: [],
          recommendationSummary: null,
        })
      : HttpResponse.json(
          { error: 'Scene.NotFound', message: 'No such scene.' },
          { status: 404 }
        )
  }),

  http.get('*/scenes/:id', async ({ params }) => {
    const scene = demoScenes.get(Number(params.id))
    return scene
      ? HttpResponse.json(demoSceneView(scene))
      : HttpResponse.json(
          { error: 'Scene.NotFound', message: 'No such scene.' },
          { status: 404 }
        )
  }),

  http.post('*/scenes', async ({ request }) => {
    const body = (await request.json()) as {
      name: string
      description?: string
    }
    const timestamp = now()
    const scene: DemoScene = {
      id: nextDemoSceneId++,
      name: body.name,
      description: body.description ?? null,
      schemaVersion: 1,
      revision: 1,
      documentJson: emptySceneDocument,
      createdAt: timestamp,
      updatedAt: timestamp,
      projectId: null,
      projectName: null,
    }
    demoScenes.set(scene.id, scene)

    return HttpResponse.json(demoSceneView(scene), { status: 201 })
  }),

  http.put('*/scenes/:id/document', async ({ params, request }) => {
    const scene = demoScenes.get(Number(params.id))
    if (!scene) {
      return HttpResponse.json(
        { error: 'Scene.NotFound', message: 'No such scene.' },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      documentJson: string
      expectedRevision?: number
    }

    // The revision check is mirrored so the demo behaves like the server when
    // two tabs edit one scene, rather than accepting a stale write silently.
    if (
      body.expectedRevision != null &&
      body.expectedRevision !== scene.revision
    ) {
      return HttpResponse.json(
        {
          error: 'Scene.RevisionConflict',
          message: `Scene ${scene.id} is at revision ${scene.revision}, not the expected ${body.expectedRevision}.`,
        },
        { status: 400 }
      )
    }

    scene.documentJson = body.documentJson
    scene.revision += 1
    scene.updatedAt = now()

    return HttpResponse.json(demoSceneView(scene))
  }),

  http.put('*/scenes/:id', async ({ params, request }) => {
    const scene = demoScenes.get(Number(params.id))
    if (!scene) {
      return HttpResponse.json(
        { error: 'Scene.NotFound', message: 'No such scene.' },
        { status: 404 }
      )
    }

    const body = (await request.json()) as {
      name: string
      description?: string
    }
    scene.name = body.name
    scene.description = body.description ?? scene.description
    scene.updatedAt = now()

    return HttpResponse.json(demoSceneSummary(scene))
  }),

  http.delete('*/scenes/:id', async ({ params }) => {
    demoScenes.delete(Number(params.id))
    return new HttpResponse(null, { status: 204 })
  }),

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
      thumbnailSize: 256,
      generateThumbnailOnUpload: true,
      generateAnimatedThumbnail: true,
      textureProxySize: 512,
      blenderPath: 'blender',
      blenderEnabled: false,
      duplicateNamePolicy: 'Allow',
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

  http.get('*/settings/webdav/urls', async () => {
    return HttpResponse.json({
      urls: [],
    })
  }),

  http.get('*/settings/webdav/probe', async () => {
    return HttpResponse.json({
      reachable: false,
      folderCount: 0,
      error: 'WebDAV is not available in demo mode',
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

  http.put('*/settings/:key', async ({ params, request }) => {
    const body = (await request.json()) as { value: string }
    return HttpResponse.json({
      key: params.key,
      value: body.value,
      updatedAt: now(),
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
    const environmentMaps = allRecycled
      .filter(r => r.type === 'environmentMap')
      .map(r => ({
        id: r.entityId,
        name: r.name,
        deletedAt: r.deletedAt,
        previewFileId: (r.extra?.previewFileId as number) ?? null,
      }))
    const scripts = allRecycled
      .filter(r => r.type === 'script')
      .map(r => ({
        id: r.entityId,
        name: r.name,
        fileId: (r.extra?.fileId as number) ?? 0,
        language: (r.extra?.language as string) ?? 'plaintext',
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
      scripts,
      environmentMaps,
      environmentMapVariants: [],
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
        } else if (type === 'script') {
          await put('scripts', item.entity as unknown as DemoScript)
        } else if (type === 'environmentMap') {
          const environmentMap = item.entity as unknown as DemoEnvironmentMap
          await put('environmentMaps', environmentMap)

          for (const packRef of environmentMap.packs ?? []) {
            const pack = await getById('packs', packRef.id)
            if (!pack) continue
            if (
              !pack.environmentMaps?.some(
                entry => entry.id === environmentMap.id
              )
            ) {
              pack.environmentMaps = [
                ...(pack.environmentMaps ?? []),
                { id: environmentMap.id, name: environmentMap.name },
              ]
              await recomputePackCounts(pack)
              await put('packs', pack)
            }
          }

          for (const projectRef of environmentMap.projects ?? []) {
            const project = await getById('projects', projectRef.id)
            if (!project) continue
            if (
              !project.environmentMaps?.some(
                entry => entry.id === environmentMap.id
              )
            ) {
              project.environmentMaps = [
                ...(project.environmentMaps ?? []),
                { id: environmentMap.id, name: environmentMap.name },
              ]
              await recomputeProjectCounts(project)
              await put('projects', project)
            }
          }
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
      } else if (type === 'script') {
        const script = item.entity as unknown as DemoScript
        filesToDelete.push({
          filePath: script.fileName,
          originalFileName: script.fileName,
          sizeBytes: script.fileSizeBytes ?? 0,
        })
      } else if (type === 'environmentMap') {
        const environmentMap = item.entity as unknown as DemoEnvironmentMap
        for (const variant of environmentMap.variants ?? []) {
          filesToDelete.push({
            filePath: variant.fileName,
            originalFileName: variant.fileName,
            sizeBytes: variant.fileSizeBytes ?? 0,
          })
        }
        relatedEntities.push(
          `${(environmentMap.variants ?? []).filter(variant => !variant.isDeleted).length} variant(s)`
        )
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
  //  SIGNALR (thumbnailHub) - no-op stubs to prevent 405 errors
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
