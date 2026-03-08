import type { Toast } from 'primereact/toast'
import { useCallback, useRef, useState } from 'react'

import { getStageById } from '@/features/stage-editor/api/stageApi'
import type {
  StageConfig,
  StageObject,
} from '@/features/stage-editor/components/SceneEditor'

const EMPTY_CONFIG: StageConfig = {
  lights: [],
  meshes: [],
  groups: [],
  helpers: [],
}

export function useSceneState(stageId?: string) {
  const [stageConfig, setStageConfig] = useState<StageConfig>(EMPTY_CONFIG)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [currentStageId, setCurrentStageId] = useState<number | null>(
    stageId ? parseInt(stageId, 10) : null
  )
  const [stageName, setStageName] = useState('Untitled Stage')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [componentsWindowVisible, setComponentsWindowVisible] = useState(false)
  const [propertiesWindowVisible, setPropertiesWindowVisible] = useState(false)
  const [codeWindowVisible, setCodeWindowVisible] = useState(false)
  const [hierarchyWindowVisible, setHierarchyWindowVisible] = useState(false)
  const toast = useRef<Toast>(null)

  const selectedObject: StageObject | null =
    stageConfig.lights.find(l => l.id === selectedObjectId) ||
    stageConfig.meshes.find(m => m.id === selectedObjectId) ||
    stageConfig.groups.find(g => g.id === selectedObjectId) ||
    stageConfig.helpers.find(h => h.id === selectedObjectId) ||
    null

  const loadStageById = useCallback(async (id: number) => {
    try {
      setIsLoading(true)
      const stage = await getStageById(id)
      setStageName(stage.name)
      setCurrentStageId(stage.id)

      try {
        const config = JSON.parse(stage.configurationJson)
        setStageConfig({
          lights: Array.isArray(config.lights) ? config.lights : [],
          meshes: Array.isArray(config.meshes) ? config.meshes : [],
          groups: Array.isArray(config.groups) ? config.groups : [],
          helpers: Array.isArray(config.helpers) ? config.helpers : [],
        })
      } catch (parseError) {
        console.error('Failed to parse stage configuration:', parseError)
        setStageConfig(EMPTY_CONFIG)
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
  }, [])

  return {
    stageConfig,
    setStageConfig,
    selectedObjectId,
    setSelectedObjectId,
    selectedObject,
    currentStageId,
    setCurrentStageId,
    stageName,
    setStageName,
    isSaving,
    setIsSaving,
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
  }
}
