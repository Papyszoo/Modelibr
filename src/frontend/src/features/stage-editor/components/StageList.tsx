import { useState, useEffect, useCallback, useRef } from 'react'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useTabContext } from '../../../hooks/useTabContext'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import StageGrid from './StageGrid'
import StageListHeader from './StageListHeader'
import CreateStageDialog from './CreateStageDialog'
import './StageList.css'

interface StageDto {
  id: number
  name: string
  createdAt: string
  updatedAt: string
}

function StageList() {
  const [stages, setStages] = useState<StageDto[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const { openTab } = useTabContext()

  const loadStages = useCallback(async () => {
    try {
      setLoading(true)
      const response = await ApiClient.getAllStages()
      setStages(response.stages || [])
    } catch (error) {
      console.error('Failed to load stages:', error)
      setStages([])
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load stages',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStages()
  }, [loadStages])

  const handleCreateStage = async (name: string) => {
    try {
      // Create with minimal config
      const defaultConfig = JSON.stringify({
        lights: [],
        components: [],
      })
      await ApiClient.createStage(name, defaultConfig)
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Stage created successfully',
        life: 3000,
      })
      loadStages()
      setShowCreateDialog(false)
    } catch (error) {
      console.error('Failed to create stage:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create stage',
        life: 3000,
      })
    }
  }

  const handleDeleteStage = (stage: StageDto) => {
    confirmDialog({
      message: `Are you sure you want to delete the stage "${stage.name}"?`,
      header: 'Delete Confirmation',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          // TODO: Add delete endpoint to API
          toast.current?.show({
            severity: 'info',
            summary: 'Info',
            detail: 'Delete functionality coming soon',
            life: 3000,
          })
        } catch (error) {
          console.error('Failed to delete stage:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to delete stage',
            life: 3000,
          })
        }
      },
    })
  }

  const handleEditStage = (stage: StageDto) => {
    // Open stage editor in a new tab
    openTab({
      id: `stage-editor-${stage.id}`,
      type: 'stageEditor',
      label: stage.name,
      stageId: stage.id.toString(),
    })
  }

  return (
    <div className="stage-list-container">
      <Toast ref={toast} />
      <ConfirmDialog />
      
      <StageListHeader onCreateClick={() => setShowCreateDialog(true)} />
      
      <StageGrid
        stages={stages}
        loading={loading}
        onStageSelect={handleEditStage}
        onStageDelete={handleDeleteStage}
      />

      <CreateStageDialog
        visible={showCreateDialog}
        onHide={() => setShowCreateDialog(false)}
        onCreate={handleCreateStage}
      />
    </div>
  )
}

export default StageList
