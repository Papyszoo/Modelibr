import { useState, useEffect } from 'react'
import { TabView, TabPanel } from 'primereact/tabview'
import { Button } from 'primereact/button'
import { TexturePackDto, TextureType } from '../../types'
import { useTexturePacks } from '../../hooks/useTexturePacks'
import { getAllTextureTypes } from '../../utils/textureTypeUtils'
import PackHeader from '../dialogs/texture-pack-detail/PackHeader'
import PackStats from '../dialogs/texture-pack-detail/PackStats'
import ModelsTable from '../dialogs/texture-pack-detail/ModelsTable'
import TextureCard from './texture-pack-viewer/TextureCard'
import ModelAssociationDialog from '../dialogs/ModelAssociationDialog'
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog'
import { ModelSummaryDto } from '../../types'
import './TexturePackViewer.css'

interface TexturePackViewerProps {
  packId: string
}

function TexturePackViewer({ packId }: TexturePackViewerProps) {
  const [texturePack, setTexturePack] = useState<TexturePackDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [updating, setUpdating] = useState(false)
  const [showModelAssociationDialog, setShowModelAssociationDialog] = useState(false)
  const texturePacksApi = useTexturePacks()

  const loadTexturePack = async () => {
    try {
      setLoading(true)
      setError('')
      const pack = await texturePacksApi.getTexturePackById(parseInt(packId))
      setTexturePack(pack)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load texture pack')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTexturePack()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId])

  const handleUpdateName = async (newName: string) => {
    if (!texturePack) return

    try {
      setUpdating(true)
      await texturePacksApi.updateTexturePack(texturePack.id, {
        name: newName,
      })
      await loadTexturePack()
    } catch (error) {
      console.error('Failed to update texture pack:', error)
      throw error
    } finally {
      setUpdating(false)
    }
  }

  const handleDisassociateModel = (model: ModelSummaryDto) => {
    if (!texturePack) return

    confirmDialog({
      message: `Are you sure you want to disassociate the model "${model.name}" from this texture pack?`,
      header: 'Disassociate Model',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await texturePacksApi.disassociateTexturePackFromModel(
            texturePack.id,
            model.id
          )
          await loadTexturePack()
        } catch (error) {
          console.error('Failed to disassociate model:', error)
        }
      },
    })
  }

  if (loading) {
    return <div className="texture-pack-viewer-loading">Loading texture pack...</div>
  }

  if (error) {
    return <div className="texture-pack-viewer-error">Error: {error}</div>
  }

  if (!texturePack) {
    return <div className="texture-pack-viewer-error">Texture pack not found</div>
  }

  // Get all texture types for cards
  const allTextureTypes = getAllTextureTypes()

  return (
    <div className="texture-pack-viewer">
      <ConfirmDialog />
      
      <header className="pack-viewer-header">
        <div className="pack-overview">
          <div className="pack-info">
            <PackHeader
              texturePack={texturePack}
              onNameUpdate={handleUpdateName}
              updating={updating}
            />
            <PackStats texturePack={texturePack} />
          </div>
        </div>
      </header>

      <TabView className="pack-viewer-tabs">
        <TabPanel header="Textures" leftIcon="pi pi-image">
          <div className="texture-cards-grid">
            {allTextureTypes.map((textureType: TextureType) => {
              const texture = texturePack.textures.find(
                t => t.textureType === textureType
              ) || null

              return (
                <TextureCard
                  key={textureType}
                  textureType={textureType}
                  texture={texture}
                  packId={texturePack.id}
                  onTextureUpdated={loadTexturePack}
                />
              )
            })}
          </div>
        </TabPanel>

        <TabPanel header="Models" leftIcon="pi pi-box">
          <ModelsTable
            models={texturePack.associatedModels}
            onDisassociateModel={handleDisassociateModel}
            onManageAssociations={() => setShowModelAssociationDialog(true)}
          />
        </TabPanel>
      </TabView>

      {showModelAssociationDialog && (
        <ModelAssociationDialog
          visible={showModelAssociationDialog}
          texturePack={texturePack}
          onHide={() => setShowModelAssociationDialog(false)}
          onAssociationsChanged={() => {
            setShowModelAssociationDialog(false)
            loadTexturePack()
          }}
        />
      )}
    </div>
  )
}

export default TexturePackViewer
