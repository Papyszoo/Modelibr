import { http, HttpResponse } from 'msw'

import { BASE_MESHES_COMMIT } from '../db/baseMeshesSeed'
import { meshHash, missingMeshes } from './importGapFill'
import type { DemoModel, DemoModelVersion, DemoPack } from '../db/demoDb'
import {
  getAll,
  nextId,
  now,
  put,
  recomputePackCounts,
  seedFileAssets,
  seedRemoteThumbnails,
} from './shared'

/**
 * Demo Asset Store — fakes the companion store's Modelibr-integration
 * endpoints (login/refresh/library/import-token, contract: store repo
 * docs/INTEGRATION.md) plus the local /store-imports job so the Asset Store
 * page fully works in demo mode. Any email/password signs in. "Imports"
 * create a real demo pack whose models point at the Base Meshes fork
 * (SHA-pinned raw URLs, same source the seeded pack uses).
 */

const STORE_URL = import.meta.env.VITE_STORE_URL || ''
const storeEndpoint = (path: string) => `${STORE_URL}${path}`

const RAW_BASE = `https://raw.githubusercontent.com/Papyszoo/base-meshes/${BASE_MESHES_COMMIT}/models`
const glbUrl = (name: string) => `${RAW_BASE}/${name}/${name}.glb`
const webpUrl = (name: string) => `${RAW_BASE}/${name}/${name}.webp`
const pngUrl = (name: string) => `${RAW_BASE}/${name}/${name}.png`

interface StorePackDefinition {
  assetId: string
  title: string
  description: string
  /** Base-mesh folder names — must exist in the fork at the pinned SHA. */
  meshes: { name: string; sizeBytes: number }[]
}

// Only meshes already referenced by the seeded Base Meshes subset are used,
// so every URL is known-good at the pinned commit.
const STORE_PACKS: StorePackDefinition[] = [
  {
    assetId: 'demo-store-medieval-props',
    title: 'Medieval Props (CC0)',
    description:
      'Forge and armory base meshes from thebasemesh.com — imported from the demo Asset Store.',
    meshes: [
      { name: 'anvil', sizeBytes: 27964 },
      { name: 'battle_axe', sizeBytes: 46272 },
      { name: 'round_shield', sizeBytes: 48880 },
      { name: 'goblet_01', sizeBytes: 41444 },
    ],
  },
  {
    assetId: 'demo-store-retro-tech',
    title: 'Retro Tech (CC0)',
    description:
      'Retro electronics base meshes from thebasemesh.com — imported from the demo Asset Store.',
    meshes: [
      { name: 'retro_tv', sizeBytes: 239692 },
      { name: 'retro_computer', sizeBytes: 65280 },
      { name: 'vintage_phone', sizeBytes: 473288 },
      { name: 'computer_keyboard', sizeBytes: 107104 },
    ],
  },
]

const displayName = (name: string) =>
  name
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

function toLibraryItem(def: StorePackDefinition) {
  return {
    assetId: def.assetId,
    title: def.title,
    author: 'The Base Mesh',
    // Mirrors the store's LibraryEntryResponse.ItemTypes (its CategoryName is gone).
    itemTypes: ['Model'],
    license: 'CC0',
    isPack: true,
    fileCount: def.meshes.length,
    totalSize: def.meshes.reduce((sum, m) => sum + m.sizeBytes, 0),
    previewThumbnailUrl: pngUrl(def.meshes[0].name),
    addedAt: '2026-07-01T00:00:00+00:00',
  }
}

// Stable manifest item id for a mesh — the value the backend filters on for a
// partial import, and what the detail view's checkboxes select.
const packItemId = (assetId: string, meshName: string) =>
  `${assetId}::${meshName}`

/** Asset detail (GET /api/assets/{id}) — items/files/previews the pick-list needs. */
function toAssetDetail(def: StorePackDefinition) {
  return {
    id: def.assetId,
    title: def.title,
    author: 'The Base Mesh',
    isPack: true,
    items: def.meshes.map(mesh => ({
      id: packItemId(def.assetId, mesh.name),
      itemType: 'Model',
      name: displayName(mesh.name),
      isPreviewable: true,
      fileIds: [`${def.assetId}::${mesh.name}::glb`],
    })),
    files: def.meshes.map(mesh => ({
      id: `${def.assetId}::${mesh.name}::glb`,
      fileName: `${mesh.name}.glb`,
      relativePath: `${mesh.name}/${mesh.name}.glb`,
      fileSize: mesh.sizeBytes,
    })),
    previews: def.meshes.map(mesh => ({
      id: `${def.assetId}::${mesh.name}::thumb`,
      type: 'Turntable',
      url: webpUrl(mesh.name),
      fileName: `${mesh.name}.webp`,
      packItemId: packItemId(def.assetId, mesh.name),
    })),
  }
}

