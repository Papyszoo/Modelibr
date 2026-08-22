import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getFileUrl } from '@/features/models/api/modelApi'
import { getFileExtension } from '@/utils/fileUtils'

import { getSceneResourceQueryOptions } from '../api/resourceQueries'
import { sceneResourceKey } from '../lib/sceneResourceKey'
import type { SceneAssetRef, SceneDocument } from '../types'

/** Everything the viewport needs to load one asset, resolved outside the canvas. */
export interface SceneAssetSource {
  kind: 'mesh' | 'image'
  url: string
  /** Lower-case extension of the renderable file, e.g. `glb`, `fbx`, `png`. */
  extension: string
  /** Relative URI → file URL, for a loose glTF's external buffers and textures. */
  resources: Record<string, string>
  /** True while the manifest entry is still being resolved. */
  isLoading: boolean
  /** A terminal metadata/resource failure; the node boundary keeps bounds visible. */
  error?: string
  /** Original plus loose-glTF auxiliaries; null means the cost is unknown. */
  totalSizeBytes: number | null
  triangleCount: number | null
  materialCount: number | null
  hasPreview: boolean
}

interface ResourceQueryState {
  isSuccess?: boolean
  isError?: boolean
  error?: unknown
}

/** A pending query returns null so its bounds remain pending rather than failed. */
export function sceneSourceResolutionError(
  query: ResourceQueryState | undefined,
  missingMessage: string
): string | null {
  if (query?.isError) {
    return query.error instanceof Error && query.error.message
      ? query.error.message
      : missingMessage
  }
  return query?.isSuccess ? missingMessage : null
}

/**
 * Resolves one independently cached manifest entry per distinct scene reference.
 *
 * The query functions are coalesced into one POST when a scene opens. Because cache keys
 * remain per reference, changing one unsaved candidate later resolves only that candidate.
 * This hook stays outside Canvas because the R3F reconciler cannot see the app QueryClient.
 */
export function useSceneAssetSources(
  document: SceneDocument | null
): Map<string, SceneAssetSource> {
  const assets = useMemo(() => {
    const distinct = new Map<string, SceneAssetRef>()
    for (const node of document?.nodes ?? []) {
      if (node.asset) {
        distinct.set(sceneResourceKey(node.asset), node.asset)
      }
    }

    const environmentMap = document?.environment?.environmentMap
    if (environmentMap) {
      distinct.set(sceneResourceKey(environmentMap), environmentMap)
    }
    return [...distinct.values()]
  }, [document])

  const resourceQueries = useQueries({
    queries: assets.map(getSceneResourceQueryOptions),
  })
  const resourceStamp = resourceQueries
    .map(
      query =>
        `${query.status}:${query.dataUpdatedAt}:${query.errorUpdatedAt}:${query.fetchStatus}`
    )
    .join('|')

  return useMemo(() => {
    const sources = new Map<string, SceneAssetSource>()

    assets.forEach((asset, index) => {
      const query = resourceQueries[index]
      const resource = query?.data
      const kind = asset.assetType === 'Model' ? 'mesh' : 'image'

      if (!resource?.resolved || !resource.original) {
        const error =
          resource?.errorMessage ??
          sceneSourceResolutionError(
            query,
            `${asset.assetType} ${asset.assetId} has no renderable file.`
          )
        sources.set(sceneResourceKey(asset), {
          kind,
          url: '',
          extension: '',
          resources: {},
          isLoading: error === null,
          ...(error ? { error } : {}),
          totalSizeBytes: resource?.totalSizeBytes ?? null,
          triangleCount: resource?.triangleCount ?? null,
          materialCount: resource?.materialCount ?? null,
          hasPreview: (resource?.previews.length ?? 0) > 0,
        })
        return
      }

      const resources: Record<string, string> = {}
      for (const auxiliary of resource.auxiliaries) {
        resources[auxiliary.relativePath] = getFileUrl(String(auxiliary.fileId))
      }

      sources.set(sceneResourceKey(asset), {
        kind,
        // The guarded file endpoint is still the only binary path. The manifest contains
        // identities and costs, never model bytes or a second proxy transport.
        url: getFileUrl(String(resource.original.fileId)),
        extension: getFileExtension(resource.original.originalFileName),
        resources,
        isLoading: false,
        totalSizeBytes: resource.totalSizeBytes,
        triangleCount: resource.triangleCount,
        materialCount: resource.materialCount,
        hasPreview: resource.previews.length > 0,
      })
    })

    return sources
    // The stamp tracks both data and terminal errors without making the unstable useQueries
    // result array a dependency. dataUpdatedAt remains zero for a failed request, so status
    // and errorUpdatedAt are required to avoid leaving failed resources pending forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, resourceStamp])
}

export { sceneResourceKey as sceneAssetSourceKey }
