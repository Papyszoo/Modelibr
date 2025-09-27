import { useState, useEffect, useRef } from 'react'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import ApiClient from '../../services/ApiClient'
import { TexturePackDto, TextureType, Model } from '../../types'
import { getTextureTypeOptions, getTextureTypeLabel, getTextureTypeColor, getTextureTypeIcon } from '../../utils/textureTypeUtils'
import './dialogs.css'

interface AddTextureToPackDialogProps {
  visible: boolean
  texturePack: TexturePackDto
  onHide: () => void
  onTextureAdded: () => void
}

interface FileOption {
  id: number
  name: string
  mimeType: string
  sizeBytes: number
}

function AddTextureToPackDialog({ visible, texturePack, onHide, onTextureAdded }: AddTextureToPackDialogProps) {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const [selectedTextureType, setSelectedTextureType] = useState<TextureType | null>(null)
  const [availableFiles, setAvailableFiles] = useState<FileOption[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const toast = useRef<Toast>(null)

  const textureTypeOptions = getTextureTypeOptions()

  // Get used texture types in this pack
  const usedTextureTypes = new Set(texturePack.textures.map(t => t.textureType))
  
  // Filter available texture types (only allow one per type per pack)
  const availableTextureTypes = textureTypeOptions.filter(option => !usedTextureTypes.has(option.value))

  useEffect(() => {
    if (visible) {
      loadAvailableFiles()
    }
  }, [visible])

  const loadAvailableFiles = async () => {
    try {
      setLoading(true)
      const models = await ApiClient.getModels()
      
      // Extract all files from all models
      const allFiles: FileOption[] = []
      models.forEach((model: Model) => {
        model.files.forEach(file => {
          // Only include image files that could be textures
          if (file.mimeType.startsWith('image/')) {
            allFiles.push({
              id: parseInt(file.id),
              name: file.originalFileName,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes
            })
          }
        })
      })
      
      setAvailableFiles(allFiles)
    } catch (error) {
      console.error('Failed to load available files:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load available files',
        life: 3000
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedFileId || !selectedTextureType) {
      return
    }

    try {
      setSubmitting(true)
      await ApiClient.addTextureToPackEndpoint(texturePack.id, {
        fileId: selectedFileId,
        textureType: selectedTextureType
      })
      
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture added to pack successfully',
        life: 3000
      })
      
      // Reset form
      setSelectedFileId(null)
      setSelectedTextureType(null)
      onTextureAdded()
    } catch (error) {
      console.error('Failed to add texture to pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to add texture to pack',
        life: 3000
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    setSelectedFileId(null)
    setSelectedTextureType(null)
    onHide()
  }

  const fileOptionTemplate = (option: FileOption) => {
    return (
      <div className="file-option">
        <div className="file-info">
          <strong>{option.name}</strong>
          <div className="file-meta">
            <span>{option.mimeType}</span>
            <span>{(option.sizeBytes / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      </div>
    )
  }

  const textureTypeOptionTemplate = (option: { label: string; value: TextureType; color: string; icon: string }) => {
    return (
      <div className="texture-type-option">
        <span
          className="texture-type-badge"
          style={{ backgroundColor: option.color }}
        >
          <i className={`pi ${option.icon}`}></i>
          {option.label}
        </span>
      </div>
    )
  }

  const fileSizeBodyTemplate = (rowData: FileOption) => {
    return `${(rowData.sizeBytes / 1024).toFixed(1)} KB`
  }

  const dialogFooter = (
    <div>
      <Button 
        label="Cancel" 
        icon="pi pi-times" 
        className="p-button-text" 
        onClick={handleCancel}
        disabled={submitting}
      />
      <Button 
        label="Add Texture" 
        icon="pi pi-plus" 
        onClick={handleSubmit}
        loading={submitting}
        disabled={!selectedFileId || !selectedTextureType || submitting}
      />
    </div>
  )

  return (
    <Dialog
      header={`Add Texture to "${texturePack.name}"`}
      visible={visible}
      onHide={handleCancel}
      footer={dialogFooter}
      modal
      className="p-fluid"
      style={{ width: '70vw', maxWidth: '800px' }}
      maximizable
    >
      <Toast ref={toast} />
      
      <div className="add-texture-form">
        <div className="p-field">
          <label htmlFor="texture-type" className="p-text-bold">
            Texture Type <span className="p-error">*</span>
          </label>
          <Dropdown
            id="texture-type"
            value={selectedTextureType}
            options={availableTextureTypes}
            onChange={(e) => setSelectedTextureType(e.value)}
            placeholder="Select texture type"
            itemTemplate={textureTypeOptionTemplate}
            valueTemplate={selectedTextureType ? textureTypeOptionTemplate(
              textureTypeOptions.find(opt => opt.value === selectedTextureType)!
            ) : undefined}
            emptyMessage="All texture types are already used in this pack"
          />
          <small className="p-text-secondary">
            Each texture pack can only have one texture of each type
          </small>
        </div>

        <div className="p-field">
          <label htmlFor="file-select" className="p-text-bold">
            Select File <span className="p-error">*</span>
          </label>
          <DataTable
            value={availableFiles}
            loading={loading}
            selectionMode="single"
            selection={availableFiles.find(f => f.id === selectedFileId) || null}
            onSelectionChange={(e) => setSelectedFileId(e.value?.id || null)}
            emptyMessage="No image files available"
            paginator
            rows={10}
            responsiveLayout="scroll"
            stripedRows
            showGridlines
            className="file-selection-table"
          >
            <Column selectionMode="single" style={{ width: '3rem' }} />
            <Column 
              field="name" 
              header="File Name" 
              sortable
              style={{ minWidth: '200px' }}
            />
            <Column 
              field="mimeType" 
              header="Type" 
              sortable
              style={{ minWidth: '120px' }}
            />
            <Column 
              field="sizeBytes" 
              header="Size" 
              body={fileSizeBodyTemplate}
              sortable
              style={{ minWidth: '100px' }}
            />
          </DataTable>
          <small className="p-text-secondary">
            Select an image file to use as a texture. Only image files from uploaded models are shown.
          </small>
        </div>

        {availableTextureTypes.length === 0 && (
          <div className="p-message p-message-warn">
            <div className="p-message-wrapper">
              <div className="p-message-icon">
                <i className="pi pi-exclamation-triangle"></i>
              </div>
              <div className="p-message-text">
                This texture pack already contains all supported texture types. 
                Remove existing textures to add different ones.
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export default AddTextureToPackDialog