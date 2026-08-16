import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getEnvironmentMapByIdQueryOptions } from '@/features/environment-map/api/queries'
import { getModelVersions } from '@/features/model-viewer/api/modelVersionApi'
import {
  getFileUrl,
  getVersionAuxiliaryFiles,
} from '@/features/models/api/modelApi'
import { getSpriteByIdQueryOptions } from '@/features/sprite/api/queries'
import { getFileExtension } from '@/utils/fileUtils'

import type { SceneAssetRef, SceneDocument } from '../types'

/** Everything the viewport needs to load one asset, resolved outside the canvas. */
export interface SceneAssetSource {
  /**
   * How the viewport should draw it: `mesh` loads geometry with a format
   * loader, `image` is a flat picture (a sprite, or an environment map placed
   * as a backdrop card).
   */
  kind: 'mesh' | 'image'
  url: string
  /** Lower-case extension of the renderable file, e.g. `glb`, `fbx`, `png`. */
  extension: string
  /** Relative URI → file URL, for a loose glTF's external buffers and textures. */
  resources: Record<string, string>
  /** True while anything this source needs is still being fetched. */
  isLoading: boolean
}

function keyOf(asset: SceneAssetRef): string {
  return `${asset.assetType}:${asset.assetId}:${asset.versionId ?? '-'}`
}

/**
 * Resolves the file URL, format and glTF resource map for every asset a scene
 * references.
 *
 * **This must be called outside `<Canvas>`.** react-three-fiber renders the
 * canvas subtree through its own reconciler root, so React context from the
 * surrounding app - the QueryClient included - is not visible in there. Data
 * fetching from inside a mesh component therefore fails at the first hook, and
 * the failure surfaces as a node that silently never loads. Fetch out here,
 * pass plain props in; that is also how the model viewer is built.
 *
 * Reads the model's **version list** rather than its detail: a scene node is
 * pinned to one version, and the detail endpoint only describes the active one,
 * so a node pinned to an older version would otherwise load the wrong mesh.
 *
 * Sprites and environment maps are placeable too, and they are **not**
 * versioned - a scene document is right to carry no versionId for them. Dropping
 * every reference without one, and routing what was left through the model
 * version API, meant a sprite node never loaded anything and sat as a wireframe
 * box forever. They resolve to a single image file instead.
 */
export function useSceneAssetSources(
  document: SceneDocument | null
): Map<string, SceneAssetSource> {
  const { models, images } = useMemo(() => {
    const distinctModels = new Map<string, SceneAssetRef>()
    const distinctImages = new Map<string, SceneAssetRef>()

    for (const node of document?.nodes ?? []) {
      if (!node.asset) {
        continue
      }

      if (node.asset.assetType === 'Model') {
        // A Model without a pinned version cannot be resolved to one mesh, and
        // guessing "the latest" is the re-pointing that pinning exists to stop.
        if (node.asset.versionId != null) {
          distinctModels.set(keyOf(node.asset), node.asset)
        }
      } else {
        distinctImages.set(keyOf(node.asset), node.asset)
      }
    }

    // The scene's environment map is referenced outside the node list, so it has
    // to be collected explicitly or the viewport has no URL to light the scene
    // from. It resolves through the same image path a placed env-map node uses.
    const environmentMap = document?.environment?.environmentMap
    if (environmentMap) {
      distinctImages.set(keyOf(environmentMap), environmentMap)
    }

    return {
      models: [...distinctModels.values()],
      images: [...distinctImages.values()],
    }
  }, [document])

  const assets = models

  // Keyed exactly as the model viewer keys it, so a scene holding forty copies
  // of one asset issues one request, shared with any viewer tab already open.
  const versionQueries = useQueries({
    queries: assets.map(asset => ({
      queryKey: ['modelVersions', asset.assetId] as const,
      queryFn: () => getModelVersions(asset.assetId),
    })),
  })

  const auxiliaryQueries = useQueries({
    queries: assets.map((asset, index) => {
      const version = findVersion(versionQueries[index]?.data, asset.versionId)
      const renderable = pickRenderable(version)

      // Only a loose .gltf has external resources; a packed .glb carries its
      // buffers inside, and asking would be a wasted request per placement.
      const needsResources =
        getFileExtension(renderable?.originalFileName ?? '') === 'gltf'

      return {
        queryKey: [
          'model',
          String(asset.assetId),
          'version',
          String(asset.versionId),
          'auxiliary-files',
        ] as const,
        queryFn: () =>
          getVersionAuxiliaryFiles(asset.assetId, asset.versionId!),
        enabled: needsResources,
        staleTime: 5 * 60 * 1000,
      }
    }),
  })

  // Sprites and environment maps: one detail fetch each, keyed exactly as their
  // own feature keys them so a scene shares the cache with any open tab.
  const imageQueries = useQueries({
    queries: images.map(asset =>
      asset.assetType === 'Sprite'
        ? {
            ...getSpriteByIdQueryOptions(asset.assetId),
            staleTime: 5 * 60 * 1000,
          }
        : {
            ...getEnvironmentMapByIdQueryOptions(asset.assetId),
            staleTime: 5 * 60 * 1000,
          }
    ),
  })

  const versionStamp = versionQueries.map(q => q.dataUpdatedAt).join()
  const auxiliaryStamp = auxiliaryQueries.map(q => q.dataUpdatedAt).join()
  const imageStamp = imageQueries.map(q => q.dataUpdatedAt).join()

  return useMemo(() => {
    const sources = new Map<string, SceneAssetSource>()

    images.forEach((asset, index) => {
      const query = imageQueries[index]
      const fileId = imageFileId(asset.assetType, query?.data)
      if (fileId == null) {
        // Still loading, or an asset with no renderable file. Either way the
        // node draws its pending marker rather than a broken image.
        if (query?.isLoading) {
          sources.set(keyOf(asset), {
            kind: 'image',
            url: '',
            extension: '',
            resources: {},
            isLoading: true,
          })
        }
        return
      }

      sources.set(keyOf(asset), {
        kind: 'image',
        url: getFileUrl(String(fileId)),
        extension: getFileExtension(
          imageFileName(asset.assetType, query?.data)
        ),
        resources: {},
        isLoading: false,
      })
    })

    assets.forEach((asset, index) => {
      const version = findVersion(versionQueries[index]?.data, asset.versionId)
      const renderable = pickRenderable(version)
      if (!renderable) {
        return
      }

      const extension = getFileExtension(renderable.originalFileName)
      const needsResources = extension === 'gltf'
      const auxiliary = auxiliaryQueries[index]

      const resources: Record<string, string> = {}
      for (const entry of auxiliary?.data?.auxiliaries ?? []) {
        resources[entry.relativePath] = getFileUrl(String(entry.fileId))
      }

      sources.set(keyOf(asset), {
        kind: 'mesh',
        // By file id, not by the version-file route: the shared three.js
        // LoadingManager only lets `/files/<id>` through and rewrites anything
        // else to a transparent PNG, so a model requested by any other path
        // reaches the loader as image bytes and fails to parse.
        url: getFileUrl(String(renderable.id)),
        extension,
        resources,
        isLoading: isAwaitingResources(needsResources, auxiliary),
      })
    })

    return sources
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, images, versionStamp, auxiliaryStamp, imageStamp])
}

