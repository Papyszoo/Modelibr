import './ProjectLevelAssetsSection.css'

import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import {
  useProjectLevelsQuery,
  useProjectMemberModelsQuery,
} from '@/features/project/api/projectStudioQueries'
import {
  getSceneByIdQueryOptions,
  useScenesQuery,
} from '@/features/scenes/api/queries'
import type { SceneAssetType } from '@/features/scenes/api/sceneContract.generated'
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components/feedback'

import {
  deriveLevelSceneAssets,
  type LevelSceneAsset,
  levelSceneAssetKey,
  selectLevelScenes,
} from '../levelAssets'

interface ProjectLevelAssetsSectionProps {
  projectId: number
  /**
   * Scopes the section to one Level and drops the picker.
   *
   * The Level workspace's Assets view *is* the filter, so offering a picker there
   * would let the user navigate away from the level they opened. Null keeps the
   * Project tab's behaviour: a picker over every level.
   */
  levelId?: number | null
}

const ASSET_TYPE_ICONS: Record<SceneAssetType, string> = {
  Model: 'pi pi-box',
  Sprite: 'pi pi-image',
  EnvironmentMap: 'pi pi-globe',
}

const ASSET_TYPE_LABELS: Record<SceneAssetType, string> = {
  Model: 'Model',
  Sprite: 'Sprite',
  EnvironmentMap: 'Environment map',
}

/**
 * What one Level's Scenes place, with the provenance on every row.
 *
 * A Level owns no assets of its own, so nothing here can be added, removed, or
 * renamed from this surface - the scenes are where that is decided. The two
 * relationships a user has to tell apart are kept apart on purpose: what the
 * Level's Scenes place, and what the project explicitly holds as a member.
 */
