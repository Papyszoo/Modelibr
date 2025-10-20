import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import EditorCanvas from './EditorCanvas'
import { ComponentType } from './ComponentLibrary'
import ComponentLibraryWindow from './ComponentLibraryWindow'
import PropertyPanelWindow from './PropertyPanelWindow'
import CodePanelWindow from './CodePanelWindow'
import StageHierarchyWindow from './StageHierarchyWindow'
import { useTabContext } from '../../../hooks/useTabContext'
// eslint-disable-next-line no-restricted-imports -- Stage editor needs API access for saving/loading stages
import apiClient from '../../../services/ApiClient'
import './SceneEditor.css'

export interface StageLight {
  id: string
  type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere'
  color: string
  intensity: number
  position?: [number, number, number]
  target?: [number, number, number]
  angle?: number
  penumbra?: number
  distance?: number
  decay?: number
  groundColor?: string
}

export interface StageMesh {
  id: string
  type:
    | 'box'
    | 'sphere'
    | 'plane'
    | 'cylinder'
    | 'cone'
    | 'torus'
    | 'torusKnot'
    | 'dodecahedron'
    | 'icosahedron'
    | 'octahedron'
    | 'tetrahedron'
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  color: string
  wireframe?: boolean
}

export interface StageGroup {
  id: string
  type: 'group'
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  children: string[]
}

export interface StageHelper {
  id: string
  type:
    | 'stage'
    | 'environment'
    | 'contactShadows'
    | 'accumulativeShadows'
    | 'sky'
    | 'stars'
    | 'backdrop'
    | 'grid'
    | 'gizmoHelper'
  enabled: boolean
  properties?: Record<string, unknown>
}

export type StageObject = StageLight | StageMesh | StageGroup | StageHelper

export interface StageConfig {
  lights: StageLight[]
  meshes: StageMesh[]
  groups: StageGroup[]
  helpers: StageHelper[]
}

interface StageEditorProps {
  stageId?: string
}

