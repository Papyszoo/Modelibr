import { useState, useRef, useImperativeHandle, forwardRef } from 'react'
import { Dialog } from 'primereact/dialog'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { Toast } from 'primereact/toast'
import { Model } from '../../../../utils/fileUtils'
import { PackDto, ProjectDto } from '../../../../types'
import ApiClient from '../../../../services/ApiClient'
import {
  openInFileExplorer,
  copyPathToClipboard,
  getCopyPathSuccessMessage,
} from '../../../../utils/webdavUtils'

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
  packs: PackDto[]
  projects: ProjectDto[]
}

const ModelContextMenu = forwardRef<
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
      packs,
      projects,
    },
    ref
  ) => {
    const [contextMenuPacks, setContextMenuPacks] = useState<PackDto[]>(packs)
    const [contextMenuProjects, setContextMenuProjects] =
      useState<ProjectDto[]>(projects)
    const [selectedModel, setSelectedModel] = useState<Model | null>(null)
    const [showPackDialog, setShowPackDialog] = useState(false)
    const [showProjectDialog, setShowProjectDialog] = useState(false)
    const contextMenu = useRef<ContextMenu>(null)
    const toast = useRef<Toast>(null)

    // Keep in sync with parent props
    useState(() => {
      setContextMenuPacks(packs)
      setContextMenuProjects(projects)
    })

    useImperativeHandle(ref, () => ({
      show: (event: React.MouseEvent, model: Model) => {
        event.preventDefault()
        setSelectedModel(model)
        contextMenu.current?.show(event as unknown as React.SyntheticEvent)
      },
    }))

    const loadPacks = async () => {
      try {
        const data = await ApiClient.getAllPacks()
        setContextMenuPacks(data)
      } catch (error) {
        console.error('Failed to load packs:', error)
      }
    }

    const loadProjects = async () => {
      try {
        const data = await ApiClient.getAllProjects()
        setContextMenuProjects(data)
      } catch (error) {
        console.error('Failed to load projects:', error)
      }
    }

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
        await ApiClient.addModelToPack(packId, Number(selectedModel.id))
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
        await ApiClient.addModelToProject(projectId, Number(selectedModel.id))
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
        await ApiClient.softDeleteModel(Number(selectedModel.id))
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
        await ApiClient.removeModelFromPack(packId, Number(selectedModel.id))
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
        await ApiClient.removeModelFromProject(
          projectId,
          Number(selectedModel.id)
        )
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
                loadPacks()
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
                loadProjects()
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

        {/* Add to Pack Dialog */}
        <Dialog
          header="Add to Pack"
          visible={showPackDialog}
          style={{ width: '500px' }}
          onHide={() => setShowPackDialog(false)}
        >
          <div className="pack-selection-dialog">
            <p>Select a pack to add this model to:</p>
            <div className="pack-select-list">
              {contextMenuPacks.map(pack => (
                <div
                  key={pack.id}
                  className="pack-select-item"
                  onClick={() => handleAddToPack(pack.id)}
                >
                  <i className="pi pi-box" />
                  <div className="pack-select-item-content">
                    <span className="pack-select-item-name">{pack.name}</span>
                    {pack.description && (
                      <span className="pack-select-item-description">
                        {pack.description}
                      </span>
                    )}
                  </div>
                  <i className="pi pi-chevron-right" />
                </div>
              ))}
            </div>
            {contextMenuPacks.length === 0 && (
              <div className="pack-select-no-packs">
                <i className="pi pi-inbox" />
                <p>No packs available. Create a pack first.</p>
              </div>
            )}
          </div>
        </Dialog>

        {/* Add to Project Dialog */}
        <Dialog
          header="Add to Project"
          visible={showProjectDialog}
          style={{ width: '500px' }}
          onHide={() => setShowProjectDialog(false)}
        >
          <div className="pack-selection-dialog">
            <p>Select a project to add this model to:</p>
            <div className="pack-select-list">
              {contextMenuProjects.map(project => (
                <div
                  key={project.id}
                  className="pack-select-item"
                  onClick={() => handleAddToProject(project.id)}
                >
                  <i className="pi pi-folder" />
                  <div className="pack-select-item-content">
                    <span className="pack-select-item-name">
                      {project.name}
                    </span>
                    {project.description && (
                      <span className="pack-select-item-description">
                        {project.description}
                      </span>
                    )}
                  </div>
                  <i className="pi pi-chevron-right" />
                </div>
              ))}
            </div>
            {contextMenuProjects.length === 0 && (
              <div className="pack-select-no-packs">
                <i className="pi pi-inbox" />
                <p>No projects available. Create a project first.</p>
              </div>
            )}
          </div>
        </Dialog>
      </>
    )
  }
)

ModelContextMenu.displayName = 'ModelContextMenu'

export default ModelContextMenu
