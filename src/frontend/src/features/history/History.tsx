import { useState, useEffect } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Card } from 'primereact/card'
import { Tag } from 'primereact/tag'
import { Button } from 'primereact/button'
import ApiClient from '../../services/ApiClient'
import './History.css'

interface BatchUploadHistory {
  id: number
  batchId: string
  uploadType: string
  uploadedAt: string
  fileId: number
  fileName: string
  packId: number | null
  packName: string | null
  modelId: number | null
  modelName: string | null
  textureSetId: number | null
  textureSetName: string | null
}

export default function History() {
  const [history, setHistory] = useState<BatchUploadHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    try {
      setLoading(true)
      const response = await ApiClient.getBatchUploadHistory()
      setHistory(response.uploads || [])
    } catch (error) {
      console.error('Failed to load upload history:', error)
    } finally {
      setLoading(false)
    }
  }

  const uploadTypeTemplate = (rowData: BatchUploadHistory) => {
    const severityMap: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
      model: 'success',
      pack: 'info',
      textureSet: 'warning',
      file: 'danger',
    }

    return (
      <Tag
        value={rowData.uploadType}
        severity={severityMap[rowData.uploadType] || 'info'}
      />
    )
  }

  const dateTemplate = (rowData: BatchUploadHistory) => {
    const date = new Date(rowData.uploadedAt)
    return date.toLocaleString()
  }

  const assignmentTemplate = (rowData: BatchUploadHistory) => {
    const assignments = []

    if (rowData.modelId && rowData.modelName) {
      assignments.push(`Model: ${rowData.modelName}`)
    }
    if (rowData.packId && rowData.packName) {
      assignments.push(`Pack: ${rowData.packName}`)
    }
    if (rowData.textureSetId && rowData.textureSetName) {
      assignments.push(`Texture Set: ${rowData.textureSetName}`)
    }

    if (assignments.length === 0) {
      return <span className="text-muted">Not assigned</span>
    }

    return (
      <div className="assignment-list">
        {assignments.map((assignment, index) => (
          <div key={index} className="assignment-item">
            {assignment}
          </div>
        ))}
      </div>
    )
  }

  const header = (
    <div className="history-header">
      <h2>Upload History</h2>
      <Button
        icon="pi pi-refresh"
        onClick={loadHistory}
        loading={loading}
        tooltip="Refresh history"
      />
    </div>
  )

  return (
    <div className="history-container">
      <Card>
        <DataTable
          value={history}
          loading={loading}
          header={header}
          paginator
          rows={25}
          rowsPerPageOptions={[10, 25, 50, 100]}
          sortField="uploadedAt"
          sortOrder={-1}
          stripedRows
          emptyMessage="No upload history found"
        >
          <Column
            field="fileName"
            header="File Name"
            sortable
            style={{ minWidth: '200px' }}
          />
          <Column
            field="uploadType"
            header="Type"
            body={uploadTypeTemplate}
            sortable
            style={{ width: '120px' }}
          />
          <Column
            field="uploadedAt"
            header="Uploaded At"
            body={dateTemplate}
            sortable
            style={{ width: '180px' }}
          />
          <Column
            header="Assigned To"
            body={assignmentTemplate}
            style={{ minWidth: '250px' }}
          />
          <Column
            field="batchId"
            header="Batch ID"
            sortable
            style={{ width: '150px' }}
          />
        </DataTable>
      </Card>
    </div>
  )
}
