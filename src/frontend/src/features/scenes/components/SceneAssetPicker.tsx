import './SceneAssetPicker.css'

import { useQuery } from '@tanstack/react-query'
import { type JSX, useState } from 'react'

import { getModelsPaginated } from '@/features/models/api/modelApi'
import { ApiClientError, resolveApiAssetUrl } from '@/lib/apiBase'
import { EmptyState, ErrorState, LoadingState } from '@/shared/components'
import { AssetGrid, AssetTile } from '@/shared/components/asset-tile'
import { ListToolbarSearchInput } from '@/shared/components/list-toolbar'
import type { Model } from '@/utils/fileUtils'

interface SceneAssetPickerProps {
  /** Called with the model and the version to pin the new node to. */
  onPlace: (model: Model, versionId: number) => void
  disabled?: boolean
}

/**
 * Picks a library model to place into the scene.
 *
 * Searches by name through the ordinary model listing rather than the semantic
 * search endpoint: a user building a scene by hand is looking for a model they
 * know the name of, and the listing is the one call that returns the version
 * ids a scene node has to pin.
 */
export function SceneAssetPicker({
  onPlace,
  disabled = false,
}: SceneAssetPickerProps): JSX.Element {
  const [term, setTerm] = useState('')

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['models', 'scene-picker', term.trim()] as const,
    queryFn: () =>
      getModelsPaginated({
        page: 1,
        pageSize: 40,
        searchName: term.trim() || undefined,
      }),
  })

  const items = data?.items ?? []

  return (
    <section className="scene-asset-picker" data-testid="scene-asset-picker">
      <header className="scene-asset-picker-header">
        <h3>Library</h3>
        <span className="scene-asset-picker-hint">
          Click a model to place it
        </span>
      </header>

      <ListToolbarSearchInput
        value={term}
        onChange={setTerm}
        placeholder="Search models"
      />

      <div className="scene-asset-picker-results">
        {error ? (
          <ErrorState
            variant="inline"
            message={
              error instanceof ApiClientError
                ? error.message
                : 'Models could not be loaded.'
            }
            onRetry={() => void refetch()}
          />
        ) : isFetching && items.length === 0 ? (
          <LoadingState variant="inline" message="Searching…" />
        ) : items.length === 0 ? (
          <EmptyState
            variant="compact"
            icon="pi-search"
            title="No models match"
            message={
              term.trim()
                ? 'Try a shorter term - the search matches on name.'
                : 'Import models first, then place them here.'
            }
          />
        ) : (
          <AssetGrid cardWidth={92} className="scene-asset-picker-grid">
            {items.map(model => {
              // A scene node pins a version. The active one is what the rest of
              // the app shows for this model, so it is what a manual placement
              // means; a model with neither cannot be pinned and is not offered.
              const versionId = model.activeVersionId ?? model.latestVersionId
              const thumbnail = resolveApiAssetUrl(model.thumbnailUrl)

              return (
                <AssetTile
                  key={model.id}
                  name={model.name}
                  className={
                    versionId
                      ? undefined
                      : 'scene-asset-picker-tile--unpinnable'
                  }
                  dataAttributes={{
                    'data-testid': 'scene-picker-tile',
                    'data-model-id': model.id,
                  }}
                  onClick={
                    disabled || !versionId
                      ? undefined
                      : () => onPlace(model, versionId)
                  }
                  media={
                    thumbnail ? (
                      <img src={thumbnail} alt="" loading="lazy" />
                    ) : (
                      <div className="scene-asset-picker-noart">
                        <i className="pi pi-box" aria-hidden />
                      </div>
                    )
                  }
                />
              )
            })}
          </AssetGrid>
        )}
      </div>
    </section>
  )
}
