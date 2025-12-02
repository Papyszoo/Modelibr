import { useState, useEffect, useRef } from 'react'
import { DataTable } from 'primereact/datatable'
import { Column } from 'primereact/column'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import ApiClient from '../../../services/ApiClient'
import './RecycledFilesList.css'

interface RecycledItem {
  id: number
  name: string
  type: 'model' | 'modelVersion' | 'file' | 'textureSet' | 'texture'
  deletedAt: string
  fileCount?: number
  textureCount?: number
}

export default function RecycledFilesList() {
  const [items, setItems] = useState<RecycledItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deletePreview, setDeletePreview] = useState<any>(null)
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadRecycledFiles()
  }, [])

  const loadRecycledFiles = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getAllRecycledFiles()
      
      const allItems: RecycledItem[] = [
        ...data.models.map(m => ({
          id: m.id,
          name: m.name,
          type: 'model' as const,
          deletedAt: m.deletedAt,
          fileCount: m.fileCount,
        })),
        ...data.modelVersions.map(v => ({
          id: v.id,
          name: `Version ${v.versionNumber}${v.description ? ` - ${v.description}` : ''}`,
          type: 'modelVersion' as const,
          deletedAt: v.deletedAt,
          fileCount: v.fileCount,
        })),
        ...data.files.map(f => ({
          id: f.id,
          name: f.originalFileName,
          type: 'file' as const,
          deletedAt: f.deletedAt,
        })),
        ...data.textureSets.map(ts => ({
          id: ts.id,
          name: ts.name,
          type: 'textureSet' as const,
          deletedAt: ts.deletedAt,
          textureCount: ts.textureCount,
        })),
        ...data.textures.map(t => ({
          id: t.id,
          name: `Texture ${t.id} - ${t.textureType}`,
          type: 'texture' as const,
          deletedAt: t.deletedAt,
        })),
      ]
      
      setItems(allItems)
    } catch (error) {
      console.error('Failed to load recycled files:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load recycled files',
        life: 3000,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (item: RecycledItem) => {
    try {
      await ApiClient.restoreEntity(item.type, item.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Restored',
        detail: `${item.name} has been restored`,
        life: 3000,
      })
      loadRecycledFiles()
    } catch (error) {
      console.error('Failed to restore:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to restore item',
        life: 3000,
      })
    }
  }

  const handleDeletePreview = async (item: RecycledItem) => {
    try {
      const preview = await ApiClient.getDeletePreview(item.type, item.id)
      setDeletePreview({ ...preview, item })
      setShowPreviewDialog(true)
    } catch (error) {
      console.error('Failed to load delete preview:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load delete preview',
        life: 3000,
      })
    }
  }

  const handlePermanentDelete = async () => {
    if (!deletePreview) return

    try {
      await ApiClient.permanentlyDeleteEntity(
        deletePreview.item.type,
        deletePreview.item.id
      )
      toast.current?.show({
        severity: 'success',
        summary: 'Deleted',
        detail: `${deletePreview.item.name} has been permanently deleted`,
        life: 3000,
      })
      setShowPreviewDialog(false)
      setDeletePreview(null)
      loadRecycledFiles()
    } catch (error) {
      console.error('Failed to permanently delete:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to permanently delete item',
        life: 3000,
      })
    }
  }

  const actionBodyTemplate = (rowData: RecycledItem) => {
    return (
      <div className="flex gap-2">
        <Button
          icon="pi pi-replay"
          className="p-button-success p-button-sm"
          onClick={() => handleRestore(rowData)}
          tooltip="Restore"
          tooltipOptions={{ position: 'top' }}
        />
        <Button
          icon="pi pi-trash"
          className="p-button-danger p-button-sm"
          onClick={() => handleDeletePreview(rowData)}
          tooltip="Delete Forever"
          tooltipOptions={{ position: 'top' }}
        />
      </div>
    )
  }

  const typeBodyTemplate = (rowData: RecycledItem) => {
    const typeLabels = {
      model: 'Model',
      modelVersion: 'Model Version',
      file: 'File',
      textureSet: 'Texture Set',
      texture: 'Texture',
    }
    return typeLabels[rowData.type]
  }

  const dateBodyTemplate = (rowData: RecycledItem) => {
    return new Date(rowData.deletedAt).toLocaleString()
  }

  const infoBodyTemplate = (rowData: RecycledItem) => {
    if (rowData.fileCount !== undefined) {
      return `${rowData.fileCount} file(s)`
    }
    if (rowData.textureCount !== undefined) {
      return `${rowData.textureCount} texture(s)`
    }
    return '-'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <div className="recycled-files-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <div className="recycled-files-header">
        <h2>
          <i className="pi pi-trash mr-2" />
          Recycled Files
        </h2>
        <Button
          icon="pi pi-refresh"
          label="Refresh"
          onClick={loadRecycledFiles}
          className="p-button-outlined"
        />
      </div>

      <DataTable
        value={items}
        loading={loading}
        paginator
        rows={20}
        emptyMessage="No recycled files"
        className="recycled-files-table"
      >
        <Column field="name" header="Name" sortable />
        <Column body={typeBodyTemplate} header="Type" sortable />
        <Column body={infoBodyTemplate} header="Info" />
        <Column body={dateBodyTemplate} header="Deleted At" sortable />
        <Column body={actionBodyTemplate} header="Actions" style={{ width: '150px' }} />
      </DataTable>

      <Dialog
        header="Confirm Permanent Delete"
        visible={showPreviewDialog}
        style={{ width: '600px' }}
        onHide={() => setShowPreviewDialog(false)}
        footer={
          <div>
            <Button
              label="Cancel"
              icon="pi pi-times"
              onClick={() => setShowPreviewDialog(false)}
              className="p-button-text"
            />
            <Button
              label="Delete Forever"
              icon="pi pi-trash"
              onClick={handlePermanentDelete}
              className="p-button-danger"
            />
          </div>
        }
      >
        {deletePreview && (
          <div className="delete-preview">
            <p className="warning-text">
              <i className="pi pi-exclamation-triangle mr-2" />
              This action cannot be undone. The following will be permanently deleted:
            </p>
            
            <h4>Entity: {deletePreview.entityName}</h4>
            
            {deletePreview.relatedEntities.length > 0 && (
              <div className="related-entities">
                <h5>Related Items:</h5>
                <ul>
                  {deletePreview.relatedEntities.map((entity: string, idx: number) => (
                    <li key={idx}>{entity}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {deletePreview.filesToDelete.length > 0 && (
              <div className="files-to-delete">
                <h5>Files to Delete:</h5>
                <ul>
                  {deletePreview.filesToDelete.map((file: any, idx: number) => (
                    <li key={idx}>
                      {file.originalFileName} ({formatFileSize(file.sizeBytes)})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
