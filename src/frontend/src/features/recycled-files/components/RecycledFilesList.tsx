import { useState, useRef } from 'react'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Toast } from 'primereact/toast'
import { ConfirmDialog } from 'primereact/confirmdialog'
import { ProgressBar } from 'primereact/progressbar'
import {
  getDeletePreview,
  permanentlyDeleteEntity,
  restoreEntity,
} from '@/features/recycled-files/api/recycledApi'
import { getVersionThumbnailUrl } from '@/features/thumbnail/api/thumbnailApi'
import { getFileUrl } from '@/features/models/api/modelApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRecycledFilesQuery } from '@/features/recycled-files/api/queries'
import { ThumbnailDisplay } from '@/features/thumbnail'
import CardWidthSlider from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { formatDuration } from '@/utils/audioUtils'
import './RecycledFilesList.css'

interface RecycledModel {
  id: number
  name: string
  deletedAt: string
  fileCount: number
}

interface RecycledModelVersion {
  id: number
  modelId: number
  versionNumber: number
  description: string | null
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

interface RecycledSprite {
  id: number
  name: string
  fileId: number
  deletedAt: string
}

interface RecycledSound {
  id: number
  name: string
  fileId: number
  duration: number
  deletedAt: string
}

interface DeletePreviewItem {
  id: number
  name: string
  type: 'model' | 'modelVersion' | 'textureSet' | 'sprite' | 'sound'
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
  const [deletePreview, setDeletePreview] = useState<DeletePreviewInfo | null>(
    null
  )
  const [showPreviewDialog, setShowPreviewDialog] = useState(false)
  const toast = useRef<Toast>(null)

  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.recycledFiles

  const queryClient = useQueryClient()
  const recycledQuery = useRecycledFilesQuery()
  const recycledData = recycledQuery.data
  const models = (recycledData?.models ?? []).map(m => ({
    id: m.id,
    name: m.name,
    deletedAt: m.deletedAt,
    fileCount: m.fileCount,
  }))
  const modelVersions = (recycledData?.modelVersions ?? []).map(v => ({
    id: v.id,
    modelId: v.modelId,
    versionNumber: v.versionNumber,
    description: v.description,
    deletedAt: v.deletedAt,
    fileCount: v.fileCount,
  }))
  const textureSets = (recycledData?.textureSets ?? []).map(ts => ({
    id: ts.id,
    name: ts.name,
    deletedAt: ts.deletedAt,
    textureCount: ts.textureCount,
    previewFileId: ts.previewFileId ?? null,
  }))
  const sprites = (recycledData?.sprites ?? []).map(s => ({
    id: s.id,
    name: s.name,
    fileId: s.fileId,
    deletedAt: s.deletedAt,
  }))
  const sounds = (recycledData?.sounds ?? []).map(s => ({
    id: s.id,
    name: s.name,
    fileId: s.fileId,
    duration: s.duration,
    deletedAt: s.deletedAt,
  }))

  const loadRecycledFiles = () => {
    queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
  }

  type RestoreEntityType =
    | 'model'
    | 'modelVersion'
    | 'textureSet'
    | 'sprite'
    | 'sound'
  type InvalidateKey = readonly unknown[]

  const restoreEntityMutation = useMutation({
    mutationFn: (vars: {
      entityType: RestoreEntityType
      entityId: number
      successDetail: string
      errorDetail: string
      invalidateQueryKeys?: InvalidateKey[]
    }) => restoreEntity(vars.entityType, vars.entityId),
    onSuccess: async (_data, vars) => {
      toast.current?.show({
        severity: 'success',
        summary: 'Restored',
        detail: vars.successDetail,
        life: 3000,
      })

      await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
      for (const key of vars.invalidateQueryKeys ?? []) {
        await queryClient.invalidateQueries({ queryKey: key })
      }
    },
    onError: (error, vars) => {
      console.error('Failed to restore:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: vars.errorDetail,
        life: 3000,
      })
    },
  })

