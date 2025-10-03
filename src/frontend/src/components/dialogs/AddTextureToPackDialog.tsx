import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { TexturePackDto, TextureType, Model } from '../../types'
import { getTextureTypeOptions } from '../../utils/textureTypeUtils'
import { useTexturePacks } from '../../hooks/useTexturePacks'
import TextureTypeDropdown from './add-texture/TextureTypeDropdown'
import FileSelectionTable, {
  FileOption,
} from './add-texture/FileSelectionTable'
import NoTextureTypesWarning from './add-texture/NoTextureTypesWarning'
import AddTextureFooter from './add-texture/AddTextureFooter'
import './dialogs.css'

interface AddTextureToPackDialogProps {
  visible: boolean
  texturePack: TexturePackDto
  onHide: () => void
  onTextureAdded: () => void
}

function AddTextureToPackDialog({
  visible,
  texturePack,
  onHide,
  onTextureAdded,
}: AddTextureToPackDialogProps) {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)
  const [selectedTextureType, setSelectedTextureType] =
    useState<TextureType | null>(null)
  const [availableFiles, setAvailableFiles] = useState<FileOption[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const toast = useRef<Toast>(null)
  const texturePacksApi = useTexturePacks()

  const textureTypeOptions = getTextureTypeOptions()

  // Get used texture types in this pack
  const usedTextureTypes = new Set(texturePack.textures.map(t => t.textureType))

  // Filter available texture types (only allow one per type per pack)
  const availableTextureTypes = textureTypeOptions.filter(
    option => !usedTextureTypes.has(option.value)
  )

  const loadAvailableFiles = useCallback(async () => {
    try {
      setLoading(true)
      const models = await texturePacksApi.getModels()

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
              sizeBytes: file.sizeBytes,
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
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [texturePacksApi])

  useEffect(() => {
    if (visible) {
      loadAvailableFiles()
    }
  }, [visible, loadAvailableFiles])

  const handleSubmit = async () => {
    if (!selectedFileId || !selectedTextureType) {
      return
    }

    try {
      setSubmitting(true)
      await texturePacksApi.addTextureToPackEndpoint(texturePack.id, {
        fileId: selectedFileId,
        textureType: selectedTextureType,
      })

      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture added to pack successfully',
        life: 3000,
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
        life: 3000,
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

  return (
    <Dialog
      header={`Add Texture to "${texturePack.name}"`}
      visible={visible}
      onHide={handleCancel}
      footer={
        <AddTextureFooter
          onCancel={handleCancel}
          onSubmit={handleSubmit}
          submitting={submitting}
          canSubmit={!!selectedFileId && !!selectedTextureType}
        />
      }
      modal
      className="p-fluid"
      style={{ width: '70vw', maxWidth: '800px' }}
      maximizable
    >
      <Toast ref={toast} />

      <div className="add-texture-form">
        <TextureTypeDropdown
          options={availableTextureTypes}
          value={selectedTextureType}
          onChange={setSelectedTextureType}
        />

        <FileSelectionTable
          files={availableFiles}
          loading={loading}
          selectedFileId={selectedFileId}
          onFileSelect={setSelectedFileId}
        />

        <NoTextureTypesWarning visible={availableTextureTypes.length === 0} />
      </div>
    </Dialog>
  )
}

export default AddTextureToPackDialog