export function ProjectLevelAssetsSection({
  projectId,
  levelId: scopedLevelId = null,
}: ProjectLevelAssetsSectionProps) {
  const levelsQuery = useProjectLevelsQuery(projectId)
  const scenesQuery = useScenesQuery()
  const membersQuery = useProjectMemberModelsQuery(projectId)
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null)

  const levels = useMemo(
    () =>
      [...(levelsQuery.data ?? [])].sort(
        (left, right) => left.sortOrder - right.sortOrder
      ),
    [levelsQuery.data]
  )
  // Defaults to the first level in production order, so the section is useful
  // before anything is picked, and follows the project when levels are added.
  // A scoped `levelId` wins: it is the level the workspace was opened on.
  const levelId = scopedLevelId ?? selectedLevelId ?? levels[0]?.id ?? null
  const level = levels.find(candidate => candidate.id === levelId) ?? null

  const levelScenes = useMemo(
    () =>
      levelId === null
        ? []
        : selectLevelScenes(scenesQuery.data ?? [], projectId, levelId),
    [scenesQuery.data, projectId, levelId]
  )

  // The editor's own document read, reused rather than reimplemented: a scene is
  // written from outside this browser (an agent over MCP), so it is never served
  // stale, and a level's asset list that lagged behind the scene would be a lie.
  const documentQueries = useQueries({
    queries: levelScenes.map(scene => getSceneByIdQueryOptions(scene.id)),
  })

  const memberNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const model of membersQuery.data ?? []) {
      names.set(
        levelSceneAssetKey({ assetType: 'Model', assetId: Number(model.id) }),
        model.name
      )
    }
    return names
  }, [membersQuery.data])

  // Recomputed rather than memoised: `useQueries` hands back a fresh array every
  // render, so a dependency on it would invalidate the memo on every render
  // anyway. Walking a handful of scene documents is cheaper than the bookkeeping
  // needed to pretend otherwise.
  const derivedAssets = deriveLevelSceneAssets(
    levelScenes.map((scene, index) => ({
      ...scene,
      document: documentQueries[index]?.data?.document ?? null,
    })),
    {
      resolveProjectMemberName: asset =>
        memberNames.get(levelSceneAssetKey(asset)) ?? null,
    }
  )

  const queryError =
    levelsQuery.error ?? scenesQuery.error ?? membersQuery.error
  const documentError = documentQueries.find(query => query.isError)?.error

  if (queryError) {
    return (
      <ErrorState
        title="Could not load level assets"
        message={
          queryError instanceof Error
            ? queryError.message
            : 'The level asset request failed.'
        }
        onRetry={() => {
          void Promise.all([
            levelsQuery.refetch(),
            scenesQuery.refetch(),
            membersQuery.refetch(),
          ])
        }}
      />
    )
  }

  if (levelsQuery.isLoading || scenesQuery.isLoading) {
    return <LoadingState message="Loading level assets…" />
  }

  if (levels.length === 0) {
    return (
      <section
        className="project-level-assets"
        data-testid="level-assets"
        aria-labelledby="project-level-assets-title"
      >
        <div className="project-level-assets-header">
          <div>
            <span className="container-rich-kicker">Derived usage</span>
            <h3 id="project-level-assets-title">Level assets</h3>
          </div>
        </div>
        <EmptyState
          icon="pi pi-map"
          title="No levels yet"
          message="A level's assets are the ones its scenes place. Create a level, then link a scene to it."
        />
      </section>
    )
  }

  if (documentError) {
    return (
      <ErrorState
        title="Could not read a level scene"
        message={
          documentError instanceof Error
            ? documentError.message
            : 'A scene linked to this level could not be read.'
        }
        onRetry={() => {
          void Promise.all(documentQueries.map(query => query.refetch()))
        }}
      />
    )
  }

  const reading =
    membersQuery.isLoading || documentQueries.some(query => query.isLoading)
  const members = membersQuery.data ?? []

  return (
    <section
      className="project-level-assets"
      data-testid="level-assets"
      aria-labelledby="project-level-assets-title"
    >
      <div className="project-level-assets-header">
        <div>
          <span className="container-rich-kicker">Derived usage</span>
          <h3 id="project-level-assets-title">Level assets</h3>
        </div>
        <div className="project-level-assets-header-actions">
          {scopedLevelId === null && (
            <select
              className="project-level-assets-level"
              data-testid="level-assets-level"
              aria-label="Level for assets"
              value={levelId ?? ''}
              onChange={event => setSelectedLevelId(Number(event.target.value))}
            >
              {levels.map(candidate => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {reading ? (
        <LoadingState
          variant="inline"
          message={`Loading the assets of ${level?.name ?? 'this level'}…`}
        />
      ) : (
        <>
          <div
            className="project-level-assets-group"
            data-testid="level-assets-scene-group"
          >
            <div className="project-level-assets-group-head">
              <h4>From level scenes</h4>
              <span className="project-level-assets-group-note">
                placed by this level's scenes
              </span>
              <span className="project-studio-count">
                {derivedAssets.length}
              </span>
            </div>
            {levelScenes.length === 0 ? (
              <EmptyState
                variant="compact"
                icon="pi pi-box"
                title="No scene linked to this level"
                message="Link a scene to this level, then place assets in it - each one appears here with the scene that places it."
              />
            ) : derivedAssets.length === 0 ? (
              <EmptyState
                variant="compact"
                icon="pi pi-box"
                title="No assets placed yet"
                message={`${levelScenes.length === 1 ? 'This scene places' : 'These scenes place'} nothing yet. Open the scene and place a model, sprite, or environment map.`}
              />
            ) : (
              <div className="project-level-asset-list">
                {derivedAssets.map(asset => (
                  <LevelAssetRow
                    key={asset.key}
                    asset={asset}
                    testId="level-assets-row"
                  />
                ))}
              </div>
            )}
          </div>

          <div
            className="project-level-assets-group"
            data-testid="level-assets-member-group"
          >
            <div className="project-level-assets-group-head">
              <h4>Project members</h4>
              <span className="project-level-assets-group-note">
                added to the project
              </span>
              <span className="project-studio-count">{members.length}</span>
            </div>
            {members.length === 0 ? (
              <EmptyState
                variant="compact"
                icon="pi pi-inbox"
                title="No explicit project members"
                message="Models added to the project from its model section are listed here, apart from the ones its scenes place."
              />
            ) : (
              <div className="project-level-asset-list">
                {members.map(model => (
                  <div
                    className="project-level-asset-row"
                    key={model.id}
                    data-testid="level-assets-member-row"
                    data-asset-label={model.name}
                  >
                    <div className="project-level-asset-heading">
                      <i
                        className={ASSET_TYPE_ICONS.Model}
                        aria-hidden="true"
                      />
                      <strong>{model.name}</strong>
                      <span className="project-status-pill">Model</span>
                    </div>
                    <div className="project-level-asset-origin">
                      <span className="project-level-asset-origin-label">
                        Project member
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function LevelAssetRow({
  asset,
  testId,
}: {
  asset: LevelSceneAsset
  testId: string
}) {
  return (
    <div
      className="project-level-asset-row"
      data-testid={testId}
      data-asset-key={asset.key}
      data-asset-label={asset.label}
    >
      <div className="project-level-asset-heading">
        <i className={ASSET_TYPE_ICONS[asset.assetType]} aria-hidden="true" />
        <strong>{asset.label}</strong>
        <span className="project-status-pill">
          {ASSET_TYPE_LABELS[asset.assetType]}
        </span>
        {asset.isProjectMember ? (
          <span className="project-status-pill">Project member</span>
        ) : null}
      </div>
      <div className="project-level-asset-origin">
        {asset.placements.length === 1 ? (
          <span className="project-level-asset-origin-label">Scene</span>
        ) : (
          <span className="project-level-asset-origin-label">Scenes</span>
        )}
        {asset.placements.map(placement => (
          <span
            className="project-level-asset-scene"
            key={placement.sceneId}
            data-testid="level-assets-scene"
            data-scene-name={placement.sceneName}
          >
            {placement.sceneName}
            {placement.isPrimaryScene ? (
              <span className="project-level-asset-scene-primary">primary</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  )
}
