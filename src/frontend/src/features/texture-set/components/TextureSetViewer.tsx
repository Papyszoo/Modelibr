import { useState, useEffect } from 'react'
import { TabView, TabPanel } from 'primereact/tabview'
import { TextureSetDto, TextureType } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import { getAllTextureTypes } from '../../../utils/textureTypeUtils'
import PackHeader from '../dialogs/PackHeader'
import PackStats from '../dialogs/PackStats'
import ModelsTable from '../dialogs/ModelsTable'
import TextureCard from './TextureCard'
import ModelAssociationDialog from '../dialogs/ModelAssociationDialog'
import TexturePreviewPanel from './TexturePreviewPanel'
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog'
import { ModelSummaryDto } from '../../../types'
import './TextureSetViewer.css'

interface TextureSetViewerProps {
  packId: string
}

function TextureSetViewer({ packId }: TextureSetViewerProps) {
  const [textureSet, setTextureSet] = useState<TextureSetDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [updating, setUpdating] = useState(false)
  const [showModelAssociationDialog, setShowModelAssociationDialog] =
    useState(false)
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const textureSetsApi = useTextureSets()

  const loadTextureSet = async () => {
    try {
      setLoading(true)
      setError('')
      const pack = await textureSetsApi.getTextureSetById(parseInt(packId))
      setTextureSet(pack)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load texture set'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTextureSet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId])

  const handleUpdateName = async (newName: string) => {
    if (!textureSet) return

    try {
      setUpdating(true)
      await textureSetsApi.updateTextureSet(textureSet.id, {
        name: newName,
      })
      await loadTextureSet()
    } catch (error) {
      console.error('Failed to update texture set:', error)
      throw error
    } finally {
      setUpdating(false)
    }
  }

  const handleDisassociateModel = (model: ModelSummaryDto) => {
    if (!textureSet) return

    confirmDialog({
      message: `Are you sure you want to disassociate the model "${model.name}" from this texture set?`,
      header: 'Disassociate Model',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await textureSetsApi.disassociateTextureSetFromModel(
            textureSet.id,
            model.id
          )
          await loadTextureSet()
        } catch (error) {
          console.error('Failed to disassociate model:', error)
        }
      },
    })
  }

  if (loading) {
    return (
      <div className="texture-set-viewer-loading">Loading texture set...</div>
    )
  }

  if (error) {
    return <div className="texture-set-viewer-error">Error: {error}</div>
  }

  if (!textureSet) {
    return (
      <div className="texture-set-viewer-error">Texture set not found</div>
    )
  }

  // Get all texture types for cards
  const allTextureTypes = getAllTextureTypes()

  return (
    <div className="texture-set-viewer">
      <ConfirmDialog />

      <header className="pack-viewer-header">
        <div className="pack-overview">
          <div className="pack-info">
            <PackHeader
              textureSet={textureSet}
              onNameUpdate={handleUpdateName}
              updating={updating}
            />
            <PackStats textureSet={textureSet} />
          </div>
        </div>
      </header>

      <TabView
        className="pack-viewer-tabs"
        activeIndex={activeTabIndex}
        onTabChange={e => setActiveTabIndex(e.index)}
      >
        <TabPanel header="Textures" leftIcon="pi pi-image">
          <div className="texture-cards-grid">
            {allTextureTypes.map((textureType: TextureType) => {
              const texture =
                textureSet.textures.find(t => t.textureType === textureType) ||
                null

              return (
                <TextureCard
                  key={textureType}
                  textureType={textureType}
                  texture={texture}
                  packId={textureSet.id}
                  onTextureUpdated={loadTextureSet}
                />
              )
            })}
          </div>
        </TabPanel>

        <TabPanel header="Models" leftIcon="pi pi-box">
          <ModelsTable
            models={textureSet.associatedModels}
            onDisassociateModel={handleDisassociateModel}
            onManageAssociations={() => setShowModelAssociationDialog(true)}
          />
        </TabPanel>

        {textureSet.textureCount > 0 && (
          <TabPanel header="Preview" leftIcon="pi pi-eye">
            <TexturePreviewPanel textureSet={textureSet} />
          </TabPanel>
        )}
      </TabView>

      {showModelAssociationDialog && (
        <ModelAssociationDialog
          visible={showModelAssociationDialog}
          textureSet={textureSet}
          onHide={() => setShowModelAssociationDialog(false)}
          onAssociationsChanged={() => {
            setShowModelAssociationDialog(false)
            loadTextureSet()
          }}
        />
      )}
    </div>
  )
}

export default TextureSetViewer
