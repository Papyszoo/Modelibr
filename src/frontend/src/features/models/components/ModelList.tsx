import { useState, useEffect, useRef, JSX } from 'react'
import './ModelList.css'
import ApiClient from '../../../services/ApiClient'
import { Toast } from 'primereact/toast'
import { useFileUpload, useDragAndDrop } from '../../../shared/hooks/useFileUpload'
import { useTabContext } from '../../../hooks/useTabContext'
import { TabContextValue } from '../../../contexts/TabContext'
import { Model } from '../../../utils/fileUtils'
import ModelListHeader from './ModelListHeader'
import UploadProgress from './UploadProgress'
import LoadingState from './LoadingState'
import ErrorState from './ErrorState'
import EmptyState from './EmptyState'
import ModelGrid from './ModelGrid'
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
  const toast = useRef<Toast>(null)

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

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      setLoading(true)
      const models = await ApiClient.getModels()
      setModels(models)
    } catch (err) {
      setError(
        `Failed to fetch models: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    } finally {
      setLoading(false)
    }
  }

  const handleModelSelect = (model: Model) => {
    if (isTabContent && tabContext) {
      // Open model details in new tab
      tabContext.openModelDetailsTab(model)
    } else {
      // For backward compatibility when not in tab mode - just log for now
      console.log('Model selected:', model)
    }
  }

  return (
    <div className={`model-list ${isTabContent ? 'model-list-tab' : ''}`}>
      <Toast ref={toast} />

      <ModelListHeader
        isTabContent={isTabContent}
        onBackToUpload={onBackToUpload}
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
      />

      {!loading && !error && models.length > 0 && (
        <ModelGrid
          models={models}
          onModelSelect={handleModelSelect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
        />
      )}
    </div>
  )
}

export default ModelList
