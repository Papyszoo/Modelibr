import { http, HttpResponse } from 'msw'

import {
  type DemoEnvironmentMap,
  type DemoModel,
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

export const systemHandlers = [
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
      thumbnailCameraVerticalAngle: 0.75,
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
    return HttpResponse.json({
      models,
      modelVersions: [],
      files: [],
      textureSets,
      textures: [],
      sprites,
      sounds,
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
              recomputePackCounts(pack)
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
              recomputeProjectCounts(project)
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
