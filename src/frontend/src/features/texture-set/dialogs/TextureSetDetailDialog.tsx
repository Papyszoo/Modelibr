import { useState, useEffect, useRef } from 'react'
import { Dialog } from 'primereact/dialog'
import { TabView, TabPanel } from 'primereact/tabview'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { TextureSetDto, TextureDto, ModelSummaryDto } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import AddTextureToSetDialog from './AddTextureToSetDialog'
import ModelAssociationDialog from './ModelAssociationDialog'
import SetHeader from './SetHeader'
import SetStats from './SetStats'
import TexturesTable from './TexturesTable'
import ModelsCardGrid from './ModelsCardGrid'
import { getTextureTypeLabel } from '../../../utils/textureTypeUtils'
import './dialogs.css'

interface TextureSetDetailDialogProps {
  visible: boolean
  textureSet: TextureSetDto
  onHide: () => void
  onSetUpdated: () => void
}

function TextureSetDetailDialog({
  visible,
  textureSet,
  onHide,
  onSetUpdated,
}: TextureSetDetailDialogProps) {
  const [currentSet, setCurrentSet] = useState<TextureSetDto>(textureSet)
  const [updating, setUpdating] = useState(false)
  const [showAddTextureDialog, setShowAddTextureDialog] = useState(false)
  const [showModelAssociationDialog, setShowModelAssociationDialog] =
    useState(false)
  const toast = useRef<Toast>(null)
  const textureSetsApi = useTextureSets()

  useEffect(() => {
    setCurrentSet(textureSet)
  }, [textureSet])

  const handleUpdateName = async (newName: string) => {
    try {
      setUpdating(true)
      await textureSetsApi.updateTextureSet(currentSet.id, {
        name: newName,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set updated successfully',
        life: 3000,
      })

      onSetUpdated()
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
      message: `Are you sure you want to remove the ${getTextureTypeLabel(texture.textureType)} texture "${texture.fileName || 'Unknown'}" from this set?`,
      header: 'Remove Texture',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await textureSetsApi.removeTextureFromSet(currentSet.id, texture.id)
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Texture removed from set',
            life: 3000,
          })
          onSetUpdated()
        } catch (error) {
          console.error('Failed to remove texture:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to remove texture from set',
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
            currentSet.id,
            model.id
          )
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Model disassociated from set',
            life: 3000,
          })
          onSetUpdated()
        } catch (error) {
          console.error('Failed to disassociate model:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to disassociate model from set',
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
        header={`Texture Set: ${currentSet.name}`}
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

        <div className="set-overview">
          <div className="set-info">
            <SetHeader
              textureSet={currentSet}
              onNameUpdate={handleUpdateName}
              updating={updating}
            />
            <SetStats textureSet={currentSet} />
          </div>
        </div>

        <TabView className="set-detail-tabs">
          <TabPanel header="Textures" leftIcon="pi pi-image">
            <TexturesTable
              textures={currentSet.textures}
              onRemoveTexture={handleRemoveTexture}
              onAddTexture={() => setShowAddTextureDialog(true)}
            />
          </TabPanel>

          <TabPanel header="Models" leftIcon="pi pi-box">
            <ModelsCardGrid
              models={currentSet.associatedModels}
              onDisassociateModel={handleDisassociateModel}
              onManageAssociations={() => setShowModelAssociationDialog(true)}
            />
          </TabPanel>
        </TabView>
      </Dialog>

      {showAddTextureDialog && (
        <AddTextureToSetDialog
          visible={showAddTextureDialog}
          textureSet={currentSet}
          onHide={() => setShowAddTextureDialog(false)}
          onTextureAdded={() => {
            setShowAddTextureDialog(false)
            onSetUpdated()
          }}
        />
      )}

      {showModelAssociationDialog && (
        <ModelAssociationDialog
          visible={showModelAssociationDialog}
          textureSet={currentSet}
          onHide={() => setShowModelAssociationDialog(false)}
          onAssociationsChanged={() => {
            setShowModelAssociationDialog(false)
            onSetUpdated()
          }}
        />
      )}
    </>
  )
}

export default TextureSetDetailDialog
