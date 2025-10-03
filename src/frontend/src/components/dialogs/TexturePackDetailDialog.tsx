import { useState, useEffect, useRef } from 'react'
import { Dialog } from 'primereact/dialog'
import { TabView, TabPanel } from 'primereact/tabview'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { TexturePackDto, TextureDto, ModelSummaryDto } from '../../types'
import { useTexturePacks } from '../../hooks/useTexturePacks'
import AddTextureToPackDialog from './AddTextureToPackDialog'
import ModelAssociationDialog from './ModelAssociationDialog'
import PackHeader from './texture-pack-detail/PackHeader'
import PackStats from './texture-pack-detail/PackStats'
import TexturesTable from './texture-pack-detail/TexturesTable'
import ModelsTable from './texture-pack-detail/ModelsTable'
import { getTextureTypeLabel } from '../../utils/textureTypeUtils'
import './dialogs.css'

interface TexturePackDetailDialogProps {
  visible: boolean
  texturePack: TexturePackDto
  onHide: () => void
  onPackUpdated: () => void
}

function TexturePackDetailDialog({
  visible,
  texturePack,
  onHide,
  onPackUpdated,
}: TexturePackDetailDialogProps) {
  const [currentPack, setCurrentPack] = useState<TexturePackDto>(texturePack)
  const [updating, setUpdating] = useState(false)
  const [showAddTextureDialog, setShowAddTextureDialog] = useState(false)
  const [showModelAssociationDialog, setShowModelAssociationDialog] =
    useState(false)
  const toast = useRef<Toast>(null)
  const texturePacksApi = useTexturePacks()

  useEffect(() => {
    setCurrentPack(texturePack)
  }, [texturePack])

  const handleUpdateName = async (newName: string) => {
    try {
      setUpdating(true)
      await texturePacksApi.updateTexturePack(currentPack.id, {
        name: newName,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture pack updated successfully',
        life: 3000,
      })

      onPackUpdated()
    } catch (error) {
      console.error('Failed to update texture pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update texture pack',
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
          await texturePacksApi.removeTextureFromPack(
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
      message: `Are you sure you want to disassociate the model "${model.name}" from this texture pack?`,
      header: 'Disassociate Model',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await texturePacksApi.disassociateTexturePackFromModel(
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
        header={`Texture Pack: ${currentPack.name}`}
        visible={visible}
        onHide={onHide}
        footer={dialogFooter}
        modal
        maximizable
        style={{ width: '80vw', height: '80vh' }}
        className="texture-pack-detail-dialog"
      >
        <Toast ref={toast} />
        <ConfirmDialog />

        <div className="pack-overview">
          <div className="pack-info">
            <PackHeader
              texturePack={currentPack}
              onNameUpdate={handleUpdateName}
              updating={updating}
            />
            <PackStats texturePack={currentPack} />
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
          texturePack={currentPack}
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
          texturePack={currentPack}
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

export default TexturePackDetailDialog
