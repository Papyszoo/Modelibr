import { useState, useEffect, useCallback, useRef } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Toast } from 'primereact/toast'
import { Button } from 'primereact/button'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import './RecycledFilesList.css'

interface RecycledFileDto {
  id: number
  originalFileName: string
  storedFileName: string
  filePath: string
  sha256Hash: string
  sizeBytes: number
  reason: string
  recycledAt: string
  scheduledDeletionAt: string | null
}

function RecycledFilesList() {
  const [files, setFiles] = useState<RecycledFileDto[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useRef<Toast>(null)

  const loadRecycledFiles = useCallback(async () => {
    try {
      setLoading(true)
      const response = await ApiClient.getAllRecycledFiles()
      setFiles(response.recycledFiles || [])
    } catch (error) {
      console.error('Failed to load recycled files:', error)
      setFiles([])
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load recycled files',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRecycledFiles()
  }, [loadRecycledFiles])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const dateBodyTemplate = (rowData: RecycledFileDto) => {
    return formatDate(rowData.recycledAt)
  }

  const scheduledDeletionBodyTemplate = (rowData: RecycledFileDto) => {
    return rowData.scheduledDeletionAt ? formatDate(rowData.scheduledDeletionAt) : 'Not scheduled'
  }

  const sizeBodyTemplate = (rowData: RecycledFileDto) => {
    return formatFileSize(rowData.sizeBytes)
  }

  const header = (
    <div className="recycled-files-header">
      <h2>Recycled Files</h2>
      <Button
        label="Refresh"
        icon="pi pi-refresh"
        onClick={loadRecycledFiles}
        className="p-button-sm"
      />
    </div>
  )

  return (
    <div className="recycled-files-container">
      <Toast ref={toast} />

      <DataTable
        value={files}
        loading={loading}
        header={header}
        emptyMessage="No recycled files found"
        paginator
        rows={20}
        rowsPerPageOptions={[10, 20, 50]}
        sortMode="multiple"
        removableSort
        className="recycled-files-table"
      >
        <Column
          field="originalFileName"
          header="Original File Name"
          sortable
          style={{ minWidth: '200px' }}
        />
        <Column
          field="reason"
          header="Reason"
          sortable
          style={{ minWidth: '250px' }}
        />
        <Column
          field="sizeBytes"
          header="Size"
          body={sizeBodyTemplate}
          sortable
          style={{ width: '100px' }}
        />
        <Column
          field="recycledAt"
          header="Recycled At"
          body={dateBodyTemplate}
          sortable
          style={{ width: '200px' }}
        />
        <Column
          field="scheduledDeletionAt"
          header="Scheduled Deletion"
          body={scheduledDeletionBodyTemplate}
          sortable
          style={{ width: '200px' }}
        />
      </DataTable>
    </div>
  )
}

export default RecycledFilesList
