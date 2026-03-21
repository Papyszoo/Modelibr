/**
 * Demo Mode IndexedDB Database
 *
 * Provides a persistent local database for the demo mode using the `idb` library.
 * All CRUD operations for models, versions, texture sets, sounds, sprites,
 * packs, projects, categories, and file blobs live here.
 *
 * The DB is auto-seeded with default data on first open.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb'

// ─── Schema ─────────────────────────────────────────────────────────────

export interface DemoFile {
  id: number
  originalFileName: string
  storedFileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  sha256Hash: string
  fileType: string
  isRenderable: boolean
  createdAt: string
  updatedAt: string
}

export interface DemoModel {
  id: number
  name: string
  description: string
  tags: string
  files: DemoFile[]
  createdAt: string
  updatedAt: string
  activeVersionId: number | null
  defaultTextureSetId: number | null
  textureSets: { id: number; name: string }[]
  packs: { id: number; name: string }[]
}

export interface DemoModelVersion {
  id: number
  modelId: number
  versionNumber: number
  description: string
  createdAt: string
  defaultTextureSetId: number | null
  thumbnailUrl: string | null
  pngThumbnailUrl: string | null
  files: {
    id: number
    originalFileName: string
    mimeType: string
    fileType: string
    sizeBytes: number
    isRenderable: boolean
  }[]
  materialNames: string[]
  mainVariantName: string
  variantNames: string[]
  textureMappings: {
    materialName: string
    textureSetId: number
    variantName: string
  }[]
  textureSetIds: number[]
}

export interface DemoTexture {
  id: number
  textureType: number
  sourceChannel: number
  fileId: number
  fileName: string
  createdAt: string
  proxies: { fileId: number; size: number }[]
}

export interface DemoTextureSet {
  id: number
  name: string
  kind: number
  tilingScaleX: number
  tilingScaleY: number
  uvMappingMode: number
  uvScale: number
  previewGeometryType?: string
  createdAt: string
  updatedAt: string
  textureCount: number
  isEmpty: boolean
  thumbnailPath: string | null
  pngThumbnailPath: string | null
  textures: DemoTexture[]
  associatedModels: {
    id: number
    name: string
    versionNumber?: number
    modelVersionId: number
    materialName: string
  }[]
  packs: { id: number; name: string }[]
}

export interface DemoSprite {
  id: number
  name: string
  fileId: number
  spriteType: number
  categoryId: number | null
  categoryName: string | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
}

export interface DemoSound {
  id: number
  name: string
  fileId: number
  categoryId: number | null
  categoryName: string | null
  duration: number
  peaks: string | null
  fileName: string
  fileSizeBytes: number
  createdAt: string
  updatedAt: string
  waveformUrl: string | null
}

export interface DemoPack {
  id: number
  name: string
  description: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  spriteCount: number
  soundCount: number
  isEmpty: boolean
  models: { id: number; name: string }[]
  textureSets: { id: number; name: string }[]
  sprites: { id: number; name: string }[]
  sounds: { id: number; name: string }[]
}

export interface DemoProject {
  id: number
  name: string
  description: string
  createdAt: string
  updatedAt: string
  modelCount: number
  textureSetCount: number
  spriteCount: number
  soundCount: number
  isEmpty: boolean
  models: { id: number; name: string }[]
  textureSets: { id: number; name: string }[]
  sprites: { id: number; name: string }[]
  sounds: { id: number; name: string }[]
}

export interface DemoCategory {
  id: number
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface DemoFileBlob {
  fileId: number
  blob: Blob
  fileName: string
  mimeType: string
}

export interface DemoThumbnail {
  entityKey: string // e.g. "model:1", "version:3", "textureSet:2"
  blob: Blob
}

interface DemoDbSchema extends DBSchema {
  models: { key: number; value: DemoModel }
  modelVersions: {
    key: number
    value: DemoModelVersion
    indexes: { byModelId: number }
  }
  textureSets: { key: number; value: DemoTextureSet }
  sprites: { key: number; value: DemoSprite }
  sounds: { key: number; value: DemoSound }
  packs: { key: number; value: DemoPack }
  projects: { key: number; value: DemoProject }
  spriteCategories: { key: number; value: DemoCategory }
  soundCategories: { key: number; value: DemoCategory }
  fileBlobs: { key: number; value: DemoFileBlob }
  thumbnails: { key: string; value: DemoThumbnail }
  meta: { key: string; value: { key: string; value: number } }
}

// ─── Database Instance ──────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<DemoDbSchema>> | null = null

export function getDb(): Promise<IDBPDatabase<DemoDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<DemoDbSchema>('modelibr-demo', 1, {
      upgrade(db) {
        db.createObjectStore('models', { keyPath: 'id' })
        const versionStore = db.createObjectStore('modelVersions', {
          keyPath: 'id',
        })
        versionStore.createIndex('byModelId', 'modelId')
        db.createObjectStore('textureSets', { keyPath: 'id' })
        db.createObjectStore('sprites', { keyPath: 'id' })
        db.createObjectStore('sounds', { keyPath: 'id' })
        db.createObjectStore('packs', { keyPath: 'id' })
        db.createObjectStore('projects', { keyPath: 'id' })
        db.createObjectStore('spriteCategories', { keyPath: 'id' })
        db.createObjectStore('soundCategories', { keyPath: 'id' })
        db.createObjectStore('fileBlobs', { keyPath: 'fileId' })
        db.createObjectStore('thumbnails', { keyPath: 'entityKey' })
        db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

// ─── ID Generator ───────────────────────────────────────────────────────

export async function nextId(entity: string): Promise<number> {
  const db = await getDb()
  const tx = db.transaction('meta', 'readwrite')
  const store = tx.objectStore('meta')
  const key = `seq_${entity}`
  const record = await store.get(key)
  const next = (record?.value ?? 1000) + 1
  await store.put({ key, value: next })
  await tx.done
  return next
}

// ─── Generic CRUD ───────────────────────────────────────────────────────

type StoreNames =
  | 'models'
  | 'modelVersions'
  | 'textureSets'
  | 'sprites'
  | 'sounds'
  | 'packs'
  | 'projects'
  | 'spriteCategories'
  | 'soundCategories'

export async function getAll<T extends StoreNames>(
  storeName: T
): Promise<DemoDbSchema[T]['value'][]> {
  const db = await getDb()
  return db.getAll(storeName)
}

export async function getById<T extends StoreNames>(
  storeName: T,
  id: number
): Promise<DemoDbSchema[T]['value'] | undefined> {
  const db = await getDb()
  return db.get(storeName, id)
}

export async function put<T extends StoreNames>(
  storeName: T,
  value: DemoDbSchema[T]['value']
): Promise<void> {
  const db = await getDb()
  await db.put(storeName, value)
}

export async function remove<T extends StoreNames>(
  storeName: T,
  id: number
): Promise<void> {
  const db = await getDb()
  await db.delete(storeName, id)
}

// ─── Model Version helpers ──────────────────────────────────────────────

export async function getVersionsByModelId(
  modelId: number
): Promise<DemoModelVersion[]> {
  const db = await getDb()
  return db.getAllFromIndex('modelVersions', 'byModelId', modelId)
}

// ─── File Blob helpers ──────────────────────────────────────────────────

export async function storeFileBlob(
  fileId: number,
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<void> {
  const db = await getDb()
  await db.put('fileBlobs', { fileId, blob, fileName, mimeType })
}

export async function getFileBlob(
  fileId: number
): Promise<DemoFileBlob | undefined> {
  const db = await getDb()
  return db.get('fileBlobs', fileId)
}

// ─── Thumbnail helpers ──────────────────────────────────────────────────

export async function storeThumbnail(
  entityKey: string,
  blob: Blob
): Promise<void> {
  const db = await getDb()
  await db.put('thumbnails', { entityKey, blob })
}

export async function getThumbnail(
  entityKey: string
): Promise<Blob | undefined> {
  const db = await getDb()
  const record = await db.get('thumbnails', entityKey)
  return record?.blob
}

// ─── Seed Data ──────────────────────────────────────────────────────────

export async function seedIfEmpty(): Promise<void> {
  const db = await getDb()
  const modelCount = await db.count('models')
  if (modelCount > 0) return // already seeded

  const now = new Date().toISOString()

  const seedModels: DemoModel[] = [
    {
      id: 1,
      name: 'Test Cube',
      description: 'A simple cube model for testing',
      tags: 'test,cube,basic',
      files: [
        {
          id: 101,
          originalFileName: 'test-cube.glb',
          storedFileName: 'test-cube.glb',
          filePath: 'test-cube.glb',
          mimeType: 'model/gltf-binary',
          sizeBytes: 1024,
          sha256Hash: 'abc123',
          fileType: 'glb',
          isRenderable: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      activeVersionId: 1,
      defaultTextureSetId: null,
      textureSets: [],
      packs: [{ id: 1, name: 'Demo Pack' }],
    },
    {
      id: 2,
      name: 'Test Cone',
      description: 'A cone model exported as FBX',
      tags: 'test,cone,fbx',
      files: [
        {
          id: 102,
          originalFileName: 'test-cone.fbx',
          storedFileName: 'test-cone.fbx',
          filePath: 'test-cone.fbx',
          mimeType: 'application/octet-stream',
          sizeBytes: 2048,
          sha256Hash: 'def456',
          fileType: 'fbx',
          isRenderable: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      activeVersionId: 2,
      defaultTextureSetId: null,
      textureSets: [],
      packs: [],
    },
    {
      id: 3,
      name: 'Test Cylinder',
      description: 'A cylinder shape',
      tags: 'test,cylinder',
      files: [
        {
          id: 103,
          originalFileName: 'test-cylinder.fbx',
          storedFileName: 'test-cylinder.fbx',
          filePath: 'test-cylinder.fbx',
          mimeType: 'application/octet-stream',
          sizeBytes: 1536,
          sha256Hash: 'ghi789',
          fileType: 'fbx',
          isRenderable: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      activeVersionId: 3,
      defaultTextureSetId: null,
      textureSets: [{ id: 1, name: 'Basic Texture Set' }],
      packs: [{ id: 1, name: 'Demo Pack' }],
    },
    {
      id: 4,
      name: 'Test Icosphere',
      description: 'An icosphere model',
      tags: 'test,icosphere',
      files: [
        {
          id: 104,
          originalFileName: 'test-icosphere.fbx',
          storedFileName: 'test-icosphere.fbx',
          filePath: 'test-icosphere.fbx',
          mimeType: 'application/octet-stream',
          sizeBytes: 3072,
          sha256Hash: 'jkl012',
          fileType: 'fbx',
          isRenderable: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      activeVersionId: 4,
      defaultTextureSetId: null,
      textureSets: [],
      packs: [],
    },
    {
      id: 5,
      name: 'Test Torus',
      description: 'A torus model',
      tags: 'test,torus',
      files: [
        {
          id: 105,
          originalFileName: 'test-torus.fbx',
          storedFileName: 'test-torus.fbx',
          filePath: 'test-torus.fbx',
          mimeType: 'application/octet-stream',
          sizeBytes: 4096,
          sha256Hash: 'mno345',
          fileType: 'fbx',
          isRenderable: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      activeVersionId: 5,
      defaultTextureSetId: 2,
      textureSets: [{ id: 2, name: 'Color Textures' }],
      packs: [{ id: 2, name: 'Shapes Pack' }],
    },
  ]

  const DEMO_BASE = import.meta.env.BASE_URL ?? '/Modelibr/demo/'
  const thumb = (f: string) => `${DEMO_BASE}demo-assets/thumbnails/${f}`

  const seedVersions: DemoModelVersion[] = [
    {
      id: 1,
      modelId: 1,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: now,
      defaultTextureSetId: null,
      thumbnailUrl: thumb('test-cube.png'),
      pngThumbnailUrl: thumb('test-cube.png'),
      files: [
        {
          id: 101,
          originalFileName: 'test-cube.glb',
          mimeType: 'model/gltf-binary',
          fileType: 'glb',
          sizeBytes: 1024,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [],
    },
    {
      id: 2,
      modelId: 2,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: now,
      defaultTextureSetId: null,
      thumbnailUrl: thumb('test-cone.png'),
      pngThumbnailUrl: thumb('test-cone.png'),
      files: [
        {
          id: 102,
          originalFileName: 'test-cone.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 2048,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [],
    },
    {
      id: 3,
      modelId: 3,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: now,
      defaultTextureSetId: null,
      thumbnailUrl: thumb('test-cylinder.png'),
      pngThumbnailUrl: thumb('test-cylinder.png'),
      files: [
        {
          id: 103,
          originalFileName: 'test-cylinder.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 1536,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [1],
    },
    {
      id: 4,
      modelId: 4,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: now,
      defaultTextureSetId: null,
      thumbnailUrl: thumb('test-icosphere.png'),
      pngThumbnailUrl: thumb('test-icosphere.png'),
      files: [
        {
          id: 104,
          originalFileName: 'test-icosphere.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 3072,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [],
      textureSetIds: [],
    },
    {
      id: 5,
      modelId: 5,
      versionNumber: 1,
      description: 'Initial version',
      createdAt: now,
      defaultTextureSetId: 2,
      thumbnailUrl: thumb('test-torus.png'),
      pngThumbnailUrl: thumb('test-torus.png'),
      files: [
        {
          id: 105,
          originalFileName: 'test-torus.fbx',
          mimeType: 'application/octet-stream',
          fileType: 'fbx',
          sizeBytes: 4096,
          isRenderable: true,
        },
      ],
      materialNames: ['Material'],
      mainVariantName: 'Default',
      variantNames: ['Default'],
      textureMappings: [
        { materialName: 'Material', textureSetId: 2, variantName: 'Default' },
      ],
      textureSetIds: [2],
    },
  ]

  const seedTextureSets: DemoTextureSet[] = [
    {
      id: 1,
      name: 'Basic Texture Set',
      kind: 0,
      tilingScaleX: 1,
      tilingScaleY: 1,
      uvMappingMode: 0,
      uvScale: 1,
      createdAt: now,
      updatedAt: now,
      textureCount: 2,
      isEmpty: false,
      thumbnailPath: null,
      pngThumbnailPath: null,
      textures: [
        {
          id: 1,
          textureType: 1,
          sourceChannel: 5,
          fileId: 202,
          fileName: 'texture_albedo.png',
          createdAt: now,
          proxies: [],
        },
        {
          id: 2,
          textureType: 2,
          sourceChannel: 5,
          fileId: 201,
          fileName: 'texture.png',
          createdAt: now,
          proxies: [],
        },
      ],
      associatedModels: [
        {
          id: 3,
          name: 'Test Cylinder',
          versionNumber: 1,
          modelVersionId: 3,
          materialName: 'Material',
        },
      ],
      packs: [],
    },
    {
      id: 2,
      name: 'Color Textures',
      kind: 0,
      tilingScaleX: 1,
      tilingScaleY: 1,
      uvMappingMode: 0,
      uvScale: 1,
      createdAt: now,
      updatedAt: now,
      textureCount: 3,
      isEmpty: false,
      thumbnailPath: null,
      pngThumbnailPath: null,
      textures: [
        {
          id: 3,
          textureType: 1,
          sourceChannel: 5,
          fileId: 205,
          fileName: 'red_color.png',
          createdAt: now,
          proxies: [],
        },
        {
          id: 4,
          textureType: 5,
          sourceChannel: 5,
          fileId: 204,
          fileName: 'texture_orm.png',
          createdAt: now,
          proxies: [],
        },
        {
          id: 5,
          textureType: 6,
          sourceChannel: 5,
          fileId: 203,
          fileName: 'texture_blue.png',
          createdAt: now,
          proxies: [],
        },
      ],
      associatedModels: [
        {
          id: 5,
          name: 'Test Torus',
          versionNumber: 1,
          modelVersionId: 5,
          materialName: 'Material',
        },
      ],
      packs: [{ id: 2, name: 'Shapes Pack' }],
    },
    {
      id: 3,
      name: 'Global Stone Material',
      kind: 1,
      tilingScaleX: 2,
      tilingScaleY: 2,
      uvMappingMode: 0,
      uvScale: 1,
      previewGeometryType: 'sphere',
      createdAt: now,
      updatedAt: now,
      textureCount: 4,
      isEmpty: false,
      thumbnailPath: '/texture-sets/3/thumbnail/file',
      pngThumbnailPath: '/texture-sets/3/thumbnail/file',
      textures: [
        {
          id: 6,
          textureType: 1,
          sourceChannel: 5,
          fileId: 301,
          fileName: 'diffuse.jpg',
          createdAt: now,
          proxies: [],
        },
        {
          id: 7,
          textureType: 2,
          sourceChannel: 5,
          fileId: 302,
          fileName: 'normal.exr',
          createdAt: now,
          proxies: [],
        },
        {
          id: 8,
          textureType: 5,
          sourceChannel: 5,
          fileId: 303,
          fileName: 'roughness.exr',
          createdAt: now,
          proxies: [],
        },
        {
          id: 9,
          textureType: 12,
          sourceChannel: 5,
          fileId: 304,
          fileName: 'displacement.png',
          createdAt: now,
          proxies: [],
        },
      ],
      associatedModels: [],
      packs: [],
    },
  ]

  const seedSprites: DemoSprite[] = [
    {
      id: 1,
      name: 'Demo Sprite',
      fileId: 401,
      spriteType: 0,
      categoryId: null,
      categoryName: null,
      fileName: 'texture.png',
      fileSizeBytes: 5120,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      name: 'Albedo Sprite',
      fileId: 402,
      spriteType: 0,
      categoryId: 1,
      categoryName: 'UI Elements',
      fileName: 'texture_albedo.png',
      fileSizeBytes: 3072,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const seedSounds: DemoSound[] = [
    {
      id: 1,
      name: 'Test Tone',
      fileId: 501,
      categoryId: null,
      categoryName: null,
      duration: 2000,
      peaks: null,
      fileName: 'test-tone.wav',
      fileSizeBytes: 88200,
      createdAt: now,
      updatedAt: now,
      waveformUrl: null,
    },
  ]

  const seedPacks: DemoPack[] = [
    {
      id: 1,
      name: 'Demo Pack',
      description: 'A sample pack with various assets',
      createdAt: now,
      updatedAt: now,
      modelCount: 2,
      textureSetCount: 0,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: false,
      models: [
        { id: 1, name: 'Test Cube' },
        { id: 3, name: 'Test Cylinder' },
      ],
      textureSets: [],
      sprites: [],
      sounds: [],
    },
    {
      id: 2,
      name: 'Shapes Pack',
      description: 'Collection of basic 3D shapes',
      createdAt: now,
      updatedAt: now,
      modelCount: 1,
      textureSetCount: 1,
      spriteCount: 0,
      soundCount: 0,
      isEmpty: false,
      models: [{ id: 5, name: 'Test Torus' }],
      textureSets: [{ id: 2, name: 'Color Textures' }],
      sprites: [],
      sounds: [],
    },
  ]

  const seedProjects: DemoProject[] = [
    {
      id: 1,
      name: 'Demo Project',
      description: 'A demo project showcasing Modelibr',
      createdAt: now,
      updatedAt: now,
      modelCount: 3,
      textureSetCount: 1,
      spriteCount: 1,
      soundCount: 1,
      isEmpty: false,
      models: [
        { id: 1, name: 'Test Cube' },
        { id: 2, name: 'Test Cone' },
        { id: 4, name: 'Test Icosphere' },
      ],
      textureSets: [{ id: 1, name: 'Basic Texture Set' }],
      sprites: [{ id: 1, name: 'Demo Sprite' }],
      sounds: [{ id: 1, name: 'Test Tone' }],
    },
  ]

  const seedSpriteCategories: DemoCategory[] = [
    {
      id: 1,
      name: 'UI Elements',
      description: 'User interface sprites',
      createdAt: now,
      updatedAt: now,
    },
  ]

  const seedSoundCategories: DemoCategory[] = [
    {
      id: 1,
      name: 'Sound Effects',
      description: 'Game sound effects',
      createdAt: now,
      updatedAt: now,
    },
  ]

  // Write all seed data in a batch
  const tx = db.transaction(
    [
      'models',
      'modelVersions',
      'textureSets',
      'sprites',
      'sounds',
      'packs',
      'projects',
      'spriteCategories',
      'soundCategories',
      'meta',
    ],
    'readwrite'
  )
  for (const m of seedModels) await tx.objectStore('models').put(m)
  for (const v of seedVersions) await tx.objectStore('modelVersions').put(v)
  for (const ts of seedTextureSets) await tx.objectStore('textureSets').put(ts)
  for (const sp of seedSprites) await tx.objectStore('sprites').put(sp)
  for (const sn of seedSounds) await tx.objectStore('sounds').put(sn)
  for (const pk of seedPacks) await tx.objectStore('packs').put(pk)
  for (const pj of seedProjects) await tx.objectStore('projects').put(pj)
  for (const sc of seedSpriteCategories)
    await tx.objectStore('spriteCategories').put(sc)
  for (const sc of seedSoundCategories)
    await tx.objectStore('soundCategories').put(sc)

  // Initialize ID sequences past seed data
  const metaStore = tx.objectStore('meta')
  await metaStore.put({ key: 'seq_models', value: 100 })
  await metaStore.put({ key: 'seq_modelVersions', value: 100 })
  await metaStore.put({ key: 'seq_textureSets', value: 100 })
  await metaStore.put({ key: 'seq_textures', value: 100 })
  await metaStore.put({ key: 'seq_sprites', value: 100 })
  await metaStore.put({ key: 'seq_sounds', value: 100 })
  await metaStore.put({ key: 'seq_packs', value: 100 })
  await metaStore.put({ key: 'seq_projects', value: 100 })
  await metaStore.put({ key: 'seq_files', value: 1000 })
  await metaStore.put({ key: 'seq_spriteCategories', value: 100 })
  await metaStore.put({ key: 'seq_soundCategories', value: 100 })

  await tx.done
}
