import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getModelVersions } from '@/features/model-viewer/api/modelVersionApi'
import {
  getFileUrl,
  getVersionAuxiliaryFiles,
} from '@/features/models/api/modelApi'
import { getFileExtension } from '@/utils/fileUtils'

import type { SceneAssetRef, SceneDocument } from '../types'

/** Everything the viewport needs to load one asset, resolved outside the canvas. */
export interface SceneAssetSource {
  url: string
  /** Lower-case extension of the renderable file, e.g. `glb`, `fbx`. */
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
 */
export function useSceneAssetSources(
  document: SceneDocument | null
): Map<string, SceneAssetSource> {
  const assets = useMemo(() => {
    const distinct = new Map<string, SceneAssetRef>()
    for (const node of document?.nodes ?? []) {
      if (node.asset && node.asset.versionId != null) {
        distinct.set(keyOf(node.asset), node.asset)
      }
    }
    return [...distinct.values()]
  }, [document])

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

  const versionStamp = versionQueries.map(q => q.dataUpdatedAt).join()
  const auxiliaryStamp = auxiliaryQueries.map(q => q.dataUpdatedAt).join()

  return useMemo(() => {
    const sources = new Map<string, SceneAssetSource>()

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
        // By file id, not by the version-file route: the shared three.js
        // LoadingManager only lets `/files/<id>` through and rewrites anything
        // else to a transparent PNG, so a model requested by any other path
        // reaches the loader as image bytes and fails to parse.
        url: getFileUrl(String(renderable.id)),
        extension,
        resources,
        // useLoader caches by URL, and it caches failures too. Starting a loose
        // glTF before its resource map arrives would permanently cache a load
        // that failed on the missing .bin.
        isLoading: needsResources && (auxiliary?.isLoading ?? true),
      })
    })

    return sources
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, versionStamp, auxiliaryStamp])
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
