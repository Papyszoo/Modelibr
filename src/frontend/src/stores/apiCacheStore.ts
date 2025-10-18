import { create } from 'zustand'
import { Model } from '../utils/fileUtils'
import { TextureSetDto, PackDto, ProjectDto } from '../types'

// Cache entry with timestamp for freshness tracking
interface CacheEntry<T> {
  data: T
  timestamp: number
}

// Thumbnail status type (matching ApiClient interface)
interface ThumbnailStatus {
  status: 'Pending' | 'Processing' | 'Ready' | 'Failed'
  fileUrl?: string
  sizeBytes?: number
  width?: number
  height?: number
  errorMessage?: string
  createdAt?: string
  processedAt?: string
}

// Cache store state
interface ApiCacheStore {
  // Cached data
  models: CacheEntry<Model[]> | null
  modelsById: Map<string, CacheEntry<Model>>
  textureSets: CacheEntry<TextureSetDto[]> | null
  textureSetsById: Map<number, CacheEntry<TextureSetDto>>
  packs: CacheEntry<PackDto[]> | null
  packsById: Map<number, CacheEntry<PackDto>>
  projects: CacheEntry<ProjectDto[]> | null
  projectsById: Map<number, CacheEntry<ProjectDto>>
  thumbnailStatusById: Map<string, CacheEntry<ThumbnailStatus>>
  thumbnailBlobById: Map<string, CacheEntry<Blob>>

  // Cache configuration
  defaultTTL: number // Time to live in milliseconds (default: 5 minutes)

  // Cache setters
  setModels: (models: Model[]) => void
  setModelById: (id: string, model: Model) => void
  setTextureSets: (sets: TextureSetDto[]) => void
  setTextureSetById: (id: number, set: TextureSetDto) => void
  setPacks: (packs: PackDto[]) => void
  setPackById: (id: number, pack: PackDto) => void
  setProjects: (projects: ProjectDto[]) => void
  setProjectById: (id: number, project: ProjectDto) => void
  setThumbnailStatus: (modelId: string, status: ThumbnailStatus) => void
  setThumbnailBlob: (modelId: string, blob: Blob) => void

  // Cache getters with freshness check
  getModels: () => Model[] | null
  getModelById: (id: string) => Model | null
  getTextureSets: () => TextureSetDto[] | null
  getTextureSetById: (id: number) => TextureSetDto | null
  getPacks: () => PackDto[] | null
  getPackById: (id: number) => PackDto | null
  getProjects: () => ProjectDto[] | null
  getProjectById: (id: number) => ProjectDto | null
  getThumbnailStatus: (modelId: string) => ThumbnailStatus | null
  getThumbnailBlob: (modelId: string) => Blob | null

  // Cache invalidation
  invalidateModels: () => void
  invalidateModelById: (id: string) => void
  invalidateTextureSets: () => void
  invalidateTextureSetById: (id: number) => void
  invalidatePacks: () => void
  invalidatePackById: (id: number) => void
  invalidateProjects: () => void
  invalidateProjectById: (id: number) => void
  invalidateThumbnails: () => void
  invalidateThumbnailById: (modelId: string) => void
  invalidateAll: () => void

  // Cache refresh helpers
  refreshModels: () => void
  refreshTextureSets: () => void
  refreshPacks: () => void
  refreshProjects: () => void
}