// In-memory job table — demo imports are transient; each GET advances the
// job so the page's polling shows live progress without SignalR.
interface DemoImportJob {
  id: number
  assetId: string
  /** The mesh subset this job imports (respects a partial selection). */
  meshes: { name: string; sizeBytes: number }[]
  itemsTotal: number
  itemsProcessed: number
  packId: number | null
  status: 'Running' | 'Completed'
  createdAt: string
}

let nextJobId = 1
const jobs = new Map<number, DemoImportJob>()

async function findImportedPack(assetId: string): Promise<DemoPack | null> {
  const packs = await getAll('packs')
  return packs.find(p => p.storeImportAssetId === assetId) ?? null
}

/**
 * Creates the demo pack + models for a finished import.
 *
 * Re-import GAP-FILLS: it adds the meshes the pack does not have yet and leaves the
 * rest alone, which is what the real importer does (StoreImportProcessor dedupes by
 * file hash and reports "gap-filled N missing file(s)"). Returning the existing pack
 * untouched made a demo re-import of previously-unselected items silently do nothing
 * while still reporting success.
 */
async function materializeImport(
  def: StorePackDefinition,
  meshes: { name: string; sizeBytes: number }[]
): Promise<number> {
  const existing = await findImportedPack(def.assetId)

  // Which meshes this pack already holds, by the same hash the importer dedupes on.
  const packModels = existing
    ? (await getAll('models')).filter(m =>
        m.packs?.some(p => p.id === existing.id)
      )
    : []

  const missing = missingMeshes(meshes, packModels)
  if (existing && missing.length === 0) return existing.id

  const ts = now()
  const packId = existing?.id ?? (await nextId('packs'))
  const modelRefs: { id: number; name: string }[] = existing
    ? [...(existing.models ?? [])]
    : []

  for (const mesh of missing) {
    const modelId = await nextId('models')
    const versionId = await nextId('modelVersions')
    const fileId = await nextId('files')

    const model: DemoModel = {
      id: modelId,
      name: displayName(mesh.name),
      description: 'Imported from the demo Asset Store (CC0 base mesh).',
      tags: ['cc0', 'store import'],
      files: [
        {
          id: fileId,
          originalFileName: `${mesh.name}.glb`,
          storedFileName: `${mesh.name}.glb`,
          filePath: `${mesh.name}.glb`,
          mimeType: 'model/gltf-binary',
          sizeBytes: mesh.sizeBytes,
          sha256Hash: meshHash(mesh.name),
          fileType: 'glb',
          isRenderable: true,
          createdAt: ts,
          updatedAt: ts,
        },
      ],
      createdAt: ts,
      updatedAt: ts,
      activeVersionId: versionId,
      defaultTextureSetId: null,
      categoryId: null,
      conceptImages: [],
      textureSets: [],
      packs: [{ id: packId, name: def.title }],
      projects: [],
    }

    const version: DemoModelVersion = {
      id: versionId,
      modelId,
      versionNumber: 1,
      description: 'Imported from the demo Asset Store',
      createdAt: ts,
      defaultTextureSetId: null,
      thumbnailUrl: null,
      pngThumbnailUrl: null,
      files: [
        {
          id: fileId,
          originalFileName: `${mesh.name}.glb`,
          mimeType: 'model/gltf-binary',
          fileType: 'glb',
          sizeBytes: mesh.sizeBytes,
          isRenderable: true,
        },
      ],
      materialNames: [],
      mainVariantName: '',
      variantNames: [],
      textureMappings: [],
      textureSetIds: [],
    }

    // Serve the GLB + pre-rendered thumbnail from the SHA-pinned fork,
    // exactly like the seeded Base Meshes pack.
    seedFileAssets[fileId] = glbUrl(mesh.name)
    seedRemoteThumbnails[`model:${modelId}`] = webpUrl(mesh.name)
    seedRemoteThumbnails[`version:${versionId}`] = webpUrl(mesh.name)

    await put('models', model)
    await put('modelVersions', version)
    modelRefs.push({ id: modelId, name: model.name })
  }

  const pack: DemoPack = {
    ...(existing ?? {}),
    id: packId,
    name: def.title,
    description: def.description,
    licenseType: 'CC0',
    url: STORE_URL,
    // A gap-filling re-import keeps the pack's original creation time; only
    // updatedAt and the provenance stamp move (as the real importer does).
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    modelCount: modelRefs.length,
    globalMaterialCount: 0,
    multiModelTextureCount: 0,
    spriteCount: 0,
    soundCount: 0,
    scriptCount: 0,
    isEmpty: false,
    customThumbnailFileId: null,
    customThumbnailUrl: null,
    storeImportUrl: STORE_URL,
    storeImportAssetId: def.assetId,
    storeImportedAt: ts,
    models: modelRefs,
    textureSets: [],
    sprites: [],
    sounds: [],
    scripts: [],
  }
  await recomputePackCounts(pack)
  await put('packs', pack)
  return packId
}