  const deletePreviewMutation = useMutation({
    mutationFn: (vars: {
      entityType: string
      entityId: number
      item: DeletePreviewItem
    }) => getDeletePreview(vars.entityType, vars.entityId),
    onSuccess: (preview, vars) => {
      setDeletePreview({ ...preview, item: vars.item })
      setShowPreviewDialog(true)
    },
    onError: error => {
      console.error('Failed to load delete preview:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load delete preview',
        life: 3000,
      })
    },
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: (vars: { item: DeletePreviewItem }) =>
      permanentlyDeleteEntity(vars.item.type, vars.item.id),
    onSuccess: async (_data, vars) => {
      toast.current?.show({
        severity: 'success',
        summary: 'Deleted',
        detail: `${vars.item.name} has been permanently deleted`,
        life: 3000,
      })
      setShowPreviewDialog(false)

      if (vars.item.type === 'model') {
        await queryClient.invalidateQueries({ queryKey: ['models'] })
      } else if (vars.item.type === 'modelVersion') {
        await queryClient.invalidateQueries({ queryKey: ['models'] })
      } else if (vars.item.type === 'textureSet') {
        await queryClient.invalidateQueries({ queryKey: ['textureSets'] })
      } else if (vars.item.type === 'sprite') {
        await queryClient.invalidateQueries({ queryKey: ['sprites'] })
      } else if (vars.item.type === 'sound') {
        await queryClient.invalidateQueries({ queryKey: ['sounds'] })
      }

      setDeletePreview(null)
      await queryClient.invalidateQueries({ queryKey: ['recycledFiles'] })
    },
    onError: error => {
      console.error('Failed to permanently delete:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to permanently delete item',
        life: 3000,
      })
    },
  })

  const handleRestoreModel = async (model: RecycledModel) => {
    await restoreEntityMutation.mutateAsync({
      entityType: 'model',
      entityId: model.id,
      successDetail: `${model.name} has been restored`,
      errorDetail: 'Failed to restore model',
      invalidateQueryKeys: [['models']],
    })
  }

  const handleRestoreModelVersion = async (version: RecycledModelVersion) => {
    await restoreEntityMutation.mutateAsync({
      entityType: 'modelVersion',
      entityId: version.id,
      successDetail: `Version ${version.versionNumber} has been restored`,
      errorDetail: 'Failed to restore model version',
      invalidateQueryKeys: [['models']],
    })
  }

  const handleRestoreTextureSet = async (textureSet: RecycledTextureSet) => {
    await restoreEntityMutation.mutateAsync({
      entityType: 'textureSet',
      entityId: textureSet.id,
      successDetail: `${textureSet.name} has been restored`,
      errorDetail: 'Failed to restore texture set',
    })
  }

  const handleDeletePreviewModel = async (model: RecycledModel) => {
    deletePreviewMutation.mutate({
      entityType: 'model',
      entityId: model.id,
      item: { ...model, type: 'model' },
    })
  }

  const handleDeletePreviewModelVersion = async (
    version: RecycledModelVersion
  ) => {
    deletePreviewMutation.mutate({
      entityType: 'modelVersion',
      entityId: version.id,
      item: {
        id: version.id,
        name: `Version ${version.versionNumber}`,
        type: 'modelVersion',
      },
    })
  }

  const handleDeletePreviewTextureSet = async (
    textureSet: RecycledTextureSet
  ) => {
    deletePreviewMutation.mutate({
      entityType: 'textureSet',
      entityId: textureSet.id,
      item: { ...textureSet, type: 'textureSet' },
    })
  }

  const handleRestoreSprite = async (sprite: RecycledSprite) => {
    await restoreEntityMutation.mutateAsync({
      entityType: 'sprite',
      entityId: sprite.id,
      successDetail: `${sprite.name} has been restored`,
      errorDetail: 'Failed to restore sprite',
      invalidateQueryKeys: [['sprites']],
    })
  }

  const handleDeletePreviewSprite = async (sprite: RecycledSprite) => {
    deletePreviewMutation.mutate({
      entityType: 'sprite',
      entityId: sprite.id,
      item: { ...sprite, type: 'sprite' },
    })
  }

  const handleRestoreSound = async (sound: RecycledSound) => {
    await restoreEntityMutation.mutateAsync({
      entityType: 'sound',
      entityId: sound.id,
      successDetail: `${sound.name} has been restored`,
      errorDetail: 'Failed to restore sound',
      invalidateQueryKeys: [['sounds']],
    })
  }

  const handleDeletePreviewSound = async (sound: RecycledSound) => {
    deletePreviewMutation.mutate({
      entityType: 'sound',
      entityId: sound.id,
      item: { ...sound, type: 'sound' },
    })
  }

  const handlePermanentDelete = async () => {
    if (!deletePreview) return

    await permanentDeleteMutation.mutateAsync({ item: deletePreview.item })
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
      return getFileUrl(textureSet.previewFileId.toString())
    }
    return null
  }

  if (recycledQuery.isLoading || recycledQuery.isFetching) {
    return (
      <div className="recycled-files-list">
        <div className="recycled-files-loading">
          <ProgressBar mode="indeterminate" style={{ height: '6px' }} />
          <p>Loading recycled files...</p>
        </div>
      </div>
    )
  }

  const isEmpty =
    models.length === 0 &&
    modelVersions.length === 0 &&
    textureSets.length === 0 &&
    sprites.length === 0 &&
    sounds.length === 0

  return (
    <div className="recycled-files-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <div className="recycled-files-header">
        <h2>
          <i className="pi pi-trash" />
          Recycled Files
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <CardWidthSlider
            value={cardWidth}
            min={120}
            max={400}
            onChange={width => setCardWidth('recycledFiles', width)}
          />
          <Button
            icon="pi pi-refresh"
            label="Refresh"
            onClick={loadRecycledFiles}
            className="p-button-outlined"
          />
        </div>
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
                <i className="pi pi-box" />
                Models ({models.length})
              </h3>
              <div
                className="recycled-cards-grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
                }}
              >
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

          {/* Model Versions Section */}
          {modelVersions.length > 0 && (
            <div className="recycled-section">
              <h3 className="recycled-section-title">
                <i className="pi pi-clone" />
                Model Versions ({modelVersions.length})
              </h3>
              <div
                className="recycled-cards-grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
                }}
              >
                {modelVersions.map(version => (
                  <div
                    key={version.id}
                    className="recycled-card"
                    data-model-id={version.modelId}
                  >
                    <div className="recycled-card-thumbnail">
                      <img
                        src={getVersionThumbnailUrl(version.id)}
                        alt={`Version ${version.versionNumber}`}
                        className="recycled-card-image"
                        onError={e => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const placeholder =
                            target.nextElementSibling as HTMLElement
                          if (placeholder) {
                            placeholder.style.display = 'flex'
                          }
                        }}
                      />
                      <div
                        className="version-placeholder"
                        style={{ display: 'none' }}
                      >
                        <i className="pi pi-clone" />
                        <span className="version-number">
                          v{version.versionNumber}
                        </span>
                      </div>
                      <div className="recycled-card-actions">
                        <Button
                          icon="pi pi-replay"
                          className="p-button-success p-button-rounded"
                          onClick={() => handleRestoreModelVersion(version)}
                          tooltip="Restore"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                        <Button
                          icon="pi pi-trash"
                          className="p-button-danger p-button-rounded"
                          onClick={() =>
                            handleDeletePreviewModelVersion(version)
                          }
                          tooltip="Delete Forever"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                      </div>
                      <div className="recycled-card-overlay">
                        <span
                          className="recycled-card-name"
                          title={`Version ${version.versionNumber}${version.description ? ` - ${version.description}` : ''}`}
                        >
                          Version {version.versionNumber}
                          {version.description && (
                            <span className="version-description">
                              {' '}
                              - {version.description}
                            </span>
                          )}
                        </span>
                        <span className="recycled-card-meta">
                          {version.fileCount} file
                          {version.fileCount !== 1 ? 's' : ''} • Deleted{' '}
                          {formatDate(version.deletedAt)}
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
                <i className="pi pi-images" />
                Texture Sets ({textureSets.length})
              </h3>
              <div
                className="recycled-cards-grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
                }}
              >
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

          {/* Sprites Section */}
          {sprites.length > 0 && (
            <div className="recycled-section" data-section="sprites">
              <h3 className="recycled-section-title">
                <i className="pi pi-image" />
                Sprites ({sprites.length})
              </h3>
              <div
                className="recycled-cards-grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
                }}
              >
                {sprites.map(sprite => (
                  <div key={sprite.id} className="recycled-card">
                    <div className="recycled-card-thumbnail">
                      <img
                        src={getFileUrl(sprite.fileId.toString())}
                        alt={sprite.name}
                        className="recycled-card-image"
                      />
                      <div className="recycled-card-actions">
                        <Button
                          icon="pi pi-replay"
                          className="p-button-success p-button-rounded"
                          onClick={() => handleRestoreSprite(sprite)}
                          tooltip="Restore"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                        <Button
                          icon="pi pi-trash"
                          className="p-button-danger p-button-rounded"
                          onClick={() => handleDeletePreviewSprite(sprite)}
                          tooltip="Delete Forever"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                      </div>
                      <div className="recycled-card-overlay">
                        <span
                          className="recycled-card-name"
                          title={sprite.name}
                        >
                          {sprite.name}
                        </span>
                        <span className="recycled-card-meta">
                          Deleted {formatDate(sprite.deletedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sounds Section */}
          {sounds.length > 0 && (
            <div className="recycled-section" data-section="sounds">
              <h3 className="recycled-section-title">
                <i className="pi pi-volume-up" />
                Sounds ({sounds.length})
              </h3>
              <div
                className="recycled-cards-grid"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
                }}
              >
                {sounds.map(sound => (
                  <div key={sound.id} className="recycled-card">
                    <div className="recycled-card-thumbnail">
                      <div className="sound-placeholder">
                        <i className="pi pi-volume-up" />
                        <span className="sound-duration">
                          {formatDuration(sound.duration)}
                        </span>
                      </div>
                      <div className="recycled-card-actions">
                        <Button
                          icon="pi pi-replay"
                          className="p-button-success p-button-rounded"
                          onClick={() => handleRestoreSound(sound)}
                          tooltip="Restore"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                        <Button
                          icon="pi pi-trash"
                          className="p-button-danger p-button-rounded"
                          onClick={() => handleDeletePreviewSound(sound)}
                          tooltip="Delete Forever"
                          tooltipOptions={{ position: 'bottom' }}
                        />
                      </div>
                      <div className="recycled-card-overlay">
                        <span className="recycled-card-name" title={sound.name}>
                          {sound.name}
                        </span>
                        <span className="recycled-card-meta">
                          Deleted {formatDate(sound.deletedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
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
