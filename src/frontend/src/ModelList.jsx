import { useState, useEffect, useRef } from 'react'
import './ModelList.css'
import ModelViewer from './ModelViewer'
import ApiClient from './services/ApiClient'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { Toast } from 'primereact/toast'
import { ProgressBar } from 'primereact/progressbar'
import { 
  getFileExtension, 
  getFileName, 
  getModelFileFormat, 
  formatFileSize,
  isThreeJSRenderable,
  isSupportedModelFormat 
} from './utils/fileUtils'
import 'primereact/resources/themes/lara-light-blue/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'

function ModelList({ onBackToUpload }) {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const toast = useRef(null)
  const dt = useRef(null)

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

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return

    setUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        
        // Check if file type is supported
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase()
        
        if (!isSupportedModelFormat(fileExtension)) {
          toast.current.show({
            severity: 'warn', 
            summary: 'Unsupported File', 
            detail: `File ${file.name} is not a supported 3D model format`
          })
          continue
        }

        // Check if file is renderable by Three.js (for models being added to DataTable)
        if (!isThreeJSRenderable(fileExtension)) {
          toast.current.show({
            severity: 'warn', 
            summary: 'Non-renderable Format', 
            detail: `File ${file.name} (${fileExtension.toUpperCase()}) is supported but not renderable in 3D viewer. Use the upload page for this file type.`
          })
          continue
        }

        setUploadProgress(((i) / files.length) * 100)

        const result = await ApiClient.uploadModel(file)
        
        if (result.isSuccess) {
          toast.current.show({
            severity: 'success', 
            summary: 'Upload Successful', 
            detail: `${file.name} uploaded successfully`
          })
        } else {
          toast.current.show({
            severity: 'error', 
            summary: 'Upload Failed', 
            detail: `Failed to upload ${file.name}: ${result.error?.message || 'Unknown error'}`
          })
        }
      }
      
      setUploadProgress(100)
      // Refresh the models list
      await fetchModels()
      
    } catch (err) {
      toast.current.show({
        severity: 'error', 
        summary: 'Upload Error', 
        detail: err.message
      })
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    handleFileUpload(files)
  }

  const onDragOver = (e) => {
    e.preventDefault()
  }

  const onDragEnter = (e) => {
    e.preventDefault()
  }

  const handleModelSelect = (model) => {
    setSelectedModel(model)
  }

  const handleBackToList = () => {
    setSelectedModel(null)
  }

  // Template functions for DataTable columns
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
        tooltip="View Model"
      />
    )
  }

  if (selectedModel) {
    return (
      <ModelViewer 
        model={selectedModel} 
        onBack={handleBackToList}
      />
    )
  }

  return (
    <div className="model-list">
      <Toast ref={toast} />
      
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
        <div className="empty-state">
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