/**
 * Whether a loose glTF must keep waiting before the loader is allowed to start.
 *
 * `useLoader` caches by URL and caches failures too, so starting a loose glTF
 * before its resource map arrives permanently caches a load that failed on the
 * missing `.bin` - the node stays a red box for the life of the page.
 *
 * Gated on the map having **arrived**, not on the absence of a loading flag.
 * `enabled` is computed from the version query's data in the same render, so on
 * the tick that data first lands the auxiliary query has not started yet - and a
 * query that has not started reports `isLoading: false`. The old gate opened for
 * exactly that one tick, which is why several loose-glTF nodes in one scene
 * failed deterministically while a single-node scene passed.
 *
 * An errored query opens the gate deliberately: the map is never coming, and a
 * visible failure beats a pending marker that spins forever.
 */
export function isAwaitingResources(
  needsResources: boolean,
  auxiliary?: { isSuccess?: boolean; isError?: boolean }
): boolean {
  return needsResources && !auxiliary?.isSuccess && !auxiliary?.isError
}

/** The file id each non-versioned family renders from. */
function imageFileId(assetType: string, data: unknown): number | null {
  if (!data) {
    return null
  }

  if (assetType === 'Sprite') {
    return (data as { fileId?: number }).fileId ?? null
  }

  // An environment map keeps its bytes on a variant; the preview variant is the
  // one the rest of the app shows, so a scene shows the same picture.
  const map = data as {
    previewFileId?: number | null
    variants?: Array<{ previewFileId?: number | null; fileId?: number | null }>
  }
  const variant = map.variants?.[0]
  return map.previewFileId ?? variant?.previewFileId ?? variant?.fileId ?? null
}

function imageFileName(assetType: string, data: unknown): string {
  if (!data) {
    return ''
  }

  return assetType === 'Sprite'
    ? ((data as { fileName?: string }).fileName ?? '')
    : ((data as { variants?: Array<{ fileName?: string }> }).variants?.[0]
        ?.fileName ?? '')
}

interface VersionFile {
  id: number
  originalFileName: string
  isRenderable?: boolean
}

function findVersion(
  versions: Array<{ id: number; files?: VersionFile[] }> | undefined,
  versionId: number | null | undefined
) {
  return versions?.find(version => version.id === versionId)
}

function pickRenderable(
  version: { files?: VersionFile[] } | undefined
): VersionFile | undefined {
  return version?.files?.find(file => file.isRenderable) ?? version?.files?.[0]
}

export { keyOf as sceneAssetSourceKey }
