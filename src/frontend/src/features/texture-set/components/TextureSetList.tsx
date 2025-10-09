import { useState, useEffect, useCallback } from 'react'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { TextureSetDto } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import { useTabContext } from '../../../hooks/useTabContext'
import CreateTextureSetDialog from '../dialogs/CreateTextureSetDialog'
import TextureSetListHeader from './TextureSetListHeader'
import TextureSetTable from './TextureSetTable'
import './TextureSetList.css'

function TextureSetList() {
  const [textureSets, setTextureSets] = useState<TextureSetDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const textureSetsApi = useTextureSets()
  const { openTextureSetDetailsTab } = useTabContext()

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

  const handleDeleteTextureSet = (textureSet: TextureSetDto) => {
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

  return (
    <div className="texture-set-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <TextureSetListHeader
        packCount={textureSets.length}
        onCreatePack={() => setShowCreateDialog(true)}
      />

      <TextureSetTable
        textureSets={textureSets}
        loading={loading}
        onViewDetails={handleViewDetails}
        onDeletePack={handleDeleteTextureSet}
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
