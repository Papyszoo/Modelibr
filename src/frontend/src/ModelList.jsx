import { useState, useEffect, useRef } from 'react'
import './ModelList.css'
import ApiClient from './services/ApiClient'
import ThumbnailDisplay from './components/ThumbnailDisplay'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { ProgressBar } from 'primereact/progressbar'
import { useFileUpload, useDragAndDrop } from './hooks/useFileUpload'
import { useTabContext } from './hooks/useTabContext.jsx'
import { 
  getFileExtension,
  formatFileSize
} from './utils/fileUtils'
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'

function ModelList({ onBackToUpload, isTabContent = false }) {
  const [models, setModels] = useState([])
  // Remove selectedModel state since it's not used in tab mode
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const toast = useRef(null)
  const dt = useRef(null)

  // Get tab context if running within a tab
  const tabContext = isTabContent ? useTabContext() : null

  // Use the file upload hook with Three.js renderability requirement
  const { uploading, uploadProgress, uploadMultipleFiles } = useFileUpload({
    requireThreeJSRenderable: true,
    toast,
    onSuccess: () => {
      // Refresh the models list after successful upload
      fetchModels()
    }
  })

  // Use drag and drop hook
  const { onDrop, onDragOver, onDragEnter, onDragLeave } = useDragAndDrop(uploadMultipleFiles)

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      setLoading(true)
      const result = await ApiClient.getModels()
      
      if (result.isSuccess) {
        setModels(result.value?.models || [])
      } else {
        setError(`Failed to fetch models: ${result.error?.message || 'Unknown error'}`)
      }
    } catch (err) {
      setError(`Error fetching models: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleModelSelect = (model) => {
    if (isTabContent && tabContext) {
      // Open model details in new tab
      tabContext.openModelDetailsTab(model)
    } else {
      // For backward compatibility when not in tab mode - just log for now
      console.log('Model selected:', model)
    }
  }

  // Remove the selectedModel check since we're handling navigation differently
  // if (selectedModel) {
  //   return (
  //     <ModelViewer 
  //       model={selectedModel} 
  //       onBack={handleBackToList}
  //     />
  //   )
  // }

  // Template functions for DataTable columns
  const thumbnailBodyTemplate = (rowData) => {
    return (
      <ThumbnailDisplay 
        modelId={rowData.id}
        size="small"
        alt={`Thumbnail for ${rowData.files?.[0]?.originalFileName || `model ${rowData.id}`}`}
      />
    )
  }

  const idBodyTemplate = (rowData) => {
    return `#${rowData.id}`
  }

  const nameBodyTemplate = (rowData) => {
    // Get the first file's name or use the model name
    const fileName = rowData.files && rowData.files.length > 0 
      ? rowData.files[0].originalFileName 
      : rowData.name || `Model ${rowData.id}`
    return fileName
  }

  const filesBodyTemplate = (rowData) => {
    const fileCount = rowData.files ? rowData.files.length : 0
    if (fileCount === 0) return 'No files'
    
    const formats = rowData.files
      .map(f => getFileExtension(f.originalFileName).toUpperCase())
      .join(', ')
    
    return `${fileCount} file${fileCount > 1 ? 's' : ''} (${formats})`
  }

  const sizeBodyTemplate = (rowData) => {
    if (!rowData.files || rowData.files.length === 0) return '-'
    
    const totalSize = rowData.files.reduce((sum, file) => sum + (file.sizeBytes || 0), 0)
    return formatFileSize(totalSize)
  }

  const dateBodyTemplate = (rowData) => {
    return new Date(rowData.createdAt).toLocaleDateString()
  }

  const actionBodyTemplate = (rowData) => {
    return (
      <Button 
        icon="pi pi-eye" 
        className="p-button-text p-button-rounded" 
        onClick={() => handleModelSelect(rowData)}
        tooltip={isTabContent ? "Open in New Tab" : "View Model"}
      />
    )
  }

  return (
    <div className={`model-list ${isTabContent ? 'model-list-tab' : ''}`}>
      <Toast ref={toast} />
      
      {!isTabContent && (
        <header className="model-list-header">
          <div className="header-controls">
            <Button 
              icon="pi pi-upload" 
              label="Upload Page" 
              className="p-button-outlined" 
              onClick={onBackToUpload}
            />
          </div>
          <h1>3D Model Library</h1>
          <p>Drag and drop 3D model files onto the table to upload, or select a model to view in 3D</p>
        </header>
      )}

      {isTabContent && (
        <header className="model-list-header-tab">
          <h1>3D Model Library</h1>
          <div className="model-stats">
            <span className="stat-item">
              <i className="pi pi-box"></i>
              {models.length} models
            </span>
          </div>
        </header>
      )}

      {uploading && (
        <div className="upload-progress">
          <p>Uploading files...</p>
          <ProgressBar value={uploadProgress} />
        </div>
      )}

      {loading && (
        <div className="loading">
          <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
          <p>Loading models...</p>
        </div>
      )}

      {error && (
        <div className="error-message">
          <i className="pi pi-exclamation-triangle"></i>
          <span>{error}</span>
          <Button 
            label="Retry" 
            icon="pi pi-refresh" 
            className="p-button-sm" 
            onClick={fetchModels}
          />
        </div>
      )}

      {!loading && !error && models.length === 0 && (
        <div 
          className="empty-state"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
        >
          <i className="pi pi-box" style={{ fontSize: '4rem', color: 'var(--surface-500)' }}></i>
          <h3>No models found</h3>
          <p>Drag and drop 3D model files here to get started!</p>
        </div>
      )}

      {!loading && !error && models.length > 0 && (
        <div 
          className="datatable-container"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
        >
          <DataTable 
            ref={dt}
            value={models} 
            responsiveLayout="scroll"
            stripedRows
            showGridlines
            paginator 
            rows={10} 
            rowsPerPageOptions={[5, 10, 25, 50]}
            className="model-datatable"
            emptyMessage="No models found"
            globalFilterFields={['name', 'files.originalFileName']}
          >
            <Column 
              header="Preview" 
              body={thumbnailBodyTemplate}
              style={{ width: '80px' }}
            />
            <Column 
              field="id" 
              header="ID" 
              body={idBodyTemplate}
              sortable 
              style={{ width: '80px' }}
            />
            <Column 
              field="name" 
              header="Name" 
              body={nameBodyTemplate}
              sortable 
              style={{ minWidth: '200px' }}
            />
            <Column 
              header="Files" 
              body={filesBodyTemplate}
              style={{ minWidth: '150px' }}
            />
            <Column 
              header="Size" 
              body={sizeBodyTemplate}
              sortable 
              style={{ width: '100px' }}
            />
            <Column 
              field="createdAt" 
              header="Created" 
              body={dateBodyTemplate}
              sortable 
              style={{ width: '120px' }}
            />
            <Column 
              header="Actions" 
              body={actionBodyTemplate}
              style={{ width: '80px' }}
            />
          </DataTable>
        </div>
      )}
    </div>
  )
}

export default ModelList