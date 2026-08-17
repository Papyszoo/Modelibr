import './SceneNodeMaterials.css'

import { useQuery } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { type JSX, useMemo, useState } from 'react'

import type { MaterialLibraryEntryDto } from '@/features/materials/api/materialApi'
import { getMaterialLibraryQueryOptions } from '@/features/materials/api/queries'
import { MaterialSwatch } from '@/features/materials/components/MaterialSwatch'
import { getModelVersions } from '@/features/model-viewer/api/modelVersionApi'
import { ApiClientError, baseURL } from '@/lib/apiBase'
import {
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/components'
import { ListToolbarSearchInput } from '@/shared/components/list-toolbar'

import type { NodeDressing } from '../hooks/useSceneMaterials'
import { bindingForSlot, boundSlotNames } from '../lib/sceneDressing'
import type { SceneMaterialBinding, SceneNode } from '../types'

interface SceneNodeMaterialsProps {
  node: SceneNode | null
  /** What is dressing this node now, resolved to names by the editor. */
  dressing: NodeDressing | undefined
  /** Null slot is the node's default binding; null binding clears it. */
  onBind: (slot: string | null, binding: SceneMaterialBinding | null) => void
}

/** The row the default binding is offered on - not a slot the model declares. */
const DEFAULT_ROW = { slot: null, label: 'Every slot' } as const

/**
 * Dresses the selected node - the app's half of `apply_material`.
 *
 * This is the one surface where the two kinds of material are deliberately
 * shown **together**: a texture set and a parameter material are browsed on
 * separate pages, because one is images and one is numbers, but when the
 * question is "what goes in this slot" the mechanism genuinely does not matter.
 * That is why it reads the merged `/materials/library` rather than either
 * page's own endpoint.
 *
 * Bindings are scene-local and land in the draft document, so they undo with
 * Ctrl+Z and reach the server on the next save - the same path a transform
 * edit takes, and the same document `apply_material` writes.
 */
export function SceneNodeMaterials({
  node,
  dressing,
  onBind,
}: SceneNodeMaterialsProps): JSX.Element | null {
  const [pickingSlot, setPickingSlot] = useState<
    { slot: string | null } | undefined
  >(undefined)

  const assetId = node?.asset?.assetType === 'Model' ? node.asset.assetId : null
  const versionId = node?.asset?.versionId ?? null

  // Keyed exactly as useSceneAssetSources keys it, so the panel reuses the
  // version list the viewport already fetched to render this node.
  const versionsQuery = useQuery({
    queryKey: ['modelVersions', assetId] as const,
    queryFn: () => getModelVersions(assetId!),
    enabled: assetId != null,
    staleTime: 5 * 60 * 1000,
  })

  const slots = useMemo(() => {
    if (!node) {
      return []
    }

    const version = versionsQuery.data?.find(
      candidate => candidate.id === versionId
    )
    const declared = version?.materialNames ?? []

    // Slots the model no longer declares are still listed when something is
    // bound to them. An agent may have dressed a slot that a later version
    // renamed away, and a binding the panel hides is one nobody can remove.
    const names = [...declared]
    for (const bound of boundSlotNames(node)) {
      if (!names.some(name => name.toLowerCase() === bound.toLowerCase())) {
        names.push(bound)
      }
    }
    return names
  }, [node, versionsQuery.data, versionId])

  if (!node) {
    return null
  }

  if (!node.asset) {
    // Primitives are drawn from three.js geometry the dressing path never
    // touches, so a picker here would change the document and nothing else.
    return (
      <section
        className="scene-node-materials"
        data-testid="scene-node-materials"
      >
        <h4>Materials</h4>
        <p className="scene-node-materials-note">
          Blockout shapes are drawn as plain volumes. Place a library model to
          dress it.
        </p>
      </section>
    )
  }

  const rows: { slot: string | null; label: string }[] = [
    DEFAULT_ROW,
    ...slots.map(slot => ({ slot, label: slot })),
  ]

  return (
    <section
      className="scene-node-materials"
      data-testid="scene-node-materials"
    >
      <h4>Materials</h4>
      <p className="scene-node-materials-note">
        Dressing applies to this placement only - the model keeps its own
        materials everywhere else.
      </p>

      <ul className="scene-node-materials-rows">
        {rows.map(row => {
          const key = row.slot ?? ''
          const bound = describeBinding(node, row.slot, dressing)

          return (
            <li
              key={key}
              className="scene-node-materials-row"
              data-testid="scene-node-materials-row"
              data-slot={key}
            >
              <div className="scene-node-materials-slot">
                <span className="scene-node-materials-slot-name">
                  {row.label}
                </span>
                <span className="scene-node-materials-bound">
                  {bound ? (
                    <>
                      {bound.media}
                      <span className="scene-node-materials-bound-name">
                        {bound.name}
                      </span>
                      <span className="scene-node-materials-kind">
                        {bound.kind}
                      </span>
                    </>
                  ) : (
                    <span className="scene-node-materials-empty">
                      {row.slot === null ? 'model default' : 'inherits default'}
                    </span>
                  )}
                </span>
              </div>

              <div className="scene-node-materials-actions">
                <Button
                  icon="pi pi-palette"
                  text
                  size="small"
                  aria-label={`Dress ${row.label}`}
                  tooltip={`Dress ${row.label}`}
                  data-testid={`scene-node-materials-pick-${key}`}
                  onClick={() => setPickingSlot({ slot: row.slot })}
                />
                {bound ? (
                  <Button
                    icon="pi pi-times"
                    text
                    size="small"
                    severity="danger"
                    aria-label={`Clear ${row.label}`}
                    tooltip={`Clear ${row.label}`}
                    data-testid={`scene-node-materials-clear-${key}`}
                    onClick={() => onBind(row.slot, null)}
                  />
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {pickingSlot ? (
        <MaterialPickerDialog
          slot={pickingSlot.slot}
          current={bindingForSlot(node, pickingSlot.slot)}
          onClose={() => setPickingSlot(undefined)}
          onPick={entry => {
            onBind(pickingSlot.slot, bindingOf(entry))
            setPickingSlot(undefined)
          }}
        />
      ) : null}
    </section>
  )
}

/** One library entry as the binding the document stores for it. */
function bindingOf(entry: MaterialLibraryEntryDto): SceneMaterialBinding {
  // One source or the other, never both: the server rejects a binding naming a
  // materialId and a textureSetId as ambiguous rather than picking one.
  return entry.kind === 'Material'
    ? { materialId: entry.id }
    : { textureSetId: entry.id }
}

/** What is bound to a slot, resolved through the dressing the editor fetched. */
function describeBinding(
  node: SceneNode,
  slot: string | null,
  dressing: NodeDressing | undefined
): { name: string; kind: string; media: JSX.Element } | null {
  const binding = bindingForSlot(node, slot)
  if (!binding) {
    return null
  }

  // The dressing map is keyed by the slot the *binding* carries, which need
  // not match the case of the name the model declares. Looked up on the
  // binding's own label so a row does not fall back to "Material 7" purely
  // because a slot was stored as "Cushions" and declared as "cushions".
  const key = slot === null ? '' : (binding.slot ?? slot)

  if (binding.materialId != null) {
    const material = dressing?.materials[key]
    return {
      name: material?.name ?? `Material ${binding.materialId}`,
      kind: 'PBR',
      media: material ? (
        <MaterialSwatch parameters={material.parameters} />
      ) : (
        <span className="scene-node-materials-noart" aria-hidden />
      ),
    }
  }

  const textureSet = dressing?.textureSets[key]
  return {
    name: textureSet?.name ?? `Texture set ${binding.textureSetId}`,
    kind: 'Textures',
    media: <span className="scene-node-materials-noart" aria-hidden />,
  }
}

interface MaterialPickerDialogProps {
  slot: string | null
  current: SceneMaterialBinding | null
  onClose: () => void
  onPick: (entry: MaterialLibraryEntryDto) => void
}

/**
 * The merged surface itself: both kinds, one list, told apart by a badge
 * rather than by which page they were found on.
 *
 * A modal, not an inline panel in the property column. The first version was
 * inline - picking a material is done against the viewport, and a dialog covers
 * the object being dressed - but a scrolling list nested inside the already
 * scrolling 280px property column left entries that could not reliably be
 * clicked: the browser scrolled the inner box and the outer one against each
 * other, and the search field ended up over the entry. Room to see the swatches
 * is worth more here than keeping the viewport uncovered.
 */
function MaterialPickerDialog({
  slot,
  current,
  onClose,
  onPick,
}: MaterialPickerDialogProps): JSX.Element {
  const [term, setTerm] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    ...getMaterialLibraryQueryOptions({
      search: term.trim() || undefined,
      pageSize: 60,
    }),
    // Searching re-keys the query on every keystroke; without this the list
    // drops to its loading state between characters and unmounts the input the
    // user is typing into.
    placeholderData: previous => previous,
  })

  const entries = data?.entries ?? []

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      header={slot === null ? 'Dress every slot' : `Dress "${slot}"`}
      className="scene-node-materials-picker"
      data-testid="scene-material-picker"
    >
      <ListToolbarSearchInput
        value={term}
        onChange={setTerm}
        placeholder="Search materials"
      />

      {error ? (
        <ErrorState
          variant="inline"
          message={
            error instanceof ApiClientError
              ? error.message
              : 'Materials could not be loaded.'
          }
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <LoadingState variant="inline" message="Loading materials…" />
      ) : entries.length === 0 ? (
        <EmptyState
          variant="compact"
          icon="pi-palette"
          title="No materials match"
          message={
            term.trim()
              ? 'No material or global material matches that name.'
              : 'Create a PBR material, or mark a texture set as a global material, and it appears here.'
          }
        />
      ) : (
        <ul className="scene-node-materials-entries">
          {entries.map(entry => {
            const isCurrent =
              entry.kind === 'Material'
                ? current?.materialId === entry.id
                : current?.textureSetId === entry.id

            return (
              <li key={`${entry.kind}-${entry.id}`}>
                <button
                  type="button"
                  className={`scene-node-materials-entry${
                    isCurrent ? ' scene-node-materials-entry--current' : ''
                  }`}
                  data-testid="scene-material-picker-entry"
                  data-entry-kind={entry.kind}
                  data-entry-id={entry.id}
                  onClick={() => onPick(entry)}
                >
                  <span className="scene-node-materials-entry-media">
                    {entry.parameters ? (
                      <MaterialSwatch parameters={entry.parameters} />
                    ) : entry.hasThumbnail ? (
                      <img
                        src={`${baseURL}/texture-sets/${entry.id}/thumbnail/file`}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="scene-node-materials-noart"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="scene-node-materials-entry-text">
                    <span className="scene-node-materials-entry-name">
                      {entry.name}
                    </span>
                    <span className="scene-node-materials-entry-meta">
                      {entry.kind === 'Material' ? 'PBR' : 'Textures'}
                      {/* The one distinction worth acting on: a texture set
                          has nothing to project onto a model with no UVs. */}
                      {entry.requiresUvs ? ' · needs UVs' : ''}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
