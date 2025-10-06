import { useState, useEffect, useCallback } from 'react'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useRef } from 'react'
import { TexturePackDto } from '../../types'
import { useTexturePacks } from '../../hooks/useTexturePacks'
import { useTabContext } from '../../hooks/useTabContext'
import CreateTexturePackDialog from '../dialogs/CreateTexturePackDialog'
import TexturePackListHeader from './texture-pack-list/TexturePackListHeader'
import TexturePackTable from './texture-pack-list/TexturePackTable'
import './TexturePackList.css'

function TexturePackList() {
  const [texturePacks, setTexturePacks] = useState<TexturePackDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const texturePacksApi = useTexturePacks()
  const { openTexturePackDetailsTab } = useTabContext()

  const loadTexturePacks = useCallback(async () => {
    try {
      setLoading(true)
      const packs = await texturePacksApi.getAllTexturePacks()
      setTexturePacks(packs || [])
    } catch (error) {
      console.error('Failed to load texture packs:', error)
      setTexturePacks([]) // Ensure texturePacks is always an array
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load texture packs',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [texturePacksApi])

  useEffect(() => {
    loadTexturePacks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCreateTexturePack = async (name: string) => {
    try {
      await texturePacksApi.createTexturePack({ name })
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Texture pack created successfully',
        life: 3000,
      })
      loadTexturePacks()
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Failed to create texture pack:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create texture pack',
        life: 3000,
      })
    }
  }

  const handleDeleteTexturePack = (texturePack: TexturePackDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the texture pack "${texturePack.name}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await texturePacksApi.deleteTexturePack(texturePack.id)
          toast.current?.show({
            severity: 'success',
            summary: 'Success',
            detail: 'Texture pack deleted successfully',
            life: 3000,
          })
          loadTexturePacks()
        } catch (error) {
          console.error('Failed to delete texture pack:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete texture pack',
            life: 3000,
          })
        }
      },
    })
  }

  const handleViewDetails = (texturePack: TexturePackDto) => {
    openTexturePackDetailsTab(texturePack)
  }

  return (
    <div className="texture-pack-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <TexturePackListHeader
        packCount={texturePacks.length}
        onCreatePack={() => setShowCreateDialog(true)}
      />

      <TexturePackTable
        texturePacks={texturePacks}
        loading={loading}
        onViewDetails={handleViewDetails}
        onDeletePack={handleDeleteTexturePack}
      />

      {showCreateDialog && (
        <CreateTexturePackDialog
          visible={showCreateDialog}
          onHide={() => setShowCreateDialog(false)}
          onSubmit={handleCreateTexturePack}
        />
      )}
    </div>
  )
}

export default TexturePackList
