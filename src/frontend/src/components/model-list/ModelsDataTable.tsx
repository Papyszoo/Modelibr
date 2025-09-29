import { useRef } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import ThumbnailDisplay from '../ThumbnailDisplay'
import { getFileExtension, formatFileSize, Model } from '../../utils/fileUtils'

interface ModelsDataTableProps {
  models: Model[]
  onModelSelect: (model: Model) => void
  isTabContent: boolean
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}

export default function ModelsDataTable({
  models,
  onModelSelect,
  isTabContent,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
}: ModelsDataTableProps) {
  const dt = useRef<DataTable<Model[]>>(null)

  // Template functions for DataTable columns
  const thumbnailBodyTemplate = (rowData: Model) => {
    return (
      <ThumbnailDisplay
        modelId={rowData.id}
        size="small"
        alt={`Thumbnail for ${rowData.files?.[0]?.originalFileName || `model ${rowData.id}`}`}
      />
    )
  }

  const idBodyTemplate = (rowData: Model) => {
    return `#${rowData.id}`
  }

  const nameBodyTemplate = (rowData: Model) => {
    // Get the first file's name or use the model name
    const fileName =
      rowData.files && rowData.files.length > 0
        ? rowData.files[0].originalFileName
        : rowData.name || `Model ${rowData.id}`
    return fileName
  }

  const filesBodyTemplate = (rowData: Model) => {
    const fileCount = rowData.files ? rowData.files.length : 0
    if (fileCount === 0) return 'No files'

    const formats = rowData.files
      .map(f => getFileExtension(f.originalFileName).toUpperCase())
      .join(', ')

    return `${fileCount} file${fileCount > 1 ? 's' : ''} (${formats})`
  }

  const sizeBodyTemplate = (rowData: Model) => {
    if (!rowData.files || rowData.files.length === 0) return '-'

    const totalSize = rowData.files.reduce(
      (sum, file) => sum + (file.sizeBytes || 0),
      0
    )
    return formatFileSize(totalSize)
  }

  const dateBodyTemplate = (rowData: Model) => {
    return new Date(rowData.createdAt).toLocaleDateString()
  }

  const actionBodyTemplate = (rowData: Model) => {
    return (
      <Button
        icon="pi pi-eye"
        className="p-button-text p-button-rounded"
        onClick={() => onModelSelect(rowData)}
        tooltip={isTabContent ? 'Open in New Tab' : 'View Model'}
      />
    )
  }

  return (
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
  )
}