import { useState, useEffect, useCallback } from 'react'
import { TabView, TabPanel } from 'primereact/tabview'
import { TextureSetDto, TextureType } from '../../../types'
import { useTextureSets } from '../hooks/useTextureSets'
import { getAllTextureTypes } from '../../../utils/textureTypeUtils'
import SetHeader from '../dialogs/SetHeader'
import SetStats from '../dialogs/SetStats'
import ModelsCardGrid from '../dialogs/ModelsCardGrid'
import TextureCard from './TextureCard'
import ModelAssociationDialog from '../dialogs/ModelAssociationDialog'
import TexturePreviewPanel from './TexturePreviewPanel'
import { confirmDialog, ConfirmDialog } from 'primereact/confirmdialog'
import { ModelSummaryDto } from '../../../types'
import './TextureSetViewer.css'

interface TextureSetViewerProps {
  setId: string
  side?: 'left' | 'right'
}

function TextureSetViewer({ setId, side = 'left' }: TextureSetViewerProps) {
  const [textureSet, setTextureSet] = useState<TextureSetDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [updating, setUpdating] = useState(false)
  const [showModelAssociationDialog, setShowModelAssociationDialog] =
    useState(false)
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const textureSetsApi = useTextureSets()

  const loadTextureSet = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const set = await textureSetsApi.getTextureSetById(parseInt(setId))
      setTextureSet(set)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load texture set'
      )
    } finally {
      setLoading(false)
    }
  }, [setId, textureSetsApi])

  useEffect(() => {
    loadTextureSet()
  }, [loadTextureSet])

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

    const versionInfo = model.versionNumber ? ` (Version ${model.versionNumber})` : ''
    confirmDialog({
      message: `Are you sure you want to disassociate the model "${model.name}"${versionInfo} from this texture set?`,
      header: 'Disassociate Model',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          if (!model.modelVersionId) {
            console.error('Model version ID is missing')
            return
          }
          await textureSetsApi.disassociateTextureSetFromModelVersion(
            textureSet.id,
            model.modelVersionId
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
    return <div className="texture-set-viewer-error">Texture set not found</div>
  }

  // Get all texture types for cards
  const allTextureTypes = getAllTextureTypes()

  return (
    <div className="texture-set-viewer">
      <ConfirmDialog />

      <header className="set-viewer-header">
        <div className="set-overview">
          <div className="set-info">
            <SetHeader
              textureSet={textureSet}
              onNameUpdate={handleUpdateName}
              updating={updating}
            />
            <SetStats textureSet={textureSet} />
          </div>
        </div>
      </header>

      <TabView
        className="set-viewer-tabs"
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
                  setId={textureSet.id}
                  onTextureUpdated={loadTextureSet}
                />
              )
            })}
          </div>
        </TabPanel>

        <TabPanel header="Models" leftIcon="pi pi-box">
          <ModelsCardGrid
            models={textureSet.associatedModels}
            onDisassociateModel={handleDisassociateModel}
            onManageAssociations={() => setShowModelAssociationDialog(true)}
          />
        </TabPanel>

        {textureSet.textureCount > 0 && (
          <TabPanel header="Preview" leftIcon="pi pi-eye">
            <TexturePreviewPanel textureSet={textureSet} side={side} />
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
