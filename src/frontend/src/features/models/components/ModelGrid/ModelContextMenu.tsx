import { useQueryClient } from '@tanstack/react-query'
import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  softDeleteModel,
  updateModelTags,
} from '@/features/models/api/modelApi'
import {
  addModelToPack,
  removeModelFromPack,
} from '@/features/pack/api/packApi'
import {
  addModelToProject,
  removeModelFromProject,
} from '@/features/project/api/projectApi'
import { SelectPackDialog } from '@/shared/components/dialogs/SelectPackDialog'
import { SelectProjectDialog } from '@/shared/components/dialogs/SelectProjectDialog'
import { type Model } from '@/utils/fileUtils'
import {
  copyPathToClipboard,
  getCopyPathSuccessMessage,
  openInFileExplorer,
} from '@/utils/webdavUtils'

import { ChangeModelCategoryDialog } from './ChangeModelCategoryDialog'

export interface ModelContextMenuHandle {
  show: (
    event: React.MouseEvent,
    options: {
      models: Model[]
      mode?: 'single' | 'bulk'
    }
  ) => void
}

interface ModelContextMenuComponentProps {
  hideAddToPack?: boolean
  hideAddToProject?: boolean
  allowCategoryChange?: boolean
  categories?: Array<{
    id: number
    name: string
    description?: string
    parentId?: number | null
    path: string
  }>
  /** When set, shows "Remove from pack" context menu option */
  packId?: number
  /** When set, shows "Remove from project" context menu option */
  projectId?: number
  /** Optional prefix for the copy path (e.g. "ProjectName/TextureSetName") */
  pathPrefix?: string
}

export const ModelContextMenu = forwardRef<
  ModelContextMenuHandle,
  ModelContextMenuComponentProps
