import './EnvironmentMapList.css'

import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Toast } from 'primereact/toast'
import { useMemo, useRef, useState } from 'react'

import {
  useCreateEnvironmentMapWithFileMutation,
  useEnvironmentMapsQuery,
  useRecycleEnvironmentMapMutation,
} from '@/features/environment-map/api/queries'
import { getEnvironmentMapPrimaryPreviewUrl } from '@/features/environment-map/utils/environmentMapUtils'
import { useTabContext } from '@/hooks/useTabContext'
import { useUploadProgress } from '@/hooks/useUploadProgress'
import { UploadableGrid } from '@/shared/components'
import { CardWidthSlider } from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'

export function EnvironmentMapList() {
  const toast = useRef<Toast>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { openEnvironmentMapDetailsTab } = useTabContext()
  const { settings, setCardWidth } = useCardWidthStore()
  const uploadProgress = useUploadProgress()
  const cardWidth = settings.environmentMaps

  const environmentMapsQuery = useEnvironmentMapsQuery({
    params: { page: 1, pageSize: 200 },
  })
  const environmentMaps = environmentMapsQuery.data?.environmentMaps ?? []
  const totalCount =
    environmentMapsQuery.data?.totalCount ?? environmentMaps.length

  const createEnvironmentMapMutation = useCreateEnvironmentMapWithFileMutation()
  const recycleEnvironmentMapMutation = useRecycleEnvironmentMapMutation()

  const filteredEnvironmentMaps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return environmentMaps

    return environmentMaps.filter(environmentMap =>
      environmentMap.name.toLowerCase().includes(query)
    )
  }, [environmentMaps, searchQuery])

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return

    const batchId = uploadProgress.createBatch()
    let createdCount = 0

    for (const file of files) {
      const uploadId = uploadProgress.addUpload(file, 'environmentMap', batchId)

      try {
        uploadProgress.updateUploadProgress(uploadId, 35)

        const result = await createEnvironmentMapMutation.mutateAsync({
          file,
          options: {
            name: file.name.replace(/\.[^/.]+$/, ''),
            sizeLabel: '1K',
            batchId,
          },
        })

        uploadProgress.updateUploadProgress(uploadId, 100)
        uploadProgress.completeUpload(uploadId, result)
        createdCount += 1
      } catch (error) {
        uploadProgress.failUpload(uploadId, error as Error)
        console.error('Failed to upload environment map:', error)
      }
    }

    if (createdCount > 0) {
      toast.current?.show({
        severity: 'success',
        summary: 'Upload complete',
        detail: `${createdCount} environment map${createdCount === 1 ? '' : 's'} uploaded`,
        life: 3000,
      })
    }
  }

  const handleRecycleEnvironmentMap = (
    environmentMapId: number,
    name: string
  ) => {
    confirmDialog({
      message: `Move "${name}" to recycled files?`,
      header: 'Recycle Environment Map',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await recycleEnvironmentMapMutation.mutateAsync(environmentMapId)
          toast.current?.show({
            severity: 'success',
            summary: 'Recycled',
            detail: `${name} moved to recycled files`,
            life: 3000,
          })
        } catch (error) {
          console.error('Failed to recycle environment map:', error)
          toast.current?.show({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to recycle environment map',
            life: 3000,
          })
        }
      },
    })
  }

  return (
    <div className="environment-map-list">
      <Toast ref={toast} />
      <ConfirmDialog />

      <div className="environment-map-list-header">
        <div>
          <h2>Environment Maps</h2>
          <p>{totalCount} panoramic lighting assets</p>
        </div>

        <div className="environment-map-list-toolbar">
          <div className="environment-map-search">
            <i className="pi pi-search" />
            <input
              type="text"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search environment maps"
            />
          </div>

          <CardWidthSlider
            value={cardWidth}
            min={260}
            max={520}
            onChange={width => setCardWidth('environmentMaps', width)}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.hdr,.exr"
            hidden
            multiple
            onChange={event => {
              const files = Array.from(event.target.files ?? [])
              void handleUploadFiles(files)
              event.target.value = ''
            }}
          />

          <Button
            label="Upload"
            icon="pi pi-upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={createEnvironmentMapMutation.isPending}
          />
        </div>
      </div>

      {environmentMapsQuery.isLoading ? (
        <div className="environment-map-list-loading">
          <i className="pi pi-spin pi-spinner" />
          <p>Loading environment maps...</p>
        </div>
      ) : filteredEnvironmentMaps.length === 0 ? (
        <div className="environment-map-list-empty">
          <i className="pi pi-globe" />
          <h3>No Environment Maps</h3>
          <p>Upload HDRI or panoramic images to get started.</p>
        </div>
      ) : (
        <UploadableGrid
          onFilesDropped={handleUploadFiles}
          isUploading={createEnvironmentMapMutation.isPending}
          uploadMessage="Drop panoramic images here to upload environment maps"
        >
          <div
            className="environment-map-grid"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
            }}
          >
            {filteredEnvironmentMaps.map(environmentMap => {
              const previewUrl =
                getEnvironmentMapPrimaryPreviewUrl(environmentMap)

              return (
                <article
                  key={environmentMap.id}
                  className="environment-map-card"
                  onClick={() =>
                    openEnvironmentMapDetailsTab(
                      environmentMap.id,
                      environmentMap.name
                    )
                  }
                >
                  <div className="environment-map-card-preview">
                    {previewUrl ? (
                      <img src={previewUrl} alt={environmentMap.name} />
                    ) : (
                      <div className="environment-map-card-placeholder">
                        <i className="pi pi-globe" />
                        <span>No Preview</span>
                      </div>
                    )}

                    <div className="environment-map-card-actions">
                      <Button
                        icon="pi pi-trash"
                        rounded
                        text
                        severity="danger"
                        tooltip="Move to recycled files"
                        onClick={event => {
                          event.stopPropagation()
                          handleRecycleEnvironmentMap(
                            environmentMap.id,
                            environmentMap.name
                          )
                        }}
                      />
                    </div>
                  </div>

                  <div className="environment-map-card-body">
                    <div className="environment-map-card-copy">
                      <h3 className="environment-map-card-title">
                        {environmentMap.name}
                      </h3>
                      <p className="environment-map-card-meta">
                        {environmentMap.variantCount} variant
                        {environmentMap.variantCount === 1 ? '' : 's'} • Updated{' '}
                        {new Date(
                          environmentMap.updatedAt
                        ).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      icon="pi pi-arrow-right"
                      text
                      rounded
                      aria-label={`Open ${environmentMap.name}`}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        </UploadableGrid>
      )}
    </div>
  )
}
