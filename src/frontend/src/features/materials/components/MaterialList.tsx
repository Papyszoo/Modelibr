import './MaterialList.css'

import { Button } from 'primereact/button'
import { type JSX, useState } from 'react'

import { ApiClientError } from '@/lib/apiBase'
import {
  Dialog,
  EmptyState,
  ErrorState,
  ListHeader,
  LoadingState,
} from '@/shared/components'
import { AddTile, AssetGrid, AssetTile } from '@/shared/components/asset-tile'
import {
  ListToolbar,
  ListToolbarRow,
  ListToolbarSearchInput,
} from '@/shared/components/list-toolbar'

import { type MaterialDto } from '../api/materialApi'
import {
  useCreateMaterialMutation,
  useDeleteMaterialMutation,
  useMaterialsQuery,
  useUpdateMaterialMutation,
} from '../api/queries'
import {
  MaterialEditorDialog,
  type MaterialEditorSubmit,
} from './MaterialEditorDialog'
import { MaterialSwatch } from './MaterialSwatch'

/**
 * The PBR materials page.
 *
 * Deliberately separate from the texture-set page: a texture set is images, a
 * PBR material is numbers, and the user browses them apart. They only meet
 * where something is being put into a model's material slot - that is what the
 * merged `/materials/library` surface is for, not this page.
 */
export function MaterialList(): JSX.Element {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<MaterialDto | null | undefined>(
    undefined
  )
  const [pendingDelete, setPendingDelete] = useState<MaterialDto | null>(null)

  const { data, isLoading, error, refetch } = useMaterialsQuery({
    options: search.trim() ? { search: search.trim() } : {},
  })
  const createMaterial = useCreateMaterialMutation()
  const updateMaterial = useUpdateMaterialMutation()
  const deleteMaterial = useDeleteMaterialMutation()

  const isEditorOpen = editing !== undefined
  const isSaving = createMaterial.isPending || updateMaterial.isPending

  const handleSubmit = async (value: MaterialEditorSubmit): Promise<void> => {
    // Only the hex goes up for the colour - never the float components too.
    // The server treats the hex as authoritative when both are present, so
    // sending both is a way to disagree with yourself.
    const { baseColorHex, ...rest } = value.parameters
    const parameters = {
      baseColorHex,
      baseColorA: rest.baseColorA,
      roughness: rest.roughness,
      metallic: rest.metallic,
      emissiveR: rest.emissiveR,
      emissiveG: rest.emissiveG,
      emissiveB: rest.emissiveB,
      normalScale: rest.normalScale,
      occlusionStrength: rest.occlusionStrength,
      ior: rest.ior,
      alphaMode: rest.alphaMode,
      alphaCutoff: rest.alphaCutoff,
      doubleSided: rest.doubleSided,
    }

    if (editing) {
      await updateMaterial.mutateAsync({
        materialId: editing.id,
        request: {
          name: value.name,
          description: value.description,
          parameters,
        },
      })
    } else {
      await createMaterial.mutateAsync({
        name: value.name,
        description: value.description,
        parameters,
      })
    }

    setEditing(undefined)
  }

  const materials = data?.materials ?? []

  return (
    <div className="material-list" data-testid="material-list">
      <ListHeader
        title="PBR Materials"
        subtitle="Materials defined by parameters rather than images - a colour, a roughness, a metallic. They need no UVs, so they dress any model."
        stats={[
          {
            icon: 'pi-palette',
            label: `${materials.length} material${materials.length === 1 ? '' : 's'}`,
          },
        ]}
        actions={
          <Button
            icon="pi pi-plus"
            label="New material"
            size="small"
            data-testid="material-list-new"
            onClick={() => setEditing(null)}
          />
        }
      />

      <ListToolbar>
        <ListToolbarRow>
          <ListToolbarSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search materials..."
          />
        </ListToolbarRow>
      </ListToolbar>

      {/* The header and toolbar above stay mounted through every state. An
          early return for loading/error unmounts the search input mid-search
          and the caret goes with it - one keystroke was all you could type. */}
      {error ? (
        <ErrorState
          message={
            error instanceof ApiClientError
              ? error.message
              : 'Materials could not be loaded.'
          }
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <LoadingState message="Loading materials…" />
      ) : materials.length === 0 ? (
        <EmptyState
          icon="pi-palette"
          title={search.trim() ? 'No materials match' : 'No PBR materials yet'}
          message={
            search.trim()
              ? 'No material matches that name.'
              : 'A PBR material is a colour and a few numbers - enough to dress a model that has no textures at all.'
          }
          action={
            search.trim() ? undefined : (
              <Button
                icon="pi pi-plus"
                label="New material"
                size="small"
                onClick={() => setEditing(null)}
              />
            )
          }
        />
      ) : (
        <AssetGrid cardWidth={180} className="material-list-grid">
          {materials.map(material => (
            <AssetTile
              key={material.id}
              name={material.name}
              meta={describeMaterial(material)}
              dataAttributes={{
                'data-testid': 'material-tile',
                'data-material-id': material.id,
              }}
              onClick={() => setEditing(material)}
              onContextMenu={event => {
                event.preventDefault()
                setPendingDelete(material)
              }}
              media={<MaterialSwatch parameters={material.parameters} />}
            />
          ))}
          <AddTile label="New material" onClick={() => setEditing(null)} />
        </AssetGrid>
      )}

      {isEditorOpen && (
        <MaterialEditorDialog
          // Remounting per material is what seeds the editor's draft state,
          // so switching materials cannot leave the previous one's values.
          key={editing?.id ?? 'new'}
          open
          material={editing}
          isSaving={isSaving}
          onClose={() => setEditing(undefined)}
          onSubmit={value => void handleSubmit(value)}
        />
      )}

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        header="Delete material"
        size="sm"
        footer={
          <>
            <Button
              label="Cancel"
              text
              size="small"
              onClick={() => setPendingDelete(null)}
            />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              size="small"
              data-testid="material-delete-confirm"
              loading={deleteMaterial.isPending}
              onClick={async () => {
                if (pendingDelete) {
                  await deleteMaterial.mutateAsync(pendingDelete.id)
                }
                setPendingDelete(null)
              }}
            />
          </>
        }
      >
        <p className="material-list-confirm">
          Delete <strong>{pendingDelete?.name}</strong>? Any scene node dressed
          with it falls back to the model&apos;s own material.
        </p>
      </Dialog>
    </div>
  )
}

/** The tile's second line - the two numbers that most define the look. */
function describeMaterial(material: MaterialDto): string {
  const { roughness, metallic } = material.parameters
  const finish = metallic > 0.5 ? 'metal' : 'dielectric'
  return `${finish} · rough ${roughness.toFixed(2)}`
}