>(
  (
    {
      hideAddToPack = false,
      hideAddToProject = false,
      allowCategoryChange = false,
      categories = [],
      packId,
      projectId,
      pathPrefix,
    },
    ref
  ) => {
    const queryClient = useQueryClient()
    const [selectedModels, setSelectedModels] = useState<Model[]>([])
    const [menuMode, setMenuMode] = useState<'single' | 'bulk'>('single')
    const [showPackDialog, setShowPackDialog] = useState(false)
    const [showProjectDialog, setShowProjectDialog] = useState(false)
    const [showCategoryDialog, setShowCategoryDialog] = useState(false)
    const contextMenu = useRef<ContextMenu>(null)
    const toast = useRef<Toast>(null)

    const selectedCount = selectedModels.length
    const primaryModel = selectedModels[0] ?? null
    const isBulkMenu = menuMode === 'bulk'
    const selectedCountLabel = `${selectedCount} model${selectedCount === 1 ? '' : 's'}`
    const titleLabel = `Selected ${selectedCountLabel}`

    useImperativeHandle(ref, () => ({
      show: (event: React.MouseEvent, options) => {
        event.preventDefault()
        setSelectedModels(options.models)
        setMenuMode(
          options.mode ?? (options.models.length > 1 ? 'bulk' : 'single')
        )
        contextMenu.current?.show(event as unknown as React.SyntheticEvent)
      },
    }))

    const getModelName = (model: Model) => {
      if (model.name) return model.name
      if (model.files && model.files.length > 0)
        return model.files[0].originalFileName
      return `Model ${model.id}`
    }

    const invalidateRelatedQueries = async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['models'] }),
        queryClient.invalidateQueries({ queryKey: ['packs'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        ...selectedModels.map(model =>
          queryClient.invalidateQueries({
            queryKey: ['models', 'detail', String(model.id)],
          })
        ),
      ])
    }

    const handleShowInFolder = async () => {
      if (!primaryModel) return
      const modelName = getModelName(primaryModel)
      const virtualPath = pathPrefix
        ? `${pathPrefix}/${modelName}`
        : `Models/${modelName}`
      const result = await openInFileExplorer(virtualPath)
      toast.current?.show({
        severity: result.success ? 'info' : 'warn',
        summary: result.success ? 'Opening' : 'Note',
        detail: result.message,
        life: 4000,
      })
    }

    const handleCopyPath = async () => {
      if (!primaryModel) return
      const modelName = getModelName(primaryModel)
      const virtualPath = pathPrefix
        ? `${pathPrefix}/${modelName}`
        : `Models/${modelName}`
      const result = await copyPathToClipboard(virtualPath)
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
      if (selectedModels.length === 0) return
      try {
        for (const model of selectedModels) {
          await addModelToPack(selectedPackId, Number(model.id))
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
        console.error('Failed to add model to pack:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to add model to pack',
          life: 3000,
        })
      }
    }

    const handleAddToProject = async (selectedProjectId: number) => {
      if (selectedModels.length === 0) return
      try {
        for (const model of selectedModels) {
          await addModelToProject(selectedProjectId, Number(model.id))
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
        console.error('Failed to add model to project:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to add model to project',
          life: 3000,
        })
      }
    }

    const handleSoftDelete = async () => {
      if (selectedModels.length === 0) return
      try {
        for (const model of selectedModels) {
          await softDeleteModel(Number(model.id))
        }
        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Recycled',
          detail: `${selectedCountLabel} moved to recycled files`,
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to recycle model:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to recycle model',
          life: 3000,
        })
      }
    }

    const handleRemoveFromPack = async () => {
      if (!primaryModel || !packId) return
      try {
        await removeModelFromPack(packId, Number(primaryModel.id))
        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Removed',
          detail: 'Model removed from pack',
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to remove model from pack:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to remove model from pack',
          life: 3000,
        })
      }
    }

    const handleRemoveFromProject = async () => {
      if (!primaryModel || !projectId) return
      try {
        await removeModelFromProject(projectId, Number(primaryModel.id))
        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Removed',
          detail: 'Model removed from project',
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to remove model from project:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to remove model from project',
          life: 3000,
        })
      }
    }

    const handleChangeCategory = async (categoryId: number) => {
      if (selectedModels.length === 0) {
        return
      }

      try {
        for (const model of selectedModels) {
          await updateModelTags(
            String(model.id),
            model.tags ?? [],
            model.description ?? '',
            categoryId
          )
        }
        await invalidateRelatedQueries()
        toast.current?.show({
          severity: 'success',
          summary: 'Updated',
          detail: `Category changed for ${selectedCountLabel}`,
          life: 3000,
        })
      } catch (error) {
        console.error('Failed to change model category:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to change model category',
          life: 3000,
        })
        throw error
      }
    }

    const contextMenuItems = useMemo<MenuItem[]>(() => {
      if (isBulkMenu) {
        return [
          {
            disabled: true,
            template: () => (
              <div className="model-context-menu-title">{titleLabel}</div>
            ),
          },
          { separator: true },
          {
            label: `Recycle ${selectedCountLabel}`,
            icon: 'pi pi-trash',
            command: () => handleSoftDelete(),
          },
          {
            label: 'Change category',
            icon: 'pi pi-sitemap',
            command: () => {
              setShowCategoryDialog(true)
            },
          },
          {
            label: 'Add to Project',
            icon: 'pi pi-folder',
            command: () => {
              setShowProjectDialog(true)
            },
          },
          {
            label: 'Add to Pack',
            icon: 'pi pi-box',
            command: () => {
              setShowPackDialog(true)
            },
          },
        ]
      }

      return [
        {
          label: 'Show in Folder',
          icon: 'pi pi-folder-open',
          command: () => handleShowInFolder(),
        },
        {
          label: 'Copy Folder Path',
          icon: 'pi pi-copy',
          command: () => handleCopyPath(),
        },
        { separator: true },
        ...(!hideAddToPack
          ? [
              {
                label: 'Add to Pack',
                icon: 'pi pi-box',
                command: () => {
                  setShowPackDialog(true)
                },
              },
            ]
          : []),
        ...(!hideAddToProject
          ? [
              {
                label: 'Add to Project',
                icon: 'pi pi-folder',
                command: () => {
                  setShowProjectDialog(true)
                },
              },
            ]
          : []),
        ...(allowCategoryChange
          ? [
              {
                label: 'Change category',
                icon: 'pi pi-sitemap',
                command: () => {
                  setShowCategoryDialog(true)
                },
              },
            ]
          : []),
        ...(packId
          ? [
              {
                label: 'Remove from pack',
                icon: 'pi pi-times',
                command: () => handleRemoveFromPack(),
              },
            ]
          : []),
        ...(projectId
          ? [
              {
                label: 'Remove from project',
                icon: 'pi pi-times',
                command: () => handleRemoveFromProject(),
              },
            ]
          : []),
        {
          label: 'Recycle',
          icon: 'pi pi-trash',
          command: () => handleSoftDelete(),
        },
      ]
    }, [
      allowCategoryChange,
      hideAddToPack,
      hideAddToProject,
      isBulkMenu,
      packId,
      projectId,
      selectedCountLabel,
      titleLabel,
    ])

    return (
      <>
        <Toast ref={toast} />
        <ContextMenu model={contextMenuItems} ref={contextMenu} />

        <ChangeModelCategoryDialog
          visible={showCategoryDialog}
          categories={categories}
          selectedCount={selectedCount}
          initialCategoryId={
            primaryModel?.categoryId ?? primaryModel?.category?.id ?? null
          }
          onHide={() => setShowCategoryDialog(false)}
          onConfirm={handleChangeCategory}
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
      </>
    )
  }
)

ModelContextMenu.displayName = 'ModelContextMenu'
