import { useQueries } from '@tanstack/react-query'

import { getFileUrl } from '@/features/models/api/modelApi'
import { getSceneResourceQueryOptions } from '@/features/scenes/api/resourceQueries'
import type { SceneAssetSource } from '@/features/scenes/hooks/useSceneAssetSources'
import { getFileExtension } from '@/utils/fileUtils'

import { isPrimitiveMesh, type VfxDefinition } from '../types'

/**
 * Mesh sources for every mesh component, resolved outside the Canvas because
 * the R3F reconciler cannot see the app's QueryClient - the same split the
 * scene editor uses. `settled` is true once no lookup is still in flight.
 */
export function useVfxMeshSources(definition: VfxDefinition): {
  sources: Map<string, SceneAssetSource>
  settled: boolean
} {
  const meshComponents = definition.components.filter(
    c =>
      c.type === 'mesh' &&
      c.mesh &&
      !isPrimitiveMesh(c.mesh) &&
      (c.mesh.modelId ?? 0) > 0
  )
  const resourceQueries = useQueries({
    queries: meshComponents.map(c =>
      getSceneResourceQueryOptions({
        assetType: 'Model',
        assetId: c.mesh!.modelId ?? 0,
        versionId: c.mesh!.versionId ?? null,
      })
    ),
  })

  const sources = new Map<string, SceneAssetSource>()
  meshComponents.forEach((component, index) => {
    const resource = resourceQueries[index]?.data
    if (!resource?.resolved || !resource.original) return
    const resources: Record<string, string> = {}
    for (const auxiliary of resource.auxiliaries) {
      resources[auxiliary.relativePath] = getFileUrl(String(auxiliary.fileId))
    }
    sources.set(component.id, {
      kind: 'mesh',
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

  return { sources, settled: resourceQueries.every(q => !q.isLoading) }
}
