import { useState, useEffect, useRef } from 'react'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { ConfirmDialog } from 'primereact/confirmdialog'
import { ProgressBar } from 'primereact/progressbar'
// eslint-disable-next-line no-restricted-imports
import ApiClient from '../../../services/ApiClient'
import { ThumbnailDisplay } from '../../thumbnail'
import './RecycledFilesList.css'

interface RecycledModel {
  id: number
  name: string
  deletedAt: string
  fileCount: number
}

interface RecycledTextureSet {
  id: number
  name: string
  deletedAt: string
  textureCount: number
  previewFileId: number | null
}

interface DeletePreviewItem {
  id: number
  name: string
  type: 'model' | 'textureSet'
}

interface DeletePreviewInfo {
  entityName: string
  relatedEntities: string[]
  filesToDelete: Array<{
    filePath: string
    originalFileName: string
    sizeBytes: number
  }>
  item: DeletePreviewItem
}

export default function RecycledFilesList() {
  const [models, setModels] = useState<RecycledModel[]>([])
  const [textureSets, setTextureSets] = useState<RecycledTextureSet[]>([])
  const [loading, setLoading] = useState(true)
  const [deletePreview, setDeletePreview] = useState<DeletePreviewInfo | null>(
    null
  )
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const toast = useRef<Toast>(null)

  useEffect(() => {
    loadRecycledFiles()
  }, [])

  const loadRecycledFiles = async () => {
    try {
      setLoading(true)
      const data = await ApiClient.getAllRecycledFiles()

      setModels(
        data.models.map(m => ({
          id: m.id,
          name: m.name,
          deletedAt: m.deletedAt,
          fileCount: m.fileCount,
        }))
      )

      setTextureSets(
        data.textureSets.map(ts => ({
          id: ts.id,
          name: ts.name,
          deletedAt: ts.deletedAt,
          textureCount: ts.textureCount,
          previewFileId: ts.previewFileId ?? null,
        }))
      )
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

  const handleRestoreModel = async (model: RecycledModel) => {
    try {
      await ApiClient.restoreEntity('model', model.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Restored',
        detail: `${model.name} has been restored`,
        life: 3000,
      })
      setModels(prevModels => prevModels.filter(m => m.id !== model.id))
    } catch (error) {
      console.error('Failed to restore:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to restore model',
        life: 3000,
      })
    }
  }

  const handleRestoreTextureSet = async (textureSet: RecycledTextureSet) => {
    try {
      await ApiClient.restoreEntity('textureSet', textureSet.id)
      toast.current?.show({
        severity: 'success',
        summary: 'Restored',
        detail: `${textureSet.name} has been restored`,
        life: 3000,
      })
      setTextureSets(prevTextureSets =>
        prevTextureSets.filter(ts => ts.id !== textureSet.id)
      )
    } catch (error) {
      console.error('Failed to restore:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to restore texture set',
        life: 3000,
      })
    }
  }

  const handleDeletePreviewModel = async (model: RecycledModel) => {
    try {
      const preview = await ApiClient.getDeletePreview('model', model.id)
      setDeletePreview({ ...preview, item: { ...model, type: 'model' } })
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

  const handleDeletePreviewTextureSet = async (
    textureSet: RecycledTextureSet
  ) => {
    try {
      const preview = await ApiClient.getDeletePreview(
        'textureSet',
        textureSet.id
      )
      setDeletePreview({
        ...preview,
        item: { ...textureSet, type: 'textureSet' },
      })
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

      const deletedItem = deletePreview.item
      if (deletedItem.type === 'model') {
        setModels(prevModels => prevModels.filter(m => m.id !== deletedItem.id))
      } else if (deletedItem.type === 'textureSet') {
        setTextureSets(prevTextureSets =>
          prevTextureSets.filter(ts => ts.id !== deletedItem.id)
        )
      }
      setDeletePreview(null)
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getTexturePreviewUrl = (textureSet: RecycledTextureSet) => {
    if (textureSet.previewFileId) {
      return ApiClient.getFileUrl(textureSet.previewFileId.toString())
    }
    return null
  }

  if (loading) {
    return (
      <div className="recycled-files-list">
        <div className="recycled-files-loading">
          <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
          <p>Loading recycled files...</p>
        </div>
      </div>
    )
  }

  const isEmpty = models.length === 0 && textureSets.length === 0

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

      {isEmpty ? (
        <div className="recycled-files-empty">
          <i className="pi pi-inbox" />
          <h3>No Recycled Items</h3>
          <p>Items you delete will appear here</p>
        </div>
      ) : (
        <div className="recycled-files-content">
          {/* Models Section */}
          {models.length > 0 && (
            <div className="recycled-section">
              <h3 className="recycled-section-title">
                <i className="pi pi-box mr-2" />
                Models ({models.length})
              </h3>
              <div className="recycled-cards-grid">
                {models.map(model => (
                  <div key={model.id} className="recycled-card">
                    <div className="recycled-card-thumbnail">
                      <ThumbnailDisplay modelId={model.id.toString()} />
                      <div className="recycled-card-actions">
                        <Button
                          icon="pi pi-replay"
                          className="p-button-success p-button-rounded"
                          onClick={() => handleRestoreModel(model)}
                          tooltip="Restore"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                        <Button
                          icon="pi pi-trash"
                          className="p-button-danger p-button-rounded"
                          onClick={() => handleDeletePreviewModel(model)}
                          tooltip="Delete Forever"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                      </div>
                      <div className="recycled-card-overlay">
                        <span className="recycled-card-name" title={model.name}>
                          {model.name}
                        </span>
                        <span className="recycled-card-meta">
                          {model.fileCount} file
                          {model.fileCount !== 1 ? 's' : ''} • Deleted{' '}
                          {formatDate(model.deletedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Texture Sets Section */}
          {textureSets.length > 0 && (
            <div className="recycled-section">
              <h3 className="recycled-section-title">
                <i className="pi pi-images mr-2" />
                Texture Sets ({textureSets.length})
              </h3>
              <div className="recycled-cards-grid">
                {textureSets.map(textureSet => {
                  const previewUrl = getTexturePreviewUrl(textureSet)
                  return (
                    <div key={textureSet.id} className="recycled-card">
                      <div className="recycled-card-thumbnail">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={textureSet.name}
                            className="recycled-card-image"
                          />
                        ) : (
                          <div className="texture-set-placeholder">
                            <i className="pi pi-images" />
                          </div>
                        )}
                        <div className="recycled-card-actions">
                          <Button
                            icon="pi pi-replay"
                            className="p-button-success p-button-rounded"
                            onClick={() => handleRestoreTextureSet(textureSet)}
                            tooltip="Restore"
                            tooltipOptions={{ position: 'bottom' }}
                          />
                          <Button
                            icon="pi pi-trash"
                            className="p-button-danger p-button-rounded"
                            onClick={() =>
                              handleDeletePreviewTextureSet(textureSet)
                            }
                            tooltip="Delete Forever"
                            tooltipOptions={{ position: 'bottom' }}
                          />
                        </div>
                        <div className="recycled-card-overlay">
                          <span
                            className="recycled-card-name"
                            title={textureSet.name}
                          >
                            {textureSet.name}
                          </span>
                          <span className="recycled-card-meta">
                            {textureSet.textureCount} texture
                            {textureSet.textureCount !== 1 ? 's' : ''} • Deleted{' '}
                            {formatDate(textureSet.deletedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
              This action cannot be undone. The following will be permanently
              deleted:
            </p>

            <h4>Entity: {deletePreview.entityName}</h4>

            {deletePreview.relatedEntities.length > 0 && (
              <div className="related-entities">
                <h5>Related Items:</h5>
                <ul>
                  {deletePreview.relatedEntities.map(
                    (entity: string, idx: number) => (
                      <li key={idx}>{entity}</li>
                    )
                  )}
                </ul>
              </div>
            )}

            {deletePreview.filesToDelete.length > 0 && (
              <div className="files-to-delete">
                <h5>Files to Delete:</h5>
                <ul>
                  {deletePreview.filesToDelete.map((file, idx: number) => (
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
