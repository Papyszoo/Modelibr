import './MaterialList.css'

import { useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import { type JSX, useCallback, useMemo, useRef, useState } from 'react'

import { restoreEntity } from '@/features/recycled-files/api/recycledApi'
import { ApiClientError } from '@/lib/apiBase'
import {
  EmptyState,
  ErrorState,
  ListHeader,
  LoadingState,
} from '@/shared/components'
import { AddTile, AssetGrid, AssetTile } from '@/shared/components/asset-tile'
import { UNDO_TOAST_LIFE_MS } from '@/shared/components/feedback/RecycleToastContent'
import {
  ListToolbar,
  ListToolbarActions,
  ListToolbarButton,
  ListToolbarPanel,
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
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [editing, setEditing] = useState<MaterialDto | null | undefined>(
    undefined
  )
  const [contextMaterial, setContextMaterial] = useState<MaterialDto | null>(
    null
  )
  const contextMenu = useRef<ContextMenu>(null)
  const toast = useRef<Toast>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useMaterialsQuery({
    options: search.trim() ? { search: search.trim() } : {},
  })
  const createMaterial = useCreateMaterialMutation()
  const updateMaterial = useUpdateMaterialMutation()
  const deleteMaterial = useDeleteMaterialMutation()

  const isEditorOpen = editing !== undefined
  const isSaving = createMaterial.isPending || updateMaterial.isPending

  /** Restores a material just moved to the recycle bin, from the Undo toast. */
  const handleUndoRecycle = useCallback(
    async (materialId: number) => {
      try {
        await restoreEntity('material', materialId)
        await queryClient.invalidateQueries({ queryKey: ['materials'] })
        await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
        toast.current?.show({
          severity: 'success',
          summary: 'Restored',
          detail: 'Material restored',
          life: 3000,
        })
      } catch (caught) {
        console.error('Failed to restore material:', caught)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to restore material',
          life: 3000,
        })
      }
    },
    [queryClient]
  )

  const handleRecycle = useCallback(async () => {
    if (!contextMaterial) return
    const { id, name } = contextMaterial
    try {
      await deleteMaterial.mutateAsync(id)
      await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
      toast.current?.show({
        severity: 'success',
        summary: 'Recycled',
        life: UNDO_TOAST_LIFE_MS,
        content: () => (
          <div className="material-recycle-toast">
            <i className="pi pi-trash" aria-hidden="true" />
            <span>{`${name} moved to recycled files`}</span>
            <button
              type="button"
              className="p-button p-button-text p-button-sm"
              data-testid="material-recycle-undo"
              onClick={() => void handleUndoRecycle(id)}
            >
              Undo
            </button>
          </div>
        ),
      })
    } catch (caught) {
      console.error('Failed to recycle material:', caught)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to recycle material',
        life: 3000,
      })
    }
  }, [contextMaterial, deleteMaterial, handleUndoRecycle, queryClient])

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
          // undefined means the document was left as it was, null means the
          // user removed every effect and the server should clear it.
          ...(value.effects === undefined
            ? {}
            : value.effects === null
              ? { clearEffects: true }
              : { effects: value.effects }),
        },
      })
    } else {
      await createMaterial.mutateAsync({
        name: value.name,
        description: value.description,
        parameters,
        ...(value.effects ? { effects: value.effects } : {}),
      })
    }

    setEditing(undefined)
    toast.current?.show({
      severity: 'success',
      summary: editing ? 'Material saved' : 'Material created',
      detail: editing
        ? `${value.name} was saved.`
        : `${value.name} was created.`,
      life: 2500,
    })
  }

  const materials = data?.materials ?? []

  // Same shape as the model card menu: card actions live behind a context
  // menu, never a right-click straight into a destructive confirm. A PBR
  // material is soft-deleted to the recycle bin (the backend maps DELETE to the
  // recycle command and the bin restores materials), so the destructive item is
  // Recycle, and the success toast offers Undo - exactly like model cards.
  const contextMenuItems = useMemo<MenuItem[]>(
    () => [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => setEditing(contextMaterial),
      },
      { separator: true },
      {
        label: 'Recycle',
        icon: 'pi pi-trash',
        command: () => void handleRecycle(),
      },
    ],
    [contextMaterial, handleRecycle]
  )

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
          <ListToolbarActions>
            <ListToolbarButton
              icon="pi pi-search"
              label="Search"
              active={isSearchOpen || search.trim().length > 0}
              onClick={() => setIsSearchOpen(open => !open)}
              ariaLabel="Search"
              ariaExpanded={isSearchOpen}
              ariaControls="material-list-search-panel"
            />
          </ListToolbarActions>
        </ListToolbarRow>

        <ListToolbarPanel id="material-list-search-panel" open={isSearchOpen}>
          <ListToolbarSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search materials..."
            autoFocus={isSearchOpen}
          />
        </ListToolbarPanel>
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
                setContextMaterial(material)
                contextMenu.current?.show(event)
              }}
              media={
                <MaterialSwatch
                  parameters={material.parameters}
                  material={material}
                />
              }
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
          onSubmit={handleSubmit}
        />
      )}

      <Toast ref={toast} />

      <ContextMenu
        ref={contextMenu}
        model={contextMenuItems}
        onHide={() => setContextMaterial(null)}
      />
    </div>
  )
}

/** The tile's second line - the two numbers that most define the look. */
function describeMaterial(material: MaterialDto): string {
  const { roughness, metallic } = material.parameters
  const finish = metallic > 0.5 ? 'metal' : 'dielectric'
  return `${finish} · rough ${roughness.toFixed(2)}`
}
