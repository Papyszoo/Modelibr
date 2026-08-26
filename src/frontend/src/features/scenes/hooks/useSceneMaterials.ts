import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import type { MaterialDto } from '@/features/materials/api/materialApi'
import { getMaterialByIdQueryOptions } from '@/features/materials/api/queries'
import { getTextureSetByIdQueryOptions } from '@/features/texture-set/api/queries'
import type { TextureSetDto } from '@/types'

import type { SceneDocument, SceneMaterialBinding } from '../types'

/**
 * Everything dressing one node, keyed by the model's material slot name. The
 * empty-string key is the node's default binding: it dresses every slot no other
 * key names, which is the layering the scene document defines.
 */
export interface NodeDressing {
  /** Tiling global materials - image channels, and they need UVs. */
  textureSets: Record<string, TextureSetDto>
  /** Parameter materials - a colour and a roughness, and they need nothing. */
  materials: Record<string, MaterialDto>
}

const EMPTY_DRESSING: NodeDressing = { textureSets: {}, materials: {} }

/** The bindings on a node: its default one first, then its per-slot overrides. */
function bindingsOf(node: {
  material?: SceneMaterialBinding | null
  materialSlots?: SceneMaterialBinding[] | null
}): SceneMaterialBinding[] {
  const bindings: SceneMaterialBinding[] = []
  if (node.material) bindings.push(node.material)
  for (const slot of node.materialSlots ?? []) bindings.push(slot)
  return bindings
}

/**
 * What dresses each node, keyed by node id.
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
 * Keyed exactly as each feature keys its own detail query, so a scene with forty
 * walls sharing one material issues one request - shared with any texture-set or
 * material tab already open.
 */
export function useSceneMaterials(
  document: SceneDocument | null
): Map<string, NodeDressing> {
  const bindings = useMemo(() => {
    const byNode = new Map<string, SceneMaterialBinding[]>()
    for (const node of document?.nodes ?? []) {
      const nodeBindings = bindingsOf(node)
      if (nodeBindings.length > 0) {
        byNode.set(node.id, nodeBindings)
      }
    }
    return byNode
  }, [document])

  const { textureSetIds, materialIds } = useMemo(() => {
    const textureSets = new Set<number>()
    const materials = new Set<number>()
    for (const nodeBindings of bindings.values()) {
      for (const binding of nodeBindings) {
        if (binding.textureSetId != null) textureSets.add(binding.textureSetId)
        if (binding.materialId != null) materials.add(binding.materialId)
      }
    }
    return {
      textureSetIds: [...textureSets].sort((a, b) => a - b),
      materialIds: [...materials].sort((a, b) => a - b),
    }
  }, [bindings])

  const textureSetQueries = useQueries({
    queries: textureSetIds.map(id => ({
      ...getTextureSetByIdQueryOptions(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const materialQueries = useQueries({
    queries: materialIds.map(id => ({
      ...getMaterialByIdQueryOptions(id),
      staleTime: 5 * 60 * 1000,
    })),
  })

  const stamp = [...textureSetQueries, ...materialQueries]
    .map(query => query.dataUpdatedAt)
    .join()

  return useMemo(() => {
    const textureSetsById = new Map<number, TextureSetDto>()
    textureSetIds.forEach((id, index) => {
      const set = textureSetQueries[index]?.data
      if (set) textureSetsById.set(id, set)
    })

    const materialsById = new Map<number, MaterialDto>()
    materialIds.forEach((id, index) => {
      const material = materialQueries[index]?.data
      if (material) materialsById.set(id, material)
    })

    const byNode = new Map<string, NodeDressing>()
    for (const [nodeId, nodeBindings] of bindings) {
      const dressing: NodeDressing = { textureSets: {}, materials: {} }

      for (const binding of nodeBindings) {
        const slot = binding.slot ?? ''

        if (binding.materialId != null) {
          const material = materialsById.get(binding.materialId)
          if (material) dressing.materials[slot] = material
        } else if (binding.textureSetId != null) {
          const set = textureSetsById.get(binding.textureSetId)
          if (set) dressing.textureSets[slot] = set
        }
      }

      if (
        Object.keys(dressing.textureSets).length > 0 ||
        Object.keys(dressing.materials).length > 0
      ) {
        byNode.set(nodeId, dressing)
      }
    }

    return byNode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindings, textureSetIds, materialIds, stamp])
}

export { EMPTY_DRESSING }
