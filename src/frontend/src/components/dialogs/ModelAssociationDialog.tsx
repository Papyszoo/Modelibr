import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Checkbox } from 'primereact/checkbox'
import { TexturePackDto, Model } from '../../types'
import { useTexturePacks } from '../../hooks/useTexturePacks'
import './dialogs.css'

interface ModelAssociationDialogProps {
  visible: boolean
  texturePack: TexturePackDto
  onHide: () => void
  onAssociationsChanged: () => void
}

interface ModelAssociation {
  model: Model
  isAssociated: boolean
  originallyAssociated: boolean
}

function ModelAssociationDialog({
  visible,
  texturePack,
  onHide,
  onAssociationsChanged,
}: ModelAssociationDialogProps) {
  const [modelAssociations, setModelAssociations] = useState<
    ModelAssociation[]
  >([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useRef<Toast>(null)
  const texturePacksApi = useTexturePacks()

  useEffect(() => {
    if (visible) {
      loadModels()
    }
  }, [visible, loadModels])

  const loadModels = useCallback(async () => {
    try {
      setLoading(true)
      const allModels = await texturePacksApi.getModels()

      // Get currently associated model IDs
      const associatedModelIds = new Set(
        texturePack.associatedModels.map(m => m.id)
      )

      // Create association objects
      const associations: ModelAssociation[] = allModels.map(model => ({
        model,
        isAssociated: associatedModelIds.has(parseInt(model.id)),
        originallyAssociated: associatedModelIds.has(parseInt(model.id)),
      }))

      setModelAssociations(associations)
    } catch (error) {
      console.error('Failed to load models:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load models',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [texturePacksApi, texturePack.associatedModels])

  const handleToggleAssociation = (modelId: string, isAssociated: boolean) => {
    setModelAssociations(prev =>
      prev.map(assoc =>
        assoc.model.id === modelId ? { ...assoc, isAssociated } : assoc
      )
    )
  }

  const getChanges = () => {
    const toAssociate: Model[] = []
    const toDisassociate: Model[] = []

    modelAssociations.forEach(assoc => {
      if (assoc.isAssociated && !assoc.originallyAssociated) {
        toAssociate.push(assoc.model)
      } else if (!assoc.isAssociated && assoc.originallyAssociated) {
        toDisassociate.push(assoc.model)
      }
    })

    return { toAssociate, toDisassociate }
  }

  const hasChanges = () => {
    const { toAssociate, toDisassociate } = getChanges()
    return toAssociate.length > 0 || toDisassociate.length > 0
  }

  const handleSave = async () => {
    const { toAssociate, toDisassociate } = getChanges()

    if (!hasChanges()) {
      onHide()
      return
    }

    try {
      setSaving(true)

      // Process associations
      for (const model of toAssociate) {
        await texturePacksApi.associateTexturePackWithModel(
          texturePack.id,
          parseInt(model.id)
        )
      }

      // Process disassociations
      for (const model of toDisassociate) {
        await texturePacksApi.disassociateTexturePackFromModel(
          texturePack.id,
          parseInt(model.id)
        )
      }

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Model associations updated successfully',
        life: 3000,
      })

      onAssociationsChanged()
    } catch (error) {
      console.error('Failed to update model associations:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update model associations',
        life: 3000,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset changes
    setModelAssociations(prev =>
      prev.map(assoc => ({
        ...assoc,
        isAssociated: assoc.originallyAssociated,
      }))
    )
    onHide()
  }

  const associationBodyTemplate = (rowData: ModelAssociation) => {
    return (
      <Checkbox
        inputId={`model-${rowData.model.id}`}
        checked={rowData.isAssociated}
        onChange={e =>
          handleToggleAssociation(rowData.model.id, e.checked || false)
        }
      />
    )
  }

  const statusBodyTemplate = (rowData: ModelAssociation) => {
    if (rowData.isAssociated && !rowData.originallyAssociated) {
      return <span className="status-badge status-new">Will Associate</span>
    } else if (!rowData.isAssociated && rowData.originallyAssociated) {
      return <span className="status-badge status-remove">Will Remove</span>
    } else if (rowData.isAssociated) {
      return (
        <span className="status-badge status-current">
          Currently Associated
        </span>
      )
    }
    return <span className="status-badge status-none">Not Associated</span>
  }

  const fileCountBodyTemplate = (rowData: ModelAssociation) => {
    return `${rowData.model.files.length} file${rowData.model.files.length !== 1 ? 's' : ''}`
  }

  const dialogFooter = (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        className="p-button-text"
        onClick={handleCancel}
        disabled={saving}
      />
      <Button
        label="Save Changes"
        icon="pi pi-check"
        onClick={handleSave}
        loading={saving}
        disabled={!hasChanges() || saving}
      />
    </div>
  )

  return (
    <Dialog
      header={`Manage Model Associations - "${texturePack.name}"`}
      visible={visible}
      onHide={handleCancel}
      footer={dialogFooter}
      modal
      maximizable
      style={{ width: '80vw', maxWidth: '1000px', height: '70vh' }}
      className="model-association-dialog"
    >
      <Toast ref={toast} />

      <div className="association-instructions">
        <p>
          Select which models should be associated with this texture pack.
          Associated models can use the textures from this pack for rendering.
        </p>
      </div>

      <DataTable
        value={modelAssociations}
        loading={loading}
        emptyMessage="No models available"
        paginator
        rows={15}
        responsiveLayout="scroll"
        stripedRows
        showGridlines
        className="model-association-table"
      >
        <Column
          field="isAssociated"
          header="Associate"
          body={associationBodyTemplate}
          style={{ width: '100px', textAlign: 'center' }}
        />
        <Column
          field="model.name"
          header="Model Name"
          sortable
          style={{ minWidth: '200px' }}
        />
        <Column
          header="Files"
          body={fileCountBodyTemplate}
          style={{ minWidth: '100px' }}
        />
        <Column
          header="Status"
          body={statusBodyTemplate}
          style={{ minWidth: '150px' }}
        />
      </DataTable>

      {hasChanges() && (
        <div className="changes-summary">
          <div className="p-message p-message-info">
            <div className="p-message-wrapper">
              <div className="p-message-icon">
                <i className="pi pi-info-circle"></i>
              </div>
              <div className="p-message-text">
                You have unsaved changes. Click "Save Changes" to apply them.
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}

export default ModelAssociationDialog
