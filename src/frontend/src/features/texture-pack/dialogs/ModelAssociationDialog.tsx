import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { TexturePackDto, Model } from '../../../types'
import { useTexturePacks } from '../hooks/useTexturePacks'
import AssociationInstructions from './AssociationInstructions'
import ModelAssociationTable, {
  ModelAssociation,
} from './ModelAssociationTable'
import ChangesSummary from './ChangesSummary'
import ModelAssociationFooter from './ModelAssociationFooter'
import './dialogs.css'

interface ModelAssociationDialogProps {
  visible: boolean
  texturePack: TexturePackDto
  onHide: () => void
  onAssociationsChanged: () => void
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

  return (
    <Dialog
      header={`Manage Model Associations - "${texturePack.name}"`}
      visible={visible}
      onHide={handleCancel}
      footer={
        <ModelAssociationFooter
          onCancel={handleCancel}
          onSave={handleSave}
          saving={saving}
          hasChanges={hasChanges()}
        />
      }
      modal
      maximizable
      style={{ width: '80vw', maxWidth: '1000px', height: '70vh' }}
      className="model-association-dialog"
    >
      <Toast ref={toast} />

      <AssociationInstructions />

      <ModelAssociationTable
        modelAssociations={modelAssociations}
        loading={loading}
        onToggleAssociation={handleToggleAssociation}
      />

      <ChangesSummary hasChanges={hasChanges()} />
    </Dialog>
  )
}

export default ModelAssociationDialog
