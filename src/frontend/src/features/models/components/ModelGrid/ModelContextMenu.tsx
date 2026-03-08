import { ContextMenu } from 'primereact/contextmenu'
import { type MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'

import { softDeleteModel } from '@/features/models/api/modelApi'
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

export interface ModelContextMenuHandle {
  show: (event: React.MouseEvent, model: Model) => void
}

interface ModelContextMenuComponentProps {
  onModelRecycled?: (modelId: number) => void
  onModelRemoved?: (modelId: number) => void
  hideAddToPack?: boolean
  hideAddToProject?: boolean
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
      onModelRecycled,
      onModelRemoved,
      hideAddToPack = false,
      hideAddToProject = false,
      packId,
      projectId,
      pathPrefix,
    },
    ref
  ) => {
    const [selectedModel, setSelectedModel] = useState<Model | null>(null)
    const [showPackDialog, setShowPackDialog] = useState(false)
    const [showProjectDialog, setShowProjectDialog] = useState(false)
    const contextMenu = useRef<ContextMenu>(null)
    const toast = useRef<Toast>(null)

    useImperativeHandle(ref, () => ({
      show: (event: React.MouseEvent, model: Model) => {
        event.preventDefault()
        setSelectedModel(model)
        contextMenu.current?.show(event as unknown as React.SyntheticEvent)
      },
    }))

    const getModelName = (model: Model) => {
      if (model.name) return model.name
      if (model.files && model.files.length > 0)
        return model.files[0].originalFileName
      return `Model ${model.id}`
    }

    const handleShowInFolder = async () => {
      if (!selectedModel) return
      const modelName = getModelName(selectedModel)
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
      if (!selectedModel) return
      const modelName = getModelName(selectedModel)
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

    const handleAddToPack = async (packId: number) => {
      if (!selectedModel) return
      try {
        await addModelToPack(packId, Number(selectedModel.id))
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Model added to pack',
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

    const handleAddToProject = async (projectId: number) => {
      if (!selectedModel) return
      try {
        await addModelToProject(projectId, Number(selectedModel.id))
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Model added to project',
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
      if (!selectedModel) return
      try {
        await softDeleteModel(Number(selectedModel.id))
        toast.current?.show({
          severity: 'success',
          summary: 'Recycled',
          detail: 'Model moved to recycled files',
          life: 3000,
        })
        if (onModelRecycled) {
          onModelRecycled(Number(selectedModel.id))
        }
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
      if (!selectedModel || !packId) return
      try {
        await removeModelFromPack(packId, Number(selectedModel.id))
        toast.current?.show({
          severity: 'success',
          summary: 'Removed',
          detail: 'Model removed from pack',
          life: 3000,
        })
        onModelRemoved?.(Number(selectedModel.id))
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
      if (!selectedModel || !projectId) return
      try {
        await removeModelFromProject(projectId, Number(selectedModel.id))
        toast.current?.show({
          severity: 'success',
          summary: 'Removed',
          detail: 'Model removed from project',
          life: 3000,
        })
        onModelRemoved?.(Number(selectedModel.id))
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

    const contextMenuItems: MenuItem[] = [
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
              label: 'Add to pack',
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
              label: 'Add to project',
              icon: 'pi pi-folder',
              command: () => {
                setShowProjectDialog(true)
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

    return (
      <>
        <Toast ref={toast} />
        <ContextMenu model={contextMenuItems} ref={contextMenu} />

        <SelectPackDialog
          visible={showPackDialog}
          onHide={() => setShowPackDialog(false)}
          onSelect={handleAddToPack}
        />

        <SelectProjectDialog
          visible={showProjectDialog}
          onHide={() => setShowProjectDialog(false)}
          onSelect={handleAddToProject}
        />
      </>
    )
  }
)

ModelContextMenu.displayName = 'ModelContextMenu'
