import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { Toast } from 'primereact/toast'
import EditorCanvas from './EditorCanvas'
import LightLibrary from './LightLibrary'
import PropertyPanel from './PropertyPanel'
import CodePanel from './CodePanel'
// eslint-disable-next-line no-restricted-imports -- Scene editor needs API access for saving/loading scenes
import apiClient from '../../../services/ApiClient'
import './SceneEditor.css'

export interface SceneLight {
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

export interface SceneConfig {
  lights: SceneLight[]
}

function SceneEditor(): JSX.Element {
  const [sceneConfig, setSceneConfig] = useState<SceneConfig>({
    lights: [],
  })
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [currentSceneId, setCurrentSceneId] = useState<number | null>(null)
  const [sceneName, setSceneName] = useState<string>('Untitled Scene')
  const [saveDialogVisible, setSaveDialogVisible] = useState(false)
  const [loadDialogVisible, setLoadDialogVisible] = useState(false)
  const [savedScenes, setSavedScenes] = useState<
    Array<{
      id: number
      name: string
      createdAt: string
      updatedAt: string
    }>
  >([])
  const [isSaving, setIsSaving] = useState(false)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadSavedScenes()
  }, [])

  const loadSavedScenes = async () => {
    try {
      const response = await apiClient.getAllScenes()
      setSavedScenes(response.scenes)
    } catch (error) {
      console.error('Failed to load scenes:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load saved scenes',
        life: 3000,
      })
    }
  }

  const handleSaveScene = async () => {
    setIsSaving(true)
    try {
      const configJson = JSON.stringify(sceneConfig)

      if (currentSceneId) {
        // Update existing scene
        await apiClient.updateScene(currentSceneId, configJson)
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Scene updated successfully',
          life: 3000,
        })
      } else {
        // Create new scene
        const response = await apiClient.createScene(sceneName, configJson)
        setCurrentSceneId(response.id)
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Scene saved successfully',
          life: 3000,
        })
      }

      setSaveDialogVisible(false)
      await loadSavedScenes()
    } catch (error) {
      console.error('Failed to save scene:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to save scene',
        life: 3000,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleLoadScene = async (sceneId: number) => {
    try {
      const scene = await apiClient.getSceneById(sceneId)

      // Parse JSON with error handling
      let config: SceneConfig
      try {
        config = JSON.parse(scene.configurationJson) as SceneConfig
      } catch (parseError) {
        console.error('Failed to parse scene configuration:', parseError)
        toast.current?.show({
          severity: 'error',
          summary: 'Error',
          detail: 'Scene configuration is corrupted',
          life: 3000,
        })
        return
      }

      setSceneConfig(config)
      setCurrentSceneId(scene.id)
      setSceneName(scene.name)
      setSelectedObjectId(null)
      setLoadDialogVisible(false)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Scene loaded successfully',
        life: 3000,
      })
    } catch (error) {
      console.error('Failed to load scene:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load scene',
        life: 3000,
      })
    }
  }

  const handleNewScene = () => {
    setSceneConfig({ lights: [] })
    setSelectedObjectId(null)
    setCurrentSceneId(null)
    setSceneName('Untitled Scene')
    toast.current?.show({
      severity: 'info',
      summary: 'New Scene',
      detail: 'Started new scene',
      life: 2000,
    })
  }

  const handleAddLight = (type: SceneLight['type']) => {
    const newLight: SceneLight = {
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

    setSceneConfig(prev => ({
      ...prev,
      lights: [...prev.lights, newLight],
    }))
    setSelectedObjectId(newLight.id)
  }

  const handleUpdateLight = (id: string, updates: Partial<SceneLight>) => {
    setSceneConfig(prev => ({
      ...prev,
      lights: prev.lights.map(light =>
        light.id === id ? { ...light, ...updates } : light
      ),
    }))
  }

  const handleDeleteLight = (id: string) => {
    setSceneConfig(prev => ({
      ...prev,
      lights: prev.lights.filter(light => light.id !== id),
    }))
    if (selectedObjectId === id) {
      setSelectedObjectId(null)
    }
  }

  const selectedObject = sceneConfig.lights.find(
    light => light.id === selectedObjectId
  )

  return (
    <div className="scene-editor">
      <Toast ref={toast} />

      <div className="editor-toolbar">
        <div className="toolbar-left">
          <h3>{sceneName}</h3>
        </div>
        <div className="toolbar-right">
          <Button
            icon="pi pi-file"
            label="New"
            className="p-button-text"
            onClick={handleNewScene}
            tooltip="New Scene"
          />
          <Button
            icon="pi pi-save"
            label="Save"
            className="p-button-text"
            onClick={() => setSaveDialogVisible(true)}
            tooltip="Save Scene"
          />
          <Button
            icon="pi pi-folder-open"
            label="Load"
            className="p-button-text"
            onClick={() => {
              setLoadDialogVisible(true)
              loadSavedScenes()
            }}
            tooltip="Load Scene"
          />
        </div>
      </div>

      <div className="editor-content">
        <div className="editor-sidebar left">
          <LightLibrary onAddLight={handleAddLight} />
        </div>

        <div className="editor-main">
          <EditorCanvas
            sceneConfig={sceneConfig}
            selectedObjectId={selectedObjectId}
            onSelectObject={setSelectedObjectId}
          />
          <CodePanel sceneConfig={sceneConfig} />
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
        header="Save Scene"
        visible={saveDialogVisible}
        style={{ width: '400px' }}
        onHide={() => setSaveDialogVisible(false)}
      >
        <div className="p-fluid">
          <div className="field">
            <label htmlFor="sceneName">Scene Name</label>
            <InputText
              id="sceneName"
              value={sceneName}
              onChange={e => setSceneName(e.target.value)}
              disabled={!!currentSceneId}
              aria-describedby={currentSceneId ? 'scene-name-help' : undefined}
            />
            {currentSceneId && (
              <small id="scene-name-help">
                Scene name cannot be changed after creation
              </small>
            )}
          </div>
          <div className="field" style={{ marginTop: '1rem' }}>
            <Button
              label={isSaving ? 'Saving...' : 'Save'}
              icon="pi pi-save"
              onClick={handleSaveScene}
              disabled={!sceneName.trim() || isSaving}
            />
          </div>
        </div>
      </Dialog>

      {/* Load Dialog */}
      <Dialog
        header="Load Scene"
        visible={loadDialogVisible}
        style={{ width: '500px' }}
        onHide={() => setLoadDialogVisible(false)}
      >
        <div className="saved-scenes-list">
          {savedScenes.length === 0 ? (
            <p className="no-scenes">No saved scenes found</p>
          ) : (
            savedScenes.map(scene => (
              <div key={scene.id} className="saved-scene-item">
                <div className="scene-info">
                  <h4>{scene.name}</h4>
                  <small>
                    Updated: {new Date(scene.updatedAt).toLocaleString()}
                  </small>
                </div>
                <Button
                  icon="pi pi-folder-open"
                  label="Load"
                  className="p-button-sm"
                  onClick={() => handleLoadScene(scene.id)}
                />
              </div>
            ))
          )}
        </div>
      </Dialog>
    </div>
  )
}

export default SceneEditor