export const useApiCacheStore = create<ApiCacheStore>((set, get) => ({
  // Initial state
  models: null,
  modelsById: new Map(),
  textureSets: null,
  textureSetsById: new Map(),
  packs: null,
  packsById: new Map(),
  projects: null,
  projectsById: new Map(),
  thumbnailStatusById: new Map(),
  thumbnailBlobById: new Map(),
  defaultTTL: 5 * 60 * 1000, // 5 minutes

  // Setters
  setModels: (models: Model[]) => {
    set({ models: { data: models, timestamp: Date.now() } })
    // Also update individual model cache
    const modelsById = new Map(get().modelsById)
    models.forEach(model => {
      modelsById.set(model.id.toString(), {
        data: model,
        timestamp: Date.now(),
      })
    })
    set({ modelsById })
  },

  setModelById: (id: string, model: Model) => {
    const modelsById = new Map(get().modelsById)
    modelsById.set(id, { data: model, timestamp: Date.now() })
    set({ modelsById })
  },

  setTextureSets: (textureSets: TextureSetDto[]) => {
    set({ textureSets: { data: textureSets, timestamp: Date.now() } })
    // Also update individual texture set cache
    const textureSetsById = new Map(get().textureSetsById)
    textureSets.forEach(set => {
      textureSetsById.set(set.id, { data: set, timestamp: Date.now() })
    })
    set({ textureSetsById })
  },

  setTextureSetById: (id: number, textureSet: TextureSetDto) => {
    const textureSetsById = new Map(get().textureSetsById)
    textureSetsById.set(id, { data: textureSet, timestamp: Date.now() })
    set({ textureSetsById })
  },

  setPacks: (packs: PackDto[]) => {
    set({ packs: { data: packs, timestamp: Date.now() } })
    // Also update individual pack cache
    const packsById = new Map(get().packsById)
    packs.forEach(pack => {
      packsById.set(pack.id, { data: pack, timestamp: Date.now() })
    })
    set({ packsById })
  },

  setPackById: (id: number, pack: PackDto) => {
    const packsById = new Map(get().packsById)
    packsById.set(id, { data: pack, timestamp: Date.now() })
    set({ packsById })
  },

  setProjects: (projects: ProjectDto[]) => {
    set({ projects: { data: projects, timestamp: Date.now() } })
    // Also update individual project cache
    const projectsById = new Map(get().projectsById)
    projects.forEach(project => {
      projectsById.set(project.id, { data: project, timestamp: Date.now() })
    })
    set({ projectsById })
  },

  setProjectById: (id: number, project: ProjectDto) => {
    const projectsById = new Map(get().projectsById)
    projectsById.set(id, { data: project, timestamp: Date.now() })
    set({ projectsById })
  },

  setThumbnailStatus: (modelId: string, status: ThumbnailStatus) => {
    const thumbnailStatusById = new Map(get().thumbnailStatusById)
    thumbnailStatusById.set(modelId, { data: status, timestamp: Date.now() })
    set({ thumbnailStatusById })
  },

  setThumbnailBlob: (modelId: string, blob: Blob) => {
    const thumbnailBlobById = new Map(get().thumbnailBlobById)
    thumbnailBlobById.set(modelId, { data: blob, timestamp: Date.now() })
    set({ thumbnailBlobById })
  },

  // Getters with freshness check
  getModels: () => {
    const entry = get().models
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getModelById: (id: string) => {
    const entry = get().modelsById.get(id)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getTextureSets: () => {
    const entry = get().textureSets
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getTextureSetById: (id: number) => {
    const entry = get().textureSetsById.get(id)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getPacks: () => {
    const entry = get().packs
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getPackById: (id: number) => {
    const entry = get().packsById.get(id)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getProjects: () => {
    const entry = get().projects
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getProjectById: (id: number) => {
    const entry = get().projectsById.get(id)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getThumbnailStatus: (modelId: string) => {
    const entry = get().thumbnailStatusById.get(modelId)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  getThumbnailBlob: (modelId: string) => {
    const entry = get().thumbnailBlobById.get(modelId)
    if (!entry) return null
    const age = Date.now() - entry.timestamp
    if (age > get().defaultTTL) return null
    return entry.data
  },

  // Invalidation
  invalidateModels: () => set({ models: null }),

  invalidateModelById: (id: string) => {
    const modelsById = new Map(get().modelsById)
    modelsById.delete(id)
    set({ modelsById })
  },

  invalidateTextureSets: () => set({ textureSets: null }),

  invalidateTextureSetById: (id: number) => {
    const textureSetsById = new Map(get().textureSetsById)
    textureSetsById.delete(id)
    set({ textureSetsById })
  },

  invalidatePacks: () => set({ packs: null }),

  invalidatePackById: (id: number) => {
    const packsById = new Map(get().packsById)
    packsById.delete(id)
    set({ packsById })
  },

  invalidateProjects: () => set({ projects: null }),

  invalidateProjectById: (id: number) => {
    const projectsById = new Map(get().projectsById)
    projectsById.delete(id)
    set({ projectsById })
  },

  invalidateThumbnails: () =>
    set({
      thumbnailStatusById: new Map(),
      thumbnailBlobById: new Map(),
    }),

  invalidateThumbnailById: (modelId: string) => {
    const thumbnailStatusById = new Map(get().thumbnailStatusById)
    const thumbnailBlobById = new Map(get().thumbnailBlobById)
    thumbnailStatusById.delete(modelId)
    thumbnailBlobById.delete(modelId)
    set({ thumbnailStatusById, thumbnailBlobById })
  },

  invalidateAll: () =>
    set({
      models: null,
      modelsById: new Map(),
      textureSets: null,
      textureSetsById: new Map(),
      packs: null,
      packsById: new Map(),
      projects: null,
      projectsById: new Map(),
      thumbnailStatusById: new Map(),
      thumbnailBlobById: new Map(),
    }),

  // Refresh helpers (mark as stale by invalidating, forcing refetch)
  refreshModels: () => get().invalidateModels(),
  refreshTextureSets: () => get().invalidateTextureSets(),
  refreshPacks: () => get().invalidatePacks(),
  refreshProjects: () => get().invalidateProjects(),
}))