function StageEditor({ stageId }: StageEditorProps = {}): JSX.Element {
  const { side } = useTabContext()
  const [stageConfig, setStageConfig] = useState<StageConfig>({
    lights: [],
    meshes: [],
    groups: [],
    helpers: [],
  })
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [currentStageId, setCurrentStageId] = useState<number | null>(
    stageId ? parseInt(stageId, 10) : null
  )
  const [stageName, setStageName] = useState<string>('Untitled Stage')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [componentsWindowVisible, setComponentsWindowVisible] = useState(false)
  const [propertiesWindowVisible, setPropertiesWindowVisible] = useState(false)
  const [codeWindowVisible, setCodeWindowVisible] = useState(false)
  const [hierarchyWindowVisible, setHierarchyWindowVisible] = useState(false)
  const toast = useRef<Toast>(null)

  // Determine which side for button positioning (opposite of panel side)
  const buttonPosition = side === 'left' ? 'right' : 'left'

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
          meshes: Array.isArray(config.meshes) ? config.meshes : [],
          groups: Array.isArray(config.groups) ? config.groups : [],
          helpers: Array.isArray(config.helpers) ? config.helpers : [],
        })
      } catch (parseError) {
        console.error('Failed to parse stage configuration:', parseError)
        // Set default empty configuration
        setStageConfig({ lights: [], meshes: [], groups: [], helpers: [] })
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

  const handleAddComponent = (category: ComponentType, type: string) => {
    const timestamp = Date.now()
    const id = `${category}-${timestamp}`

    if (category === 'light') {
      const newLight: StageLight = {
        id,
        type: type as StageLight['type'],
        color: '#ffffff',
        intensity: type === 'ambient' ? 0.5 : 1.0,
        ...(type !== 'ambient' &&
          type !== 'hemisphere' && { position: [5, 5, 5] }),
        ...(type === 'directional' && { target: [0, 0, 0] }),
        ...(type === 'spot' && {
          angle: Math.PI / 6,
          penumbra: 0.1,
          distance: 0,
          decay: 2,
        }),
        ...(type === 'point' && { distance: 0, decay: 2 }),
        ...(type === 'hemisphere' && { groundColor: '#080820' }),
      }

      setStageConfig(prev => ({
        ...prev,
        lights: [...prev.lights, newLight],
      }))
      setSelectedObjectId(newLight.id)
    } else if (category === 'mesh') {
      const newMesh: StageMesh = {
        id,
        type: type as StageMesh['type'],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        color: '#4a9eff',
        wireframe: false,
      }

      setStageConfig(prev => ({
        ...prev,
        meshes: [...prev.meshes, newMesh],
      }))
      setSelectedObjectId(newMesh.id)
    } else if (category === 'group') {
      const newGroup: StageGroup = {
        id,
        type: 'group',
        name: `Group ${timestamp}`,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        children: [],
      }

      setStageConfig(prev => ({
        ...prev,
        groups: [...prev.groups, newGroup],
      }))
      setSelectedObjectId(newGroup.id)
    } else if (category === 'helper') {
      const newHelper: StageHelper = {
        id,
        type: type as StageHelper['type'],
        enabled: true,
        properties: {},
      }

      setStageConfig(prev => ({
        ...prev,
        helpers: [...prev.helpers, newHelper],
      }))
      setSelectedObjectId(newHelper.id)
    }
  }

  const handleUpdateObject = (id: string, updates: Partial<StageObject>) => {
    setStageConfig(prev => {
      // Check which array the object belongs to
      if (prev.lights.some(light => light.id === id)) {
        return {
          ...prev,
          lights: prev.lights.map(light =>
            light.id === id ? { ...light, ...updates } : light
          ),
        }
      } else if (prev.meshes.some(mesh => mesh.id === id)) {
        return {
          ...prev,
          meshes: prev.meshes.map(mesh =>
            mesh.id === id ? { ...mesh, ...updates } : mesh
          ),
        }
      } else if (prev.groups.some(group => group.id === id)) {
        return {
          ...prev,
          groups: prev.groups.map(group =>
            group.id === id ? { ...group, ...updates } : group
          ),
        }
      } else if (prev.helpers.some(helper => helper.id === id)) {
        return {
          ...prev,
          helpers: prev.helpers.map(helper =>
            helper.id === id ? { ...helper, ...updates } : helper
          ),
        }
      }
      return prev
    })
  }

  const handleUpdateGroup = (groupId: string, updates: Partial<StageGroup>) => {
    handleUpdateObject(groupId, updates)
  }

  const handleDeleteObject = (id: string) => {
    setStageConfig(prev => ({
      ...prev,
      lights: prev.lights.filter(light => light.id !== id),
      meshes: prev.meshes.filter(mesh => mesh.id !== id),
      groups: prev.groups.filter(group => group.id !== id),
      helpers: prev.helpers.filter(helper => helper.id !== id),
    }))
    if (selectedObjectId === id) {
      setSelectedObjectId(null)
    }
  }

  const selectedObject =
    stageConfig.lights.find(light => light.id === selectedObjectId) ||
    stageConfig.meshes.find(mesh => mesh.id === selectedObjectId) ||
    stageConfig.groups.find(group => group.id === selectedObjectId) ||
    stageConfig.helpers.find(helper => helper.id === selectedObjectId) ||
    null

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

      <div className="editor-container">
        {/* Floating control buttons */}
        <div className={`editor-controls editor-controls-${buttonPosition}`}>
          <Button
            icon="pi pi-th-large"
            className="p-button-rounded editor-control-btn"
            onClick={() => setComponentsWindowVisible(!componentsWindowVisible)}
            tooltip="Components Library"
            tooltipOptions={{
              position: buttonPosition === 'left' ? 'right' : 'left',
            }}
          />
          <Button
            icon="pi pi-sitemap"
            className="p-button-rounded editor-control-btn"
            onClick={() => setHierarchyWindowVisible(!hierarchyWindowVisible)}
            tooltip="Hierarchy"
            tooltipOptions={{
              position: buttonPosition === 'left' ? 'right' : 'left',
            }}
          />
          <Button
            icon="pi pi-sliders-h"
            className="p-button-rounded editor-control-btn"
            onClick={() => setPropertiesWindowVisible(!propertiesWindowVisible)}
            tooltip="Properties"
            tooltipOptions={{
              position: buttonPosition === 'left' ? 'right' : 'left',
            }}
          />
          <Button
            icon="pi pi-code"
            className="p-button-rounded editor-control-btn"
            onClick={() => setCodeWindowVisible(!codeWindowVisible)}
            tooltip="Generated Code"
            tooltipOptions={{
              position: buttonPosition === 'left' ? 'right' : 'left',
            }}
          />
          <Button
            icon="pi pi-save"
            className="p-button-rounded editor-control-btn"
            onClick={handleSaveStage}
            disabled={isSaving}
            tooltip={isSaving ? 'Saving...' : 'Save Stage'}
            tooltipOptions={{
              position: buttonPosition === 'left' ? 'right' : 'left',
            }}
          />
        </div>

        <EditorCanvas
          stageConfig={stageConfig}
          selectedObjectId={selectedObjectId}
          onSelectObject={setSelectedObjectId}
        />
      </div>

      {/* Floating Windows */}
      <ComponentLibraryWindow
        visible={componentsWindowVisible}
        onClose={() => setComponentsWindowVisible(false)}
        side={side}
        onAddComponent={handleAddComponent}
      />
      <StageHierarchyWindow
        visible={hierarchyWindowVisible}
        onClose={() => setHierarchyWindowVisible(false)}
        side={side}
        stageConfig={stageConfig}
        selectedObjectId={selectedObjectId}
        onSelectObject={setSelectedObjectId}
        onDeleteObject={handleDeleteObject}
        onUpdateGroup={handleUpdateGroup}
      />
      <PropertyPanelWindow
        visible={propertiesWindowVisible}
        onClose={() => setPropertiesWindowVisible(false)}
        side={side}
        selectedObject={selectedObject}
        onUpdateObject={handleUpdateObject}
        onDeleteObject={handleDeleteObject}
      />
      <CodePanelWindow
        visible={codeWindowVisible}
        onClose={() => setCodeWindowVisible(false)}
        side={side}
        stageConfig={stageConfig}
      />
    </div>
  )
}

export default StageEditor
