import { useQueries, useQuery } from '@tanstack/react-query'

import { getModelById } from '@/features/models/api/modelApi'
import { getSoundById } from '@/features/sounds/api/soundApi'
import { getSpriteById } from '@/features/sprite/api/spriteApi'

import type { VfxAssetKind } from '../components/VfxAssetPicker'
import type { VfxDefinition } from '../types'

interface AssetInfo {
  name: string
  fileId?: number
}

async function fetchInfo(kind: VfxAssetKind, id: number): Promise<AssetInfo> {
  switch (kind) {
    case 'model': {
      const model = await getModelById(String(id))
      return { name: model.name }
    }
    case 'sound': {
      const sound = await getSoundById(id)
      return { name: sound.name, fileId: sound.fileId }
    }
    case 'sprite': {
      const sprite = await getSpriteById(id)
      return { name: sprite.name, fileId: sprite.fileId }
    }
  }
}

const infoQuery = (kind: VfxAssetKind, id: number) => ({
  queryKey: ['vfx', 'asset', kind, id] as const,
  queryFn: () => fetchInfo(kind, id),
  enabled: id > 0,
  staleTime: 5 * 60 * 1000,
})

/** The name (and file) of one referenced asset, for labels in the inspector. */
export function useVfxAssetInfo(
  kind: VfxAssetKind,
  id: number | null | undefined
) {
  return useQuery(infoQuery(kind, id ?? 0))
}

/**
 * Sprite and sound file ids for every component that references one: the
 * preview needs sprite files for particle textures and sound files to play.
 */
export function useVfxAssetFiles(definition: VfxDefinition): {
  spriteFiles: Map<number, number>
  soundFiles: Map<number, number>
} {
  const sprites = [
    ...new Set(
      definition.components
        .map(c => c.particles?.spriteId)
        .filter((id): id is number => typeof id === 'number' && id > 0)
    ),
  ]
  const sounds = [
    ...new Set(
      definition.components
        .map(c => c.sound?.soundId)
        .filter((id): id is number => typeof id === 'number' && id > 0)
    ),
  ]

  const spriteQueries = useQueries({
    queries: sprites.map(id => infoQuery('sprite', id)),
  })
  const soundQueries = useQueries({
    queries: sounds.map(id => infoQuery('sound', id)),
  })

  const spriteFiles = new Map<number, number>()
  sprites.forEach((id, index) => {
    const fileId = spriteQueries[index]?.data?.fileId
    if (fileId) spriteFiles.set(id, fileId)
  })
  const soundFiles = new Map<number, number>()
  sounds.forEach((id, index) => {
    const fileId = soundQueries[index]?.data?.fileId
    if (fileId) soundFiles.set(id, fileId)
  })

  return { spriteFiles, soundFiles }
}
