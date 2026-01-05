import { useState, useEffect, useRef, JSX, useCallback } from 'react'
import './ModelList.css'
// eslint-disable-next-line no-restricted-imports -- ModelList needs direct API access for fetching models
import ApiClient from '../../../services/ApiClient'
import { Toast } from 'primereact/toast'
import {
  useFileUpload,
  useDragAndDrop,
} from '../../../shared/hooks/useFileUpload'
import { useTabContext } from '../../../hooks/useTabContext'
import { TabContextValue } from '../../../contexts/TabContext'
import { Model } from '../../../utils/fileUtils'
import { useApiCache } from '../../../hooks/useApiCache'
import { useThumbnailSignalR } from '../../thumbnail/hooks/useThumbnailSignalR'
import ModelListHeader from './ModelListHeader'
import UploadProgress from './UploadProgress'
import LoadingState from './LoadingState'
import ErrorState from './ErrorState'
import EmptyState from './EmptyState'
import ModelGrid from './ModelGrid'
import { PackDto, ProjectDto } from '../../../types'
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'

interface ModelListProps {
  onBackToUpload?: () => void
  isTabContent?: boolean
}

function ModelList({
  onBackToUpload,
  isTabContent = false,
}: ModelListProps): JSX.Element {
  // To avoid conditional hook usage, we need to restructure
  // For now, we'll use a wrapper component approach
  if (isTabContent) {
    return <ModelListWithTabContext onBackToUpload={onBackToUpload} />
  }

  return (
    <ModelListContent
      onBackToUpload={onBackToUpload}
      tabContext={null}
      isTabContent={false}
    />
  )
}

// Wrapper component for tab context
function ModelListWithTabContext({
  onBackToUpload,
}: {
  onBackToUpload?: () => void
}): JSX.Element {
  const tabContext = useTabContext()
  return (
    <ModelListContent
      onBackToUpload={onBackToUpload}
      tabContext={tabContext}
      isTabContent={true}
    />
  )
}

// Main component content
function ModelListContent({
  onBackToUpload,
  tabContext,
  isTabContent,
}: {
  onBackToUpload?: () => void
  tabContext: TabContextValue | null
  isTabContent: boolean
}): JSX.Element {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [packs, setPacks] = useState<PackDto[]>([])
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [selectedPackIds, setSelectedPackIds] = useState<number[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([])
  const toast = useRef<Toast>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { refreshModels } = useApiCache()

  // Initialize SignalR connection for real-time thumbnail updates
  const modelIds = models.map(m => m.id)
  useThumbnailSignalR(modelIds)

  // Use the file upload hook with Three.js renderability requirement
  const { uploading, uploadProgress, uploadMultipleFiles } = useFileUpload({
    requireThreeJSRenderable: true,
    toast,
    onSuccess: () => {
      // Refresh the models list after successful upload
      fetchModels()
    },
  })

  // Use drag and drop hook
  const { onDrop, onDragOver, onDragEnter, onDragLeave } =
    useDragAndDrop(uploadMultipleFiles)

  // Fetch packs and projects for filtering
  const fetchFilterOptions = useCallback(async () => {
    try {
      const [packsData, projectsData] = await Promise.all([
        ApiClient.getAllPacks(),
        ApiClient.getAllProjects(),
      ])
      setPacks(packsData)
      setProjects(projectsData)
    } catch (err) {
      console.error('Failed to fetch filter options:', err)
    }
  }, [])

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true)
      
      // For multiselect, we need to handle multiple selections
      // The API currently only supports single packId or projectId
      // So we fetch for the first selected pack/project if any
      const options: { packId?: number; projectId?: number } = {}
      if (selectedPackIds.length > 0) {
        // Use first selected pack for now (API limitation)
        options.packId = selectedPackIds[0]
      } else if (selectedProjectIds.length > 0) {
        // Use first selected project for now (API limitation)
        options.projectId = selectedProjectIds[0]
      }
      
      const models = await ApiClient.getModels(options)
      setModels(models)
    } catch (err) {
      setError(
        `Failed to fetch models: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    } finally {
      setLoading(false)
    }
  }, [selectedPackIds, selectedProjectIds])

  useEffect(() => {
    fetchFilterOptions()
  }, [fetchFilterOptions])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const handleRefresh = async () => {
    refreshModels() // Invalidate cache
    await fetchModels() // Fetch fresh data
    toast.current?.show({
      severity: 'success',
      summary: 'Refreshed',
      detail: 'Models list has been refreshed',
      life: 2000,
    })
  }

  const handleModelRecycled = (modelId: number) => {
    // Remove the recycled model from the list without making a new request
    setModels(prevModels => prevModels.filter(m => m.id !== modelId))
  }

  const handleModelSelect = (model: Model) => {
    if (isTabContent && tabContext) {
      // Open model details in new tab
      tabContext.openModelDetailsTab(model.id, model.name)
    } else {
      // For backward compatibility when not in tab mode - just log for now
      console.log('Model selected:', model)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadMultipleFiles(Array.from(e.target.files))
      // Reset input so the same file can be uploaded again if needed
      e.target.value = ''
    }
  }

  const handlePackFilterChange = (packIds: number[]) => {
    setSelectedPackIds(packIds)
    // Clear project selection when pack is selected (they are mutually exclusive for now)
    if (packIds.length > 0) {
      setSelectedProjectIds([])
    }
  }

  const handleProjectFilterChange = (projectIds: number[]) => {
    setSelectedProjectIds(projectIds)
    // Clear pack selection when project is selected (they are mutually exclusive for now)
    if (projectIds.length > 0) {
      setSelectedPackIds([])
    }
  }

  // Build contextual message for empty state
  const getEmptyStateMessage = () => {
    if (selectedPackIds.length > 0) {
      const packName = packs.find(p => p.id === selectedPackIds[0])?.name
      return `No models in pack "${packName}"`
    } else if (selectedProjectIds.length > 0) {
      const projectName = projects.find(p => p.id === selectedProjectIds[0])?.name
      return `No models in project "${projectName}"`
    }
    return undefined
  }

  return (
    <div className={`model-list ${isTabContent ? 'model-list-tab' : ''}`}>
      <Toast ref={toast} />

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        multiple
        onChange={handleFileChange}
        accept=".obj,.fbx,.gltf,.glb"
      />

      <ModelListHeader
        isTabContent={isTabContent}
        onBackToUpload={onBackToUpload}
        onUpload={handleUploadClick}
        onRefresh={handleRefresh}
        modelCount={models.length}
      />

      <UploadProgress visible={uploading} progress={uploadProgress} />

      <LoadingState visible={loading} />

      <ErrorState
        visible={!!error && !loading}
        error={error}
        onRetry={fetchModels}
      />

      <EmptyState
        visible={!loading && !error && models.length === 0}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        customMessage={getEmptyStateMessage()}
      />

      {!loading && !error && models.length > 0 && (
        <ModelGrid
          models={models}
          onModelSelect={handleModelSelect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onModelRecycled={handleModelRecycled}
          packs={packs}
          projects={projects}
          selectedPackIds={selectedPackIds}
          selectedProjectIds={selectedProjectIds}
          onPackFilterChange={handlePackFilterChange}
          onProjectFilterChange={handleProjectFilterChange}
        />
      )}
    </div>
  )
}

export default ModelList
