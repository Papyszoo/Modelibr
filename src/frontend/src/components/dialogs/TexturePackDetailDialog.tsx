import { useState, useEffect, useRef } from 'react'
import { Dialog } from 'primereact/dialog'
import { TabView, TabPanel } from 'primereact/tabview'
import { InputText } from 'primereact/inputtext'
import { Button } from 'primereact/button'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Toast } from 'primereact/toast'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { classNames } from 'primereact/utils'
import ApiClient from '../../services/ApiClient'
import { TexturePackDto, TextureDto, ModelSummaryDto } from '../../types'
import { getTextureTypeLabel, getTextureTypeColor, getTextureTypeIcon } from '../../utils/textureTypeUtils'
import AddTextureToPackDialog from './AddTextureToPackDialog'
import ModelAssociationDialog from './ModelAssociationDialog'
import './dialogs.css'

interface TexturePackDetailDialogProps {
  visible: boolean
  texturePack: TexturePackDto
  onHide: () => void
  onPackUpdated: () => void
}

function TexturePackDetailDialog({ visible, texturePack, onHide, onPackUpdated }: TexturePackDetailDialogProps) {
  const [currentPack, setCurrentPack] = useState<TexturePackDto>(texturePack)
  const [editedName, setEditedName] = useState(texturePack.name)
  const [editing, setEditing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [showAddTextureDialog, setShowAddTextureDialog] = useState(false)
  const [showModelAssociationDialog, setShowModelAssociationDialog] = useState(false)
  const [errors, setErrors] = useState<{ name?: string }>({})
  const toast = useRef<Toast>(null)

  useEffect(() => {
    setCurrentPack(texturePack)
    setEditedName(texturePack.name)
  }, [texturePack])

  const validateName = (name: string) => {
    const newErrors: { name?: string } = {}
    
    if (!name.trim()) {
      newErrors.name = 'Name is required'
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters long'
    } else if (name.trim().length > 200) {
      newErrors.name = 'Name cannot exceed 200 characters'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleUpdateName = async () => {
    if (!validateName(editedName)) {
      return
    }

    try {
      setUpdating(true)
      await ApiClient.updateTexturePack(currentPack.id, { name: editedName.trim() })
      
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture pack updated successfully',
        life: 3000
      })
      
      setEditing(false)
      onPackUpdated()
    } catch (error) {
      console.error('Failed to update texture pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to update texture pack',
        life: 3000
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleCancelEdit = () => {
    setEditedName(currentPack.name)
    setEditing(false)
    setErrors({})
  }

  const handleRemoveTexture = (texture: TextureDto) => {
    confirmDialog({
      message: `Are you sure you want to remove the ${getTextureTypeLabel(texture.textureType)} texture "${texture.fileName || 'Unknown'}" from this pack?`,
      header: 'Remove Texture',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await ApiClient.removeTextureFromPack(currentPack.id, texture.id)
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Texture removed from pack',
            life: 3000
          })
          onPackUpdated()
        } catch (error) {
          console.error('Failed to remove texture:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to remove texture from pack',
            life: 3000
          })
        }
      }
    })
  }

  const handleDisassociateModel = (model: ModelSummaryDto) => {
    confirmDialog({
      message: `Are you sure you want to disassociate the model "${model.name}" from this texture pack?`,
      header: 'Disassociate Model',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await ApiClient.disassociateTexturePackFromModel(currentPack.id, model.id)
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Model disassociated from pack',
            life: 3000
          })
          onPackUpdated()
        } catch (error) {
          console.error('Failed to disassociate model:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to disassociate model from pack',
            life: 3000
          })
        }
      }
    })
  }

  const textureTypeBodyTemplate = (rowData: TextureDto) => {
    return (
      <span
        className="texture-type-badge"
        style={{ backgroundColor: getTextureTypeColor(rowData.textureType) }}
      >
        <i className={`pi ${getTextureTypeIcon(rowData.textureType)}`}></i>
        {getTextureTypeLabel(rowData.textureType)}
      </span>
    )
  }

  const textureDateBodyTemplate = (rowData: TextureDto) => {
    return new Date(rowData.createdAt).toLocaleDateString()
  }

  const textureActionsBodyTemplate = (rowData: TextureDto) => {
    return (
      <Button
        icon="pi pi-trash"
        className="p-button-text p-button-rounded p-button-danger p-button-sm"
        onClick={() => handleRemoveTexture(rowData)}
        tooltip="Remove from pack"
      />
    )
  }

  const modelActionsBodyTemplate = (rowData: ModelSummaryDto) => {
    return (
      <Button
        icon="pi pi-times"
        className="p-button-text p-button-rounded p-button-danger p-button-sm"
        onClick={() => handleDisassociateModel(rowData)}
        tooltip="Disassociate from pack"
      />
    )
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
            <div className="pack-name-section">
              {editing ? (
                <div className="p-inputgroup">
                  <InputText
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className={classNames({ 'p-invalid': errors.name })}
                    placeholder="Texture pack name"
                    maxLength={200}
                    autoFocus
                  />
                  <Button 
                    icon="pi pi-check" 
                    className="p-button-success"
                    onClick={handleUpdateName}
                    loading={updating}
                    disabled={!editedName.trim() || updating}
                  />
                  <Button 
                    icon="pi pi-times" 
                    className="p-button-secondary"
                    onClick={handleCancelEdit}
                    disabled={updating}
                  />
                </div>
              ) : (
                <div className="pack-name-display">
                  <h3>{currentPack.name}</h3>
                  <Button 
                    icon="pi pi-pencil" 
                    className="p-button-text p-button-sm"
                    onClick={() => setEditing(true)}
                    tooltip="Edit name"
                  />
                </div>
              )}
              {errors.name && <small className="p-error">{errors.name}</small>}
            </div>
            
            <div className="pack-stats">
              <span className="stat-item">
                <i className="pi pi-image"></i>
                {currentPack.textureCount} texture{currentPack.textureCount !== 1 ? 's' : ''}
              </span>
              <span className="stat-item">
                <i className="pi pi-box"></i>
                {currentPack.associatedModels.length} model{currentPack.associatedModels.length !== 1 ? 's' : ''}
              </span>
              <span className="stat-item">
                <i className="pi pi-calendar"></i>
                Updated {new Date(currentPack.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <TabView className="pack-detail-tabs">
          <TabPanel header="Textures" leftIcon="pi pi-image">
            <div className="tab-header">
              <h4>Textures in Pack</h4>
              <Button 
                label="Add Texture" 
                icon="pi pi-plus" 
                onClick={() => setShowAddTextureDialog(true)}
                size="small"
              />
            </div>
            
            <DataTable
              value={currentPack.textures}
              emptyMessage="No textures in this pack"
              responsiveLayout="scroll"
              stripedRows
              showGridlines
            >
              <Column 
                field="fileName" 
                header="File Name" 
                sortable
                style={{ minWidth: '200px' }}
              />
              <Column 
                header="Type" 
                body={textureTypeBodyTemplate}
                sortable
                sortField="textureType"
                style={{ minWidth: '150px' }}
              />
              <Column 
                field="createdAt" 
                header="Added" 
                body={textureDateBodyTemplate}
                sortable
                style={{ minWidth: '120px' }}
              />
              <Column 
                body={textureActionsBodyTemplate}
                header="Actions"
                style={{ width: '80px' }}
              />
            </DataTable>
          </TabPanel>

          <TabPanel header="Models" leftIcon="pi pi-box">
            <div className="tab-header">
              <h4>Associated Models</h4>
              <Button 
                label="Manage Associations" 
                icon="pi pi-link" 
                onClick={() => setShowModelAssociationDialog(true)}
                size="small"
              />
            </div>
            
            <DataTable
              value={currentPack.associatedModels}
              emptyMessage="No models associated with this pack"
              responsiveLayout="scroll"
              stripedRows
              showGridlines
            >
              <Column 
                field="name" 
                header="Model Name" 
                sortable
                style={{ minWidth: '200px' }}
              />
              <Column 
                body={modelActionsBodyTemplate}
                header="Actions"
                style={{ width: '80px' }}
              />
            </DataTable>
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