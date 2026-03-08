import './SceneEditor.css'

import { Toast } from 'primereact/toast'
import { useEffect } from 'react'

import { useTabContext } from '@/hooks/useTabContext'

import { useSceneActions } from '../hooks/useSceneActions'
import { useSceneState } from '../hooks/useSceneState'
import { EditorLayout } from './EditorLayout'

export type { ComponentType } from './ComponentLibrary'

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

export function StageEditor({ stageId }: StageEditorProps = {}) {
  const { side } = useTabContext()

  const state = useSceneState(stageId)
  const {
    stageConfig,
    selectedObjectId,
    selectedObject,
    isSaving,
    isLoading,
    componentsWindowVisible,
    setComponentsWindowVisible,
    propertiesWindowVisible,
    setPropertiesWindowVisible,
    codeWindowVisible,
    setCodeWindowVisible,
    hierarchyWindowVisible,
    setHierarchyWindowVisible,
    toast,
    loadStageById,
    setSelectedObjectId,
    setStageConfig,
    currentStageId,
    setCurrentStageId,
    stageName,
    setIsSaving,
  } = state

  const {
    handleAddComponent,
    handleUpdateObject,
    handleUpdateGroup,
    handleDeleteObject,
    handleSaveStage,
  } = useSceneActions({
    stageConfig,
    setStageConfig,
    selectedObjectId,
    setSelectedObjectId,
    currentStageId,
    setCurrentStageId,
    stageName,
    setIsSaving,
    toast,
  })

  useEffect(() => {
    if (stageId) {
      loadStageById(parseInt(stageId, 10))
    }
  }, [stageId, loadStageById])

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
      <EditorLayout
        side={side}
        stageConfig={stageConfig}
        selectedObjectId={selectedObjectId}
        selectedObject={selectedObject}
        isSaving={isSaving}
        componentsWindowVisible={componentsWindowVisible}
        setComponentsWindowVisible={setComponentsWindowVisible}
        propertiesWindowVisible={propertiesWindowVisible}
        setPropertiesWindowVisible={setPropertiesWindowVisible}
        codeWindowVisible={codeWindowVisible}
        setCodeWindowVisible={setCodeWindowVisible}
        hierarchyWindowVisible={hierarchyWindowVisible}
        setHierarchyWindowVisible={setHierarchyWindowVisible}
        onSelectObject={setSelectedObjectId}
        onAddComponent={handleAddComponent}
        onUpdateObject={handleUpdateObject}
        onUpdateGroup={handleUpdateGroup}
        onDeleteObject={handleDeleteObject}
        onSaveStage={handleSaveStage}
      />
    </div>
  )
}
