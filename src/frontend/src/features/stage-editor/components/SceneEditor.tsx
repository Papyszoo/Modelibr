import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { Toast } from 'primereact/toast'
import EditorCanvas from './EditorCanvas'
import LightLibrary from './LightLibrary'
import PropertyPanel from './PropertyPanel'
import CodePanel from './CodePanel'
// eslint-disable-next-line no-restricted-imports -- Stage editor needs API access for saving/loading stages
import apiClient from '../../../services/ApiClient'
import './SceneEditor.css'

export interface StageLight {
  id: string
  type: 'ambient' | 'directional' | 'point' | 'spot'
  color: string
  intensity: number
  position?: [number, number, number]
  target?: [number, number, number]
  angle?: number
  penumbra?: number
  distance?: number
  decay?: number
}

export interface StageConfig {
  lights: StageLight[]
}

interface StageEditorProps {
  stageId?: string
}

function StageEditor({ stageId }: StageEditorProps = {}): JSX.Element {
  const [stageConfig, setStageConfig] = useState<StageConfig>({
    lights: [],
  })
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [currentStageId, setCurrentStageId] = useState<number | null>(
    stageId ? parseInt(stageId, 10) : null
  )
  const [stageName, setStageName] = useState<string>('Untitled Stage')
  const [saveDialogVisible, setSaveDialogVisible] = useState(false)
  const [loadDialogVisible, setLoadDialogVisible] = useState(false)
  const [savedStages, setSavedStages] = useState<
    Array<{
      id: number
      name: string
      createdAt: string
      updatedAt: string
    }>
  >([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingTsx, setIsGeneratingTsx] = useState(false)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadSavedStages()
  }, [])

  useEffect(() => {
    if (stageId) {
      loadStageById(parseInt(stageId, 10))
    }
  }, [stageId])

  const loadStageById = async (id: number) => {
    try {
      setIsLoading(true)
      const stage = await apiClient.getStageById(id)
      setStageName(stage.name)
      setCurrentStageId(stage.id)

      try {
        const config = JSON.parse(stage.configurationJson)
        // Ensure config has valid structure
        setStageConfig({
          lights: Array.isArray(config.lights) ? config.lights : [],
        })
      } catch (parseError) {
        console.error('Failed to parse stage configuration:', parseError)
        // Set default empty configuration
        setStageConfig({ lights: [] })
        toast.current?.show({
          severity: 'warn',
          summary: 'Warning',
          detail:
            'Stage configuration could not be loaded. Starting with empty stage.',
          life: 3000,
        })
      }
    } catch (error) {
      console.error('Failed to load stage:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load stage',
        life: 3000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadSavedStages = async () => {
    try {
      const response = await apiClient.getAllStages()
      setSavedStages(response.stages)
    } catch (error) {
      console.error('Failed to load stages:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load saved stages',
        life: 3000,
      })
    }
  }

  const handleSaveStage = async () => {
    setIsSaving(true)
    try {
      const configJson = JSON.stringify(stageConfig)

      if (currentStageId) {
        // Update existing stage
        await apiClient.updateStage(currentStageId, configJson)
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Stage updated successfully',
          life: 3000,
        })
      } else {
        // Create new stage
        const response = await apiClient.createStage(stageName, configJson)
        setCurrentStageId(response.id)
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Stage saved successfully',
          life: 3000,
        })
      }

      setSaveDialogVisible(false)
      await loadSavedStages()
    } catch (error) {
      console.error('Failed to save stage:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save stage',
        life: 3000,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLoadStage = async (stageId: number) => {
    try {
      const stage = await apiClient.getStageById(stageId)

      // Parse JSON with error handling
      let config: StageConfig
      try {
        const parsed = JSON.parse(stage.configurationJson)
        // Ensure config has valid structure
        config = {
          lights: Array.isArray(parsed.lights) ? parsed.lights : [],
        }
      } catch (parseError) {
        console.error('Failed to parse stage configuration:', parseError)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Stage configuration is corrupted',
          life: 3000,
        })
        return
      }

      setStageConfig(config)
      setCurrentStageId(stage.id)
      setStageName(stage.name)
      setSelectedObjectId(null)
      setLoadDialogVisible(false)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Stage loaded successfully',
        life: 3000,
      })
    } catch (error) {
      console.error('Failed to load stage:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load stage',
        life: 3000,
      })
    }
  }

  const handleNewStage = () => {
    setStageConfig({ lights: [] })
    setSelectedObjectId(null)
    setCurrentStageId(null)
    setStageName('Untitled Stage')
    toast.current?.show({
      severity: 'info',
      summary: 'New Stage',
      detail: 'Started new stage',
      life: 2000,
    })
  }

  const handleGenerateTsx = async () => {
    if (!currentStageId) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please save the stage first before generating TSX',
        life: 3000,
      })
      return
    }

    setIsGeneratingTsx(true)
    try {
      await apiClient.generateStageTsx(currentStageId)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'TSX file generated successfully',
        life: 3000,
      })
    } catch (error) {
      console.error('Failed to generate TSX:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to generate TSX file',
        life: 3000,
      })
    } finally {
      setIsGeneratingTsx(false)
    }
  }

  const handleDownloadTsx = () => {
    if (!currentStageId) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please save the stage first',
        life: 3000,
      })
      return
    }

    const downloadUrl = apiClient.getStageTsxDownloadUrl(currentStageId)
    window.open(downloadUrl, '_blank')
  }

  const handleAddLight = (type: StageLight['type']) => {
    const newLight: StageLight = {
      id: `light-${Date.now()}`,
      type,
      color: '#ffffff',
      intensity: type === 'ambient' ? 0.5 : 1.0,
      ...(type !== 'ambient' && { position: [5, 5, 5] }),
      ...(type === 'directional' && { target: [0, 0, 0] }),
      ...(type === 'spot' && {
        angle: Math.PI / 6,
        penumbra: 0.1,
        distance: 0,
        decay: 2,
      }),
      ...(type === 'point' && { distance: 0, decay: 2 }),
    }

    setStageConfig(prev => ({
      ...prev,
      lights: [...prev.lights, newLight],
    }))
    setSelectedObjectId(newLight.id)
  }

  const handleUpdateLight = (id: string, updates: Partial<StageLight>) => {
    setStageConfig(prev => ({
      ...prev,
      lights: prev.lights.map(light =>
        light.id === id ? { ...light, ...updates } : light
      ),
    }))
  }

  const handleDeleteLight = (id: string) => {
    setStageConfig(prev => ({
      ...prev,
      lights: prev.lights.filter(light => light.id !== id),
    }))
    if (selectedObjectId === id) {
      setSelectedObjectId(null)
    }
  }

  const selectedObject = stageConfig.lights.find(
    light => light.id === selectedObjectId
  )

  if (isLoading) {
    return (
      <div className="stage-editor-loading">
        <Toast ref={toast} />
        <div className="loading-message">
          <i className="pi pi-spinner pi-spin" style={{ fontSize: '2rem' }} />
          <p>Loading stage...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stage-editor">
      <Toast ref={toast} />

      <div className="editor-toolbar">
        <div className="toolbar-left">
          <h3>{stageName}</h3>
        </div>
        <div className="toolbar-right">
          <Button
            icon="pi pi-file"
            label="New"
            className="p-button-text"
            onClick={handleNewStage}
            tooltip="New Stage"
          />
          <Button
            icon="pi pi-save"
            label="Save"
            className="p-button-text"
            onClick={() => setSaveDialogVisible(true)}
            tooltip="Save Stage"
          />
          <Button
            icon="pi pi-folder-open"
            label="Load"
            className="p-button-text"
            onClick={() => {
              setLoadDialogVisible(true)
              loadSavedStages()
            }}
            tooltip="Load Stage"
          />
          <Button
            icon="pi pi-code"
            label="Generate TSX"
            className="p-button-text"
            onClick={handleGenerateTsx}
            disabled={!currentStageId || isGeneratingTsx}
            tooltip="Generate and save TSX file"
          />
          <Button
            icon="pi pi-download"
            label="Download TSX"
            className="p-button-text"
            onClick={handleDownloadTsx}
            disabled={!currentStageId}
            tooltip="Download TSX file"
          />
        </div>
      </div>

      <div className="editor-content">
        <div className="editor-sidebar left">
          <LightLibrary onAddLight={handleAddLight} />
        </div>

        <div className="editor-main">
          <EditorCanvas
            stageConfig={stageConfig}
            selectedObjectId={selectedObjectId}
            onSelectObject={setSelectedObjectId}
          />
          <CodePanel stageConfig={stageConfig} />
        </div>

        <div className="editor-sidebar right">
          <PropertyPanel
            selectedObject={selectedObject}
            onUpdateObject={handleUpdateLight}
            onDeleteObject={handleDeleteLight}
          />
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog
        header="Save Stage"
        visible={saveDialogVisible}
        style={{ width: '400px' }}
        onHide={() => setSaveDialogVisible(false)}
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="stageName">Stage Name</label>
            <InputText
              id="stageName"
              value={stageName}
              onChange={e => setStageName(e.target.value)}
              disabled={!!currentStageId}
              aria-describedby={currentStageId ? 'stage-name-help' : undefined}
            />
            {currentStageId && (
              <small id="stage-name-help">
                Stage name cannot be changed after creation
              </small>
            )}
          </div>
          <div className="field" style={{ marginTop: '1rem' }}>
            <Button
              label={isSaving ? 'Saving...' : 'Save'}
              icon="pi pi-save"
              onClick={handleSaveStage}
              disabled={!stageName.trim() || isSaving}
            />
          </div>
        </div>
      </Dialog>

      {/* Load Dialog */}
      <Dialog
        header="Load Stage"
        visible={loadDialogVisible}
        style={{ width: '500px' }}
        onHide={() => setLoadDialogVisible(false)}
      >
        <div className="saved-stages-list">
          {savedStages.length === 0 ? (
            <p className="no-stages">No saved stages found</p>
          ) : (
            savedStages.map(stage => (
              <div key={stage.id} className="saved-stage-item">
                <div className="stage-info">
                  <h4>{stage.name}</h4>
                  <small>
                    Updated: {new Date(stage.updatedAt).toLocaleString()}
                  </small>
                </div>
                <Button
                  icon="pi pi-folder-open"
                  label="Load"
                  className="p-button-sm"
                  onClick={() => handleLoadStage(stage.id)}
                />
              </div>
            ))
          )}
        </div>
      </Dialog>
    </div>
  )
}

export default StageEditor
