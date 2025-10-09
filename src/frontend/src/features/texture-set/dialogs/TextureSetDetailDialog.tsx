import { useState, useEffect, useRef } from 'react'
import { Dialog } from 'primereact/dialog'
import { TabView, TabPanel } from 'primereact/tabview'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { TextureSetDto, TextureDto, ModelSummaryDto } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import AddTextureToPackDialog from './AddTextureToPackDialog'
import ModelAssociationDialog from './ModelAssociationDialog'
import PackHeader from './PackHeader'
import PackStats from './PackStats'
import TexturesTable from './TexturesTable'
import ModelsTable from './ModelsTable'
import { getTextureTypeLabel } from '../../../utils/textureTypeUtils'
import './dialogs.css'

interface TextureSetDetailDialogProps {
  visible: boolean
  textureSet: TextureSetDto
  onHide: () => void
  onPackUpdated: () => void
}

function TextureSetDetailDialog({
  visible,
  textureSet,
  onHide,
  onPackUpdated,
}: TextureSetDetailDialogProps) {
  const [currentPack, setCurrentPack] = useState<TextureSetDto>(textureSet)
  const [updating, setUpdating] = useState(false)
  const [showAddTextureDialog, setShowAddTextureDialog] = useState(false)
  const [showModelAssociationDialog, setShowModelAssociationDialog] =
    useState(false)
  const toast = useRef<Toast>(null)
  const textureSetsApi = useTextureSets()

  useEffect(() => {
    setCurrentPack(textureSet)
  }, [textureSet])

  const handleUpdateName = async (newName: string) => {
    try {
      setUpdating(true)
      await textureSetsApi.updateTextureSet(currentPack.id, {
        name: newName,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set updated successfully',
        life: 3000,
      })

      onPackUpdated()
    } catch (error) {
      console.error('Failed to update texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update texture set',
        life: 3000,
      })
      throw error // Re-throw to let the child component handle UI state
    } finally {
      setUpdating(false)
    }
  }

  const handleRemoveTexture = (texture: TextureDto) => {
    confirmDialog({
      message: `Are you sure you want to remove the ${getTextureTypeLabel(texture.textureType)} texture "${texture.fileName || 'Unknown'}" from this pack?`,
      header: 'Remove Texture',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await textureSetsApi.removeTextureFromPack(
            currentPack.id,
            texture.id
          )
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Texture removed from pack',
            life: 3000,
          })
          onPackUpdated()
        } catch (error) {
          console.error('Failed to remove texture:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to remove texture from pack',
            life: 3000,
          })
        }
      },
    })
  }

  const handleDisassociateModel = (model: ModelSummaryDto) => {
    confirmDialog({
      message: `Are you sure you want to disassociate the model "${model.name}" from this texture set?`,
      header: 'Disassociate Model',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await textureSetsApi.disassociateTextureSetFromModel(
            currentPack.id,
            model.id
          )
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Model disassociated from pack',
            life: 3000,
          })
          onPackUpdated()
        } catch (error) {
          console.error('Failed to disassociate model:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to disassociate model from pack',
            life: 3000,
          })
        }
      },
    })
  }

  const dialogFooter = (
    <div>
      <Button
        label="Close"
        icon="pi pi-times"
        className="p-button-text"
        onClick={onHide}
      />
    </div>
  )

  return (
    <>
      <Dialog
        header={`Texture Set: ${currentPack.name}`}
        visible={visible}
        onHide={onHide}
        footer={dialogFooter}
        modal
        maximizable
        style={{ width: '80vw', height: '80vh' }}
        className="texture-set-detail-dialog"
      >
        <Toast ref={toast} />
        <ConfirmDialog />

        <div className="pack-overview">
          <div className="pack-info">
            <PackHeader
              textureSet={currentPack}
              onNameUpdate={handleUpdateName}
              updating={updating}
            />
            <PackStats textureSet={currentPack} />
          </div>
        </div>

        <TabView className="pack-detail-tabs">
          <TabPanel header="Textures" leftIcon="pi pi-image">
            <TexturesTable
              textures={currentPack.textures}
              onRemoveTexture={handleRemoveTexture}
              onAddTexture={() => setShowAddTextureDialog(true)}
            />
          </TabPanel>

          <TabPanel header="Models" leftIcon="pi pi-box">
            <ModelsTable
              models={currentPack.associatedModels}
              onDisassociateModel={handleDisassociateModel}
              onManageAssociations={() => setShowModelAssociationDialog(true)}
            />
          </TabPanel>
        </TabView>
      </Dialog>

      {showAddTextureDialog && (
        <AddTextureToPackDialog
          visible={showAddTextureDialog}
          textureSet={currentPack}
          onHide={() => setShowAddTextureDialog(false)}
          onTextureAdded={() => {
            setShowAddTextureDialog(false)
            onPackUpdated()
          }}
        />
      )}

      {showModelAssociationDialog && (
        <ModelAssociationDialog
          visible={showModelAssociationDialog}
          textureSet={currentPack}
          onHide={() => setShowModelAssociationDialog(false)}
          onAssociationsChanged={() => {
            setShowModelAssociationDialog(false)
            onPackUpdated()
          }}
        />
      )}
    </>
  )
}

export default TextureSetDetailDialog