function toJobDto(job: DemoImportJob) {
  return {
    id: job.id,
    status: job.status,
    packId: job.packId,
    storeAssetId: job.assetId,
    manifestSchemaVersion: 1,
    itemsTotal: job.itemsTotal,
    itemsCreated: job.itemsProcessed,
    itemsSkipped: 0,
    itemsFailed: 0,
    resultJson: null,
    errorMessage: null,
    createdAt: job.createdAt,
    updatedAt: now(),
    completedAt: job.status === 'Completed' ? now() : null,
  }
}

export const assetStoreHandlers = [
  // ════════════════════════════════════════════════════════════════════════
  //  STORE ORIGIN (browser → store; MSW intercepts the absolute URLs)
  // ════════════════════════════════════════════════════════════════════════

  http.post(storeEndpoint('/api/auth/login'), async ({ request }) => {
    const body = (await request.json()) as { email?: string }
    const email = body.email ?? 'demo@modelibr.dev'
    return HttpResponse.json({
      accessToken: 'demo-access-token',
      refreshToken: 'demo-refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      username: email.split('@')[0] || 'demo',
      role: 'User',
    })
  }),

  http.post(storeEndpoint('/api/auth/refresh'), async () => {
    return HttpResponse.json({
      accessToken: 'demo-access-token',
      refreshToken: 'demo-refresh-token',
      refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      username: 'demo',
      role: 'User',
    })
  }),

  http.get(storeEndpoint('/api/library'), async ({ request }) => {
    if (!request.headers.get('Authorization')) {
      return new HttpResponse(null, { status: 401 })
    }
    const items = STORE_PACKS.map(toLibraryItem)
    return HttpResponse.json({
      items,
      page: 1,
      pageSize: items.length,
      totalCount: items.length,
      totalPages: 1,
    })
  }),

  http.get(storeEndpoint('/api/assets/:assetId'), async ({ params }) => {
    const def = STORE_PACKS.find(p => p.assetId === (params.assetId as string))
    if (!def) return new HttpResponse(null, { status: 404 })
    return HttpResponse.json(toAssetDetail(def))
  }),

  http.post(
    storeEndpoint('/api/library/:assetId/import-token'),
    async ({ request, params }) => {
      if (!request.headers.get('Authorization')) {
        return new HttpResponse(null, { status: 401 })
      }
      return HttpResponse.json({
        token: `demo-import-${params.assetId as string}`,
        scheme: 'ImportToken',
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      })
    }
  ),

  // ════════════════════════════════════════════════════════════════════════
  //  LOCAL BACKEND (/store-imports job — progresses on each poll)
  // ════════════════════════════════════════════════════════════════════════

  http.post('*/store-imports', async ({ request }) => {
    const body = (await request.json()) as {
      assetId?: string
      importToken?: string
      selectedItemIds?: string[]
    }
    const def = STORE_PACKS.find(p => p.assetId === body.assetId)
    if (!def || body.importToken !== `demo-import-${def.assetId}`) {
      return HttpResponse.json(
        { error: 'StoreImport.InvalidRequest', message: 'Unknown asset.' },
        { status: 400 }
      )
    }
    // Partial import: keep only the selected meshes (by item id); empty = whole pack.
    const selection = body.selectedItemIds?.length
      ? new Set(body.selectedItemIds)
      : null
    const meshes = selection
      ? def.meshes.filter(m => selection.has(packItemId(def.assetId, m.name)))
      : def.meshes
    const job: DemoImportJob = {
      id: nextJobId++,
      assetId: def.assetId,
      meshes,
      itemsTotal: meshes.length,
      itemsProcessed: 0,
      packId: null,
      status: 'Running',
      createdAt: now(),
    }
    jobs.set(job.id, job)
    return HttpResponse.json({ jobId: job.id }, { status: 202 })
  }),

  http.get('*/store-imports/:id', async ({ params }) => {
    const job = jobs.get(Number(params.id))
    if (!job) return new HttpResponse(null, { status: 404 })

    if (job.status === 'Running') {
      // Two items per poll ≈ a visible but brief progress phase.
      job.itemsProcessed = Math.min(job.itemsProcessed + 2, job.itemsTotal)
      if (job.itemsProcessed >= job.itemsTotal) {
        const def = STORE_PACKS.find(p => p.assetId === job.assetId)!
        job.packId = await materializeImport(def, job.meshes)
        job.status = 'Completed'
      }
    }
    return HttpResponse.json(toJobDto(job))
  }),

  // ════════════════════════════════════════════════════════════════════════
  //  SIGNALR (storeImportHub) — REJECT the negotiate so connect() fails
  //  immediately and polling drives progress. (An earlier stub negotiated a
  //  LongPolling transport whose poll GET hung, which stalled the SignalR
  //  handshake for its full timeout before the import controller's poll loop
  //  showed any progress.)
  // ════════════════════════════════════════════════════════════════════════

  http.post('*/storeImportHub/negotiate', async () => {
    return new HttpResponse(null, { status: 503 })
  }),

  http.options('*/storeImportHub/negotiate', async () => {
    return new HttpResponse(null, { status: 204 })
  }),
]
