import { useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { ContextMenu } from 'primereact/contextmenu'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import {
  forwardRef,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent as ReactSyntheticEvent,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import {
  regenerateEnvironmentMapThumbnail,
  softDeleteEnvironmentMap,
  updateEnvironmentMap,
  updateEnvironmentMapMetadata,
} from '@/features/environment-map/api/environmentMapApi'
import {
  addEnvironmentMapToPack,
  removeEnvironmentMapFromPack,
} from '@/features/pack/api/packApi'
import {
  addEnvironmentMapToProject,
  removeEnvironmentMapFromProject,
} from '@/features/project/api/projectApi'
import { SelectPackDialog } from '@/shared/components/dialogs/SelectPackDialog'
import { SelectProjectDialog } from '@/shared/components/dialogs/SelectProjectDialog'
import {
  type EnvironmentMapCategoryDto,
  type EnvironmentMapDto,
  type ModelTagDto,
} from '@/types'
import {
  copyPathToClipboard,
  getCopyPathSuccessMessage,
  openInFileExplorer,
} from '@/utils/webdavUtils'

import { AddEnvironmentMapTagsDialog } from './AddEnvironmentMapTagsDialog'
import { ChangeEnvironmentMapCategoryDialog } from './ChangeEnvironmentMapCategoryDialog'

export interface EnvironmentMapContextMenuHandle {
  show: (
    event: ReactMouseEvent,
    options: {
      environmentMaps: EnvironmentMapDto[]
      mode?: 'single' | 'bulk'
    }
  ) => void
}

interface EnvironmentMapContextMenuProps {
  categories?: EnvironmentMapCategoryDto[]
  tags?: ModelTagDto[]
  packId?: number
  projectId?: number
  onManageCategories?: () => void
}

export const EnvironmentMapContextMenu = forwardRef<
  EnvironmentMapContextMenuHandle,
  EnvironmentMapContextMenuProps
>(
  (
    { categories = [], tags = [], packId, projectId, onManageCategories },
    ref
  ) => {
    const queryClient = useQueryClient()
    const [selectedEnvironmentMaps, setSelectedEnvironmentMaps] = useState<
      EnvironmentMapDto[]
    >([])
    const [menuMode, setMenuMode] = useState<'single' | 'bulk'>('single')
    const [showPackDialog, setShowPackDialog] = useState(false)
    const [showProjectDialog, setShowProjectDialog] = useState(false)
    const [showCategoryDialog, setShowCategoryDialog] = useState(false)
    const [showTagsDialog, setShowTagsDialog] = useState(false)
    const [showRenameDialog, setShowRenameDialog] = useState(false)
    const [renameValue, setRenameValue] = useState('')
    const [isRenaming, setIsRenaming] = useState(false)
    const contextMenu = useRef<ContextMenu>(null)
    const toast = useRef<Toast>(null)

    const selectedCount = selectedEnvironmentMaps.length
    const primaryEnvironmentMap = selectedEnvironmentMaps[0] ?? null
    const isBulkMenu = menuMode === 'bulk'
    const selectedCountLabel = `${selectedCount} environment map${selectedCount === 1 ? '' : 's'}`
    const titleLabel = `Selected ${selectedCountLabel}`

    useImperativeHandle(ref, () => ({
      show: (event, options) => {
        event.preventDefault()
        setSelectedEnvironmentMaps(options.environmentMaps)
        setMenuMode(
          options.mode ??
            (options.environmentMaps.length > 1 ? 'bulk' : 'single')
        )
        setRenameValue(options.environmentMaps[0]?.name ?? '')
        contextMenu.current?.show(event as unknown as ReactSyntheticEvent)
      },
    }))

    const invalidateRelatedQueries = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['environmentMaps'] }),
        queryClient.invalidateQueries({ queryKey: ['packs'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['model-tags'] }),
        ...selectedEnvironmentMaps.map(environmentMap =>
          queryClient.invalidateQueries({
            queryKey: ['environmentMaps', 'detail', environmentMap.id],
          })
        ),
      ])
    }

    const handleShowInFolder = async () => {
      if (!primaryEnvironmentMap) return

      const result = await openInFileExplorer(
        `EnvironmentMaps/${primaryEnvironmentMap.name}`
      )

      toast.current?.show({
        severity: result.success ? 'info' : 'warn',
        summary: result.success ? 'Opening' : 'Note',
        detail: result.message,
        life: 4000,
      })
    }

    const handleCopyPath = async () => {
      if (!primaryEnvironmentMap) return

      const result = await copyPathToClipboard(
        `EnvironmentMaps/${primaryEnvironmentMap.name}`
      )

      toast.current?.show({
        severity: result.success ? 'success' : 'error',
        summary: result.success ? 'Copied' : 'Failed',
        detail: result.success
          ? getCopyPathSuccessMessage()
          : 'Failed to copy path to clipboard',
        life: 5000,
      })
    }

    const handleAddToPack = async (selectedPackId: number) => {
      if (selectedEnvironmentMaps.length === 0) return

      try {
        for (const environmentMap of selectedEnvironmentMaps) {
          await addEnvironmentMapToPack(selectedPackId, environmentMap.id)
        }

        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `${selectedCountLabel} added to pack`,
          life: 3000,
        })
        setShowPackDialog(false)
      } catch (error) {
        console.error('Failed to add environment map to pack:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to add environment map to pack',
          life: 3000,
        })
      }
    }

    const handleAddToProject = async (selectedProjectId: number) => {
      if (selectedEnvironmentMaps.length === 0) return

      try {
        for (const environmentMap of selectedEnvironmentMaps) {
          await addEnvironmentMapToProject(selectedProjectId, environmentMap.id)
        }

        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `${selectedCountLabel} added to project`,
          life: 3000,
        })
        setShowProjectDialog(false)
      } catch (error) {
        console.error('Failed to add environment map to project:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to add environment map to project',
          life: 3000,
        })
      }
    }

    const handleRemoveFromPack = async () => {
      if (!primaryEnvironmentMap || !packId) return

      try {
        await removeEnvironmentMapFromPack(packId, primaryEnvironmentMap.id)
        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Removed',
          detail: 'Environment map removed from pack',
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to remove environment map from pack:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to remove environment map from pack',
          life: 3000,
        })
      }
    }

    const handleRemoveFromProject = async () => {
      if (!primaryEnvironmentMap || !projectId) return

      try {
        await removeEnvironmentMapFromProject(
          projectId,
          primaryEnvironmentMap.id
        )
        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Removed',
          detail: 'Environment map removed from project',
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to remove environment map from project:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to remove environment map from project',
          life: 3000,
        })
      }
    }

    const handleRecycle = async () => {
      if (selectedEnvironmentMaps.length === 0) {
        return
      }

      try {
        for (const environmentMap of selectedEnvironmentMaps) {
          await softDeleteEnvironmentMap(environmentMap.id)
        }

        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Recycled',
          detail: `${selectedCountLabel} moved to recycled files`,
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to recycle environment map:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to recycle environment map',
          life: 3000,
        })
      }
    }

    const handleRegenerateThumbnail = async () => {
      if (selectedEnvironmentMaps.length === 0) {
        return
      }

      try {
        for (const environmentMap of selectedEnvironmentMaps) {
          await regenerateEnvironmentMapThumbnail(
            environmentMap.id,
            environmentMap.previewVariantId ?? undefined
          )
        }

        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Queued',
          detail:
            selectedEnvironmentMaps.length === 1
              ? 'Thumbnail regeneration queued.'
              : `Thumbnail regeneration queued for ${selectedCountLabel}.`,
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to regenerate environment map thumbnail:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to regenerate thumbnail',
          life: 3000,
        })
      }
    }

    const handleRename = async () => {
      if (!primaryEnvironmentMap) {
        return
      }

      const nextName = renameValue.trim()
      if (!nextName || nextName === primaryEnvironmentMap.name) {
        setShowRenameDialog(false)
        setRenameValue(primaryEnvironmentMap.name)
        return
      }

      setIsRenaming(true)
      try {
        await updateEnvironmentMap(primaryEnvironmentMap.id, {
          name: nextName,
          previewVariantId: primaryEnvironmentMap.previewVariantId ?? null,
        })

        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Renamed',
          detail: 'Environment map renamed successfully',
          life: 3000,
        })
        setShowRenameDialog(false)
      } catch (error) {
        console.error('Failed to rename environment map:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to rename environment map',
          life: 3000,
        })
      } finally {
        setIsRenaming(false)
      }
    }

    const handleChangeCategory = async (categoryId: number) => {
      if (selectedEnvironmentMaps.length === 0) {
        return
      }

      try {
        for (const environmentMap of selectedEnvironmentMaps) {
          await updateEnvironmentMapMetadata(environmentMap.id, {
            tags: environmentMap.tags ?? [],
            categoryId,
          })
        }

        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Updated',
          detail: `Category changed for ${selectedCountLabel}`,
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to change environment map category:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to change environment map category',
          life: 3000,
        })
        throw error
      }
    }

    const mergeTags = (existingTags: string[], tagsToAdd: string[]) => {
      const seen = new Set(existingTags.map(tag => tag.trim().toLowerCase()))
      const merged = [...existingTags]

      for (const tag of tagsToAdd) {
        const trimmedTag = tag.trim()
        const normalizedTag = trimmedTag.toLowerCase()

        if (!trimmedTag || seen.has(normalizedTag)) {
          continue
        }

        seen.add(normalizedTag)
        merged.push(trimmedTag)
      }

      return merged
    }

    const handleAddTags = async (tagsToAdd: string[]) => {
      if (selectedEnvironmentMaps.length === 0 || tagsToAdd.length === 0) {
        return
      }

      try {
        for (const environmentMap of selectedEnvironmentMaps) {
          await updateEnvironmentMapMetadata(environmentMap.id, {
            tags: mergeTags(environmentMap.tags ?? [], tagsToAdd),
            categoryId: environmentMap.categoryId ?? null,
          })
        }

        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Updated',
          detail: `Tags added to ${selectedCountLabel}`,
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to add environment map tags:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to add tags',
          life: 3000,
        })
        throw error
      }
    }

    const contextMenuItems: MenuItem[] = isBulkMenu
      ? [
          {
            disabled: true,
            template: () => (
              <div className="environment-map-context-menu-title">
                {titleLabel}
              </div>
            ),
          },
          { separator: true },
          {
            label: `Recycle ${selectedCountLabel}`,
            icon: 'pi pi-trash',
            command: () => void handleRecycle(),
          },
          {
            label: `Regenerate thumbnail${selectedCount === 1 ? '' : 's'}`,
            icon: 'pi pi-refresh',
            command: () => void handleRegenerateThumbnail(),
          },
          {
            label: 'Change category',
            icon: 'pi pi-sitemap',
            command: () => setShowCategoryDialog(true),
          },
          {
            label: 'Add tags',
            icon: 'pi pi-tags',
            command: () => setShowTagsDialog(true),
          },
          {
            label: 'Add to Project',
            icon: 'pi pi-folder',
            command: () => setShowProjectDialog(true),
          },
          {
            label: 'Add to Pack',
            icon: 'pi pi-box',
            command: () => setShowPackDialog(true),
          },
        ]
      : [
          {
            label: 'Show in Folder',
            icon: 'pi pi-folder-open',
            command: () => void handleShowInFolder(),
          },
          {
            label: 'Copy Folder Path',
            icon: 'pi pi-copy',
            command: () => void handleCopyPath(),
          },
          {
            label: 'Rename',
            icon: 'pi pi-pencil',
            command: () => {
              setRenameValue(primaryEnvironmentMap?.name ?? '')
              setShowRenameDialog(true)
            },
          },
          { separator: true },
          {
            label: 'Add to Pack',
            icon: 'pi pi-box',
            command: () => setShowPackDialog(true),
          },
          {
            label: 'Add to Project',
            icon: 'pi pi-folder',
            command: () => setShowProjectDialog(true),
          },
          {
            label: 'Change category',
            icon: 'pi pi-sitemap',
            command: () => setShowCategoryDialog(true),
          },
          {
            label: 'Add tags',
            icon: 'pi pi-tags',
            command: () => setShowTagsDialog(true),
          },
          {
            label: 'Regenerate thumbnail',
            icon: 'pi pi-refresh',
            command: () => void handleRegenerateThumbnail(),
          },
          ...(packId
            ? [
                {
                  label: 'Remove from pack',
                  icon: 'pi pi-times',
                  command: () => void handleRemoveFromPack(),
                },
              ]
            : []),
          ...(projectId
            ? [
                {
                  label: 'Remove from project',
                  icon: 'pi pi-times',
                  command: () => void handleRemoveFromProject(),
                },
              ]
            : []),
          {
            label: 'Recycle',
            icon: 'pi pi-trash',
            command: () => void handleRecycle(),
          },
        ]

    return (
      <>
        <Toast ref={toast} />
        <ContextMenu model={contextMenuItems} ref={contextMenu} />

        <ChangeEnvironmentMapCategoryDialog
          visible={showCategoryDialog}
          categories={categories}
          selectedCount={selectedCount}
          initialCategoryId={primaryEnvironmentMap?.categoryId ?? null}
          onHide={() => setShowCategoryDialog(false)}
          onManageCategories={onManageCategories}
          onConfirm={handleChangeCategory}
        />

        <AddEnvironmentMapTagsDialog
          visible={showTagsDialog}
          availableTags={tags}
          selectedCount={selectedCount}
          onHide={() => setShowTagsDialog(false)}
          onConfirm={handleAddTags}
        />

        <SelectPackDialog
          visible={showPackDialog}
          onHide={() => setShowPackDialog(false)}
          onSelect={handleAddToPack}
          header={
            isBulkMenu ? `Add ${selectedCountLabel} to Pack` : 'Add to Pack'
          }
        />

        <SelectProjectDialog
          visible={showProjectDialog}
          onHide={() => setShowProjectDialog(false)}
          onSelect={handleAddToProject}
          header={
            isBulkMenu
              ? `Add ${selectedCountLabel} to Project`
              : 'Add to Project'
          }
        />

        <Dialog
          header="Rename Environment Map"
          visible={showRenameDialog}
          style={{ width: 'min(480px, 92vw)' }}
          onHide={() => {
            if (isRenaming) {
              return
            }

            setShowRenameDialog(false)
            setRenameValue(primaryEnvironmentMap?.name ?? '')
          }}
          footer={
            <div className="environment-map-add-tags-actions">
              <Button
                label="Cancel"
                text
                onClick={() => {
                  setShowRenameDialog(false)
                  setRenameValue(primaryEnvironmentMap?.name ?? '')
                }}
                disabled={isRenaming}
              />
              <Button
                label="Rename"
                icon="pi pi-check"
                onClick={() => void handleRename()}
                loading={isRenaming}
                disabled={renameValue.trim().length === 0}
              />
            </div>
          }
        >
          <div className="environment-map-add-tags-dialog">
            <p className="environment-map-add-tags-description">
              Rename the selected environment map.
            </p>
            <InputText
              value={renameValue}
              onChange={event => setRenameValue(event.target.value)}
              placeholder="Environment map name"
              autoFocus
            />
          </div>
        </Dialog>
      </>
    )
  }
)

EnvironmentMapContextMenu.displayName = 'EnvironmentMapContextMenu'
