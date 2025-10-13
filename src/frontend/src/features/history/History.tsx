import { useState, useEffect } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { Tag } from 'primereact/tag'
import ApiClient from '../../services/ApiClient'
import { useTabContext } from '../../hooks/useTabContext'
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
  const { openModelDetailsTab, openTextureSetDetailsTab, openPackDetailsTab } =
    useTabContext()

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
    const severityMap: Record<
      string,
      'success' | 'info' | 'warning' | 'danger' | undefined
    > = {
      model: 'success',
      pack: 'info',
      textureSet: 'warning',
      texture: 'warning',
      file: undefined,
    }

    const labelMap: Record<string, string> = {
      model: 'Model',
      pack: 'Pack',
      textureSet: 'Texture Set',
      texture: 'Texture',
      file: 'File',
    }

    return (
      <Tag
        value={labelMap[rowData.uploadType] || rowData.uploadType}
        severity={severityMap[rowData.uploadType]}
      />
    )
  }

  const dateTemplate = (rowData: BatchUploadHistory) => {
    const date = new Date(rowData.uploadedAt)
    return (
      <div>
        <div>{date.toLocaleDateString()}</div>
        <div className="text-muted" style={{ fontSize: '0.85rem' }}>
          {date.toLocaleTimeString()}
        </div>
      </div>
    )
  }

  const assignmentTemplate = (rowData: BatchUploadHistory) => {
    const hasAssignment =
      rowData.modelId || rowData.packId || rowData.textureSetId

    if (!hasAssignment) {
      return <span className="text-muted">Not assigned</span>
    }

    return (
      <div className="assignment-list">
        {rowData.modelId && rowData.modelName && (
          <div className="assignment-item">
            <i className="pi pi-box"></i>
            <span>Model: {rowData.modelName}</span>
          </div>
        )}
        {rowData.packId && rowData.packName && (
          <div className="assignment-item">
            <i className="pi pi-inbox"></i>
            <span>Pack: {rowData.packName}</span>
          </div>
        )}
        {rowData.textureSetId && rowData.textureSetName && (
          <div className="assignment-item">
            <i className="pi pi-image"></i>
            <span>Texture Set: {rowData.textureSetName}</span>
          </div>
        )}
      </div>
    )
  }

  const actionsTemplate = (rowData: BatchUploadHistory) => {
    return (
      <div className="history-actions">
        {rowData.modelId && (
          <Button
            icon="pi pi-box"
            className="p-button-text p-button-rounded p-button-sm"
            onClick={() => openModelDetailsTab(rowData.modelId!.toString())}
            tooltip="Open Model"
            tooltipOptions={{ position: 'left' }}
          />
        )}
        {rowData.textureSetId && (
          <Button
            icon="pi pi-image"
            className="p-button-text p-button-rounded p-button-sm"
            onClick={() =>
              openTextureSetDetailsTab(rowData.textureSetId!.toString())
            }
            tooltip="Open Texture Set"
            tooltipOptions={{ position: 'left' }}
          />
        )}
        {rowData.packId && (
          <Button
            icon="pi pi-inbox"
            className="p-button-text p-button-rounded p-button-sm"
            onClick={() => openPackDetailsTab(rowData.packId!.toString())}
            tooltip="Open Pack"
            tooltipOptions={{ position: 'left' }}
          />
        )}
      </div>
    )
  }

  const batchIdTemplate = (rowData: BatchUploadHistory) => {
    return (
      <code className="batch-id-code">
        {rowData.batchId.substring(0, 8)}...
      </code>
    )
  }

  return (
    <div className="history-container">
      <div className="history-toolbar">
        <h2>Upload History</h2>
        <Button
          icon="pi pi-refresh"
          className="p-button-text"
          onClick={loadHistory}
          loading={loading}
          tooltip="Refresh history"
        />
      </div>

      <DataTable
        value={history}
        loading={loading}
        paginator
        rows={25}
        rowsPerPageOptions={[10, 25, 50, 100]}
        sortField="uploadedAt"
        sortOrder={-1}
        stripedRows
        emptyMessage="No upload history found"
        rowGroupMode="subheader"
        groupRowsBy="batchId"
        sortMode="single"
        rowClassName={() => 'history-row'}
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
          header="Uploaded"
          body={dateTemplate}
          sortable
          style={{ width: '150px' }}
        />
        <Column
          header="Assigned To"
          body={assignmentTemplate}
          style={{ minWidth: '200px' }}
        />
        <Column
          field="batchId"
          header="Batch"
          body={batchIdTemplate}
          sortable
          style={{ width: '120px' }}
        />
        <Column
          header="Actions"
          body={actionsTemplate}
          style={{ width: '120px' }}
        />
      </DataTable>
    </div>
  )
}
