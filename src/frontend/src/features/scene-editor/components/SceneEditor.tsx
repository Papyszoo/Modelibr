import { useState } from 'react'
import EditorCanvas from './EditorCanvas'
import LightLibrary from './LightLibrary'
import PropertyPanel from './PropertyPanel'
import CodePanel from './CodePanel'
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
    lights: []
  })
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)

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
        decay: 2
      }),
      ...(type === 'point' && { distance: 0, decay: 2 })
    }

    setSceneConfig(prev => ({
      ...prev,
      lights: [...prev.lights, newLight]
    }))
    setSelectedObjectId(newLight.id)
  }

  const handleUpdateLight = (id: string, updates: Partial<SceneLight>) => {
    setSceneConfig(prev => ({
      ...prev,
      lights: prev.lights.map(light =>
        light.id === id ? { ...light, ...updates } : light
      )
    }))
  }

  const handleDeleteLight = (id: string) => {
    setSceneConfig(prev => ({
      ...prev,
      lights: prev.lights.filter(light => light.id !== id)
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
  )
}

export default SceneEditor
