import { useQuery } from '@tanstack/react-query'
import { type JSX, useState } from 'react'

import { getModelsPaginated } from '@/features/models/api/modelApi'
import { getSoundsPaginated } from '@/features/sounds/api/soundApi'
import { getSpritesPaginated } from '@/features/sprite/api/spriteApi'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { ListToolbarSearchInput } from '@/shared/components/list-toolbar'

export type VfxAssetKind = 'model' | 'sound' | 'sprite'

export interface VfxPickedAsset {
  id: number
  name: string
  versionId?: number | null
  fileId?: number
}

interface PickerItem extends VfxPickedAsset {
  thumbnail?: string | null
}

async function search(kind: VfxAssetKind, term: string): Promise<PickerItem[]> {
  const searchName = term.trim() || undefined
  switch (kind) {
    case 'model': {
      const page = await getModelsPaginated({
        page: 1,
        pageSize: 30,
        searchName,
      })
      return page.items
        .map(model => ({
          id: model.id,
          name: model.name,
          versionId: model.activeVersionId ?? model.latestVersionId ?? null,
          thumbnail: resolveApiAssetUrl(model.thumbnailUrl),
        }))
        .filter(item => item.versionId)
    }
    case 'sound': {
      const page = await getSoundsPaginated({
        page: 1,
        pageSize: 30,
        searchName,
      })
      return page.sounds.map(sound => ({
        id: sound.id,
        name: sound.name,
        fileId: sound.fileId,
      }))
    }
    case 'sprite': {
      const page = await getSpritesPaginated({
        page: 1,
        pageSize: 30,
        searchName,
      })
      return page.sprites.map(sprite => ({
        id: sprite.id,
        name: sprite.name,
        fileId: sprite.fileId,
      }))
    }
  }
}

const ICONS: Record<VfxAssetKind, string> = {
  model: 'pi pi-box',
  sound: 'pi pi-volume-up',
  sprite: 'pi pi-image',
}

/**
 * Picks one library asset by name for a component: a model for a mesh, a
 * sound for a sound, a sprite for a particle texture.
 */
export function VfxAssetPicker({
  kind,
  onPick,
  onCancel,
}: {
  kind: VfxAssetKind
  onPick: (asset: VfxPickedAsset) => void
  onCancel?: () => void
}): JSX.Element {
  const [term, setTerm] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['vfx', 'picker', kind, term.trim()] as const,
    queryFn: () => search(kind, term),
  })

  return (
    <div className="vfx-picker" data-testid={`vfx-picker-${kind}`}>
      <div className="vfx-picker-header">
        <ListToolbarSearchInput
          value={term}
          onChange={setTerm}
          placeholder={`Search ${kind}s`}
        />
        {onCancel ? (
          <button
            type="button"
            className="vfx-icon-button"
            onClick={onCancel}
            aria-label="Close the picker"
          >
            <i className="pi pi-times" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <ul className="vfx-picker-list">
        {(data ?? []).map(item => (
          <li key={item.id}>
            <button
              type="button"
              className="vfx-picker-item"
              data-testid="vfx-picker-item"
              onClick={() => onPick(item)}
            >
              {item.thumbnail ? (
                <img src={item.thumbnail} alt="" loading="lazy" />
              ) : (
                <i className={ICONS[kind]} aria-hidden="true" />
              )}
              <span>{item.name}</span>
            </button>
          </li>
        ))}
        {!isFetching && data?.length === 0 ? (
          <li className="vfx-picker-empty">No {kind}s match.</li>
        ) : null}
      </ul>
    </div>
  )
}
