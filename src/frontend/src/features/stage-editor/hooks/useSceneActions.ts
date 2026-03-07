import { useCallback, type RefObject } from 'react'
import type { Toast } from 'primereact/toast'

import { createStage, updateStage } from '@/features/stage-editor/api/stageApi'
import type { ComponentType } from '@/features/stage-editor/components/ComponentLibrary'
import type {
  StageConfig,
  StageGroup,
  StageHelper,
  StageLight,
  StageMesh,
  StageObject,
} from '@/features/stage-editor/components/SceneEditor'

interface UseSceneActionsOptions {
  stageConfig: StageConfig
  setStageConfig: React.Dispatch<React.SetStateAction<StageConfig>>
  selectedObjectId: string | null
  setSelectedObjectId: (id: string | null) => void
  currentStageId: number | null
  setCurrentStageId: (id: number | null) => void
  stageName: string
  setIsSaving: (saving: boolean) => void
  toast: RefObject<Toast | null>
}

export function useSceneActions({
  stageConfig,
  setStageConfig,
  selectedObjectId,
  setSelectedObjectId,
  currentStageId,
  setCurrentStageId,
  stageName,
  setIsSaving,
  toast,
}: UseSceneActionsOptions) {
  const handleAddComponent = useCallback(
    (category: ComponentType, type: string) => {
      const timestamp = Date.now()
      const id = `${category}-${timestamp}`

      if (category === 'light') {
        const newLight: StageLight = {
          id,
          type: type as StageLight['type'],
          color: '#ffffff',
          intensity: type === 'ambient' ? 0.5 : 1.0,
          ...(type !== 'ambient' &&
            type !== 'hemisphere' && {
              position: [5, 5, 5] as [number, number, number],
            }),
          ...(type === 'directional' && {
            target: [0, 0, 0] as [number, number, number],
          }),
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
        setStageConfig(prev => ({ ...prev, meshes: [...prev.meshes, newMesh] }))
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
    },
    [setStageConfig, setSelectedObjectId]
  )

  const handleUpdateObject = useCallback(
    (id: string, updates: Partial<StageObject>) => {
      setStageConfig(prev => {
        if (prev.lights.some(l => l.id === id)) {
          return {
            ...prev,
            lights: prev.lights.map(l =>
              l.id === id ? ({ ...l, ...updates } as StageLight) : l
            ),
          }
        } else if (prev.meshes.some(m => m.id === id)) {
          return {
            ...prev,
            meshes: prev.meshes.map(m =>
              m.id === id ? ({ ...m, ...updates } as StageMesh) : m
            ),
          }
        } else if (prev.groups.some(g => g.id === id)) {
          return {
            ...prev,
            groups: prev.groups.map(g =>
              g.id === id ? ({ ...g, ...updates } as StageGroup) : g
            ),
          }
        } else if (prev.helpers.some(h => h.id === id)) {
          return {
            ...prev,
            helpers: prev.helpers.map(h =>
              h.id === id ? ({ ...h, ...updates } as StageHelper) : h
            ),
          }
        }
        return prev
      })
    },
    [setStageConfig]
  )

  const handleUpdateGroup = useCallback(
    (groupId: string, updates: Partial<StageGroup>) => {
      handleUpdateObject(groupId, updates)
    },
    [handleUpdateObject]
  )

  const handleDeleteObject = useCallback(
    (id: string) => {
      setStageConfig(prev => ({
        ...prev,
        lights: prev.lights.filter(l => l.id !== id),
        meshes: prev.meshes.filter(m => m.id !== id),
        groups: prev.groups.filter(g => g.id !== id),
        helpers: prev.helpers.filter(h => h.id !== id),
      }))
      if (selectedObjectId === id) {
        setSelectedObjectId(null)
      }
    },
    [selectedObjectId, setSelectedObjectId, setStageConfig]
  )

  const handleSaveStage = useCallback(async () => {
    setIsSaving(true)
    try {
      const configJson = JSON.stringify(stageConfig)
      if (currentStageId) {
        await updateStage(currentStageId, configJson)
        toast.current?.show({
          severity: 'success',
          summary: 'Success',
          detail: 'Stage updated successfully',
          life: 3000,
        })
      } else {
        const response = await createStage(stageName, configJson)
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
  }, [
    stageConfig,
    currentStageId,
    stageName,
    setIsSaving,
    setCurrentStageId,
    toast,
  ])

  return {
    handleAddComponent,
    handleUpdateObject,
    handleUpdateGroup,
    handleDeleteObject,
    handleSaveStage,
  }
}
