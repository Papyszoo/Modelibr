import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getTextureSetByIdQueryOptions } from '@/features/texture-set/api/queries'
import type { TextureSetDto } from '@/types'

import type { SceneDocument } from '../types'

/**
 * The texture set each node's material binding points at, keyed by node id.
 *
 * **Must be called outside `<Canvas>`,** for the same reason
 * `useSceneAssetSources` must: react-three-fiber renders the canvas subtree
 * through its own reconciler root, so the QueryClient is not reachable from
 * inside it. Fetch out here, pass plain props in.
 *
 * Why this exists: `apply_material` and the editor both persist a binding onto
 * the node, and the viewport rendered the source model's own materials
 * regardless. A scene an agent had dressed looked nothing like its saved
 * document, and there was no way to tell from the canvas whether a material had
 * been applied at all.
 *
 * Keyed exactly as the texture-set feature keys it, so a scene with forty walls
 * sharing one material issues one request - shared with any texture-set tab
 * already open.
 */
export function useSceneMaterials(
  document: SceneDocument | null
): Map<string, TextureSetDto> {
  const bindings = useMemo(() => {
    const byNode = new Map<string, number>()
    for (const node of document?.nodes ?? []) {
      if (node.material?.textureSetId != null) {
        byNode.set(node.id, node.material.textureSetId)
      }
    }
    return byNode
  }, [document])

  const textureSetIds = useMemo(
    () => [...new Set(bindings.values())].sort((a, b) => a - b),
    [bindings]
  )

  const queries = useQueries({
    queries: textureSetIds.map(id => ({
      ...getTextureSetByIdQueryOptions(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const stamp = queries.map(q => q.dataUpdatedAt).join()

  return useMemo(() => {
    const byId = new Map<number, TextureSetDto>()
    textureSetIds.forEach((id, index) => {
      const set = queries[index]?.data
      if (set) {
        byId.set(id, set)
      }
    })

    const byNode = new Map<string, TextureSetDto>()
    for (const [nodeId, textureSetId] of bindings) {
      const set = byId.get(textureSetId)
      if (set) {
        byNode.set(nodeId, set)
      }
    }

    return byNode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings, textureSetIds, stamp])
}
