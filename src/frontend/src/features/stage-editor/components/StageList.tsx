import { useState, useEffect, useRef } from 'react'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { openTabInPanel } from '@/utils/tabNavigation'
import { createStage } from '@/features/stage-editor/api/stageApi'
import { useStagesQuery } from '@/features/stage-editor/api/queries'
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
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const toast = useRef<Toast>(null)
  const queryClient = useQueryClient()
  const stagesQuery = useStagesQuery()
  const stages: StageDto[] = stagesQuery.data?.stages ?? []
  const loading = stagesQuery.isLoading

  useEffect(() => {
    if (!stagesQuery.error) return

    console.error('Failed to load stages:', stagesQuery.error)
    toast.current?.show({
      severity: 'error',
      summary: 'Error',
      detail: 'Failed to load stages',
      life: 3000,
    })
  }, [stagesQuery.error])

  const createStageMutation = useMutation({
    mutationFn: async (name: string) => {
      const defaultConfig = JSON.stringify({
        lights: [],
        components: [],
      })
      await createStage(name, defaultConfig)
    },
    onSuccess: async () => {
      toast.current?.show({
        severity: 'success',
        summary: 'Success',
        detail: 'Stage created successfully',
        life: 3000,
      })
      await queryClient.invalidateQueries({ queryKey: ['stages'] })
      setShowCreateDialog(false)
    },
    onError: error => {
      console.error('Failed to create stage:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to create stage',
        life: 3000,
      })
    },
  })

  const handleCreateStage = (name: string) => {
    createStageMutation.mutate(name)
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
    openTabInPanel('stageEditor', 'left', stage.id.toString(), stage.name)
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
