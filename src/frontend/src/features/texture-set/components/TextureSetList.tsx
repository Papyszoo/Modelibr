import { useState, useEffect, useCallback } from 'react'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { TextureSetDto, TextureType } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import { useTabContext } from '../../../hooks/useTabContext'
import { useDragAndDrop } from '../../../shared/hooks/useFileUpload'
import { useUploadProgress } from '../../../hooks/useUploadProgress'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import CreateTextureSetDialog from '../dialogs/CreateTextureSetDialog'
import TextureSetListHeader from './TextureSetListHeader'
import TextureSetGrid from './TextureSetGrid'
import './TextureSetList.css'

function TextureSetList() {
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const textureSetsApi = useTextureSets()
  const { openTextureSetDetailsTab } = useTabContext()
  const uploadProgressContext = useUploadProgress()

  const loadTextureSets = useCallback(async () => {
    try {
      setLoading(true)
      const sets = await textureSetsApi.getAllTextureSets()
      setTextureSets(sets || [])
    } catch (error) {
      console.error('Failed to load texture sets:', error)
      setTextureSets([]) // Ensure textureSets is always an array
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load texture sets',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [textureSetsApi])

  useEffect(() => {
    loadTextureSets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateTextureSet = async (name: string) => {
    try {
      await textureSetsApi.createTextureSet({ name })
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture set created successfully',
        life: 3000,
      })
      loadTextureSets()
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Failed to create texture set:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create texture set',
        life: 3000,
      })
    }
  }

  const _handleDeleteTextureSet = (textureSet: TextureSetDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the texture set "${textureSet.name}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await textureSetsApi.deleteTextureSet(textureSet.id)
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Texture set deleted successfully',
            life: 3000,
          })
          loadTextureSets()
        } catch (error) {
          console.error('Failed to delete texture set:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete texture set',
            life: 3000,
          })
        }
      },
    })
  }

  const handleViewDetails = (textureSet: TextureSetDto) => {
    openTextureSetDetailsTab(textureSet)
  }

  const handleFileDrop = async (files: File[] | FileList) => {
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      let uploadId: string | null = null
      try {
        // 1. Track the upload and get its ID
        uploadId = uploadProgressContext?.addUpload(file, 'texture') || null

        // 2. Upload the file with progress tracking
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 50)
        }

        const uploadResult = await ApiClient.uploadFile(file)

        if (uploadId && uploadProgressContext) {
          uploadProgressContext.updateUploadProgress(uploadId, 75)
        }

        // 3. Create a new texture set with the file name (without extension)
        const fileName = file.name.replace(/\.[^/.]+$/, '')
        const createResult = await textureSetsApi.createTextureSet({
          name: fileName,
        })

        // 4. Add the uploaded file as an albedo texture to the new set
        await ApiClient.addTextureToSetEndpoint(createResult.id, {
          fileId: uploadResult.fileId,
          textureType: TextureType.Albedo,
        })

        // 5. Complete the upload with texture set ID
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.completeUpload(uploadId, {
            ...uploadResult,
            textureSetId: createResult.id,
          })
        }

        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: `Texture set "${fileName}" created with albedo texture`,
          life: 3000,
        })
      } catch (error) {
        // Mark upload as failed
        if (uploadId && uploadProgressContext) {
          uploadProgressContext.failUpload(uploadId, error as Error)
        }

        console.error('Failed to create texture set from file:', error)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: `Failed to create texture set from ${file.name}`,
          life: 3000,
        })
      }
    }

    // Refresh the texture sets list
    loadTextureSets()
  }

  // Use drag and drop hook
  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(handleFileDrop)

  return (
    <div className="texture-set-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <TextureSetListHeader
        setCount={textureSets.length}
        onCreateSet={() => setShowCreateDialog(true)}
      />

      <TextureSetGrid
        textureSets={textureSets}
        loading={loading}
        onTextureSetSelect={handleViewDetails}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
      />

      {showCreateDialog && (
        <CreateTextureSetDialog
          visible={showCreateDialog}
          onHide={() => setShowCreateDialog(false)}
          onSubmit={handleCreateTextureSet}
        />
      )}
    </div>
  )
}

export default TextureSetList
