import './EnvironmentMapViewer.css'

import { Button } from 'primereact/button'
import { Dropdown } from 'primereact/dropdown'
import { Toast } from 'primereact/toast'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  useAddEnvironmentMapVariantWithFileMutation,
  useEnvironmentMapByIdQuery,
} from '@/features/environment-map/api/queries'
import { getEnvironmentMapPreviewOptions } from '@/features/environment-map/utils/environmentMapUtils'

interface EnvironmentMapViewerProps {
  environmentMapId: string
}

export function EnvironmentMapViewer({
  environmentMapId,
}: EnvironmentMapViewerProps) {
  const toast = useRef<Toast>(null)
  const variantFileInputRef = useRef<HTMLInputElement>(null)
  const parsedEnvironmentMapId = Number(environmentMapId)
  const [selectedPreviewKey, setSelectedPreviewKey] = useState<string>('')
  const [variantSizeLabel, setVariantSizeLabel] = useState('2K')

  const environmentMapQuery = useEnvironmentMapByIdQuery({
    environmentMapId: parsedEnvironmentMapId,
    queryConfig: {
      enabled: !Number.isNaN(parsedEnvironmentMapId),
    },
  })
  const addVariantMutation = useAddEnvironmentMapVariantWithFileMutation(
    parsedEnvironmentMapId
  )

  const environmentMap = environmentMapQuery.data ?? null
  const previewOptions = useMemo(
    () => getEnvironmentMapPreviewOptions(environmentMap),
    [environmentMap]
  )

  useEffect(() => {
    if (previewOptions.length === 0) return

    if (environmentMap?.previewVariantId) {
      const matchingOption = previewOptions.find(option =>
        option.key.startsWith(`variant-${environmentMap.previewVariantId}-`)
      )
      if (matchingOption) {
        setSelectedPreviewKey(matchingOption.key)
        return
      }
    }

    if (!selectedPreviewKey) {
      setSelectedPreviewKey(previewOptions[0].key)
    }
  }, [environmentMap?.previewVariantId, previewOptions, selectedPreviewKey])

  const selectedPreview =
    previewOptions.find(option => option.key === selectedPreviewKey) ??
    previewOptions[0] ??
    null

  const handleVariantUpload = async (file: File | null) => {
    if (!file) return

    const normalizedSizeLabel = variantSizeLabel.trim()
    if (!normalizedSizeLabel) {
      toast.current?.show({
        severity: 'warn',
        summary: 'Size label required',
        detail: 'Enter a size label like 1K, 2K, or 4K before uploading.',
        life: 3000,
      })
      return
    }

    try {
      await addVariantMutation.mutateAsync({
        file,
        options: {
          sizeLabel: normalizedSizeLabel,
        },
      })

      setSelectedPreviewKey('')
      toast.current?.show({
        severity: 'success',
        summary: 'Variant added',
        detail: `${normalizedSizeLabel} variant uploaded successfully.`,
        life: 3000,
      })
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Failed to upload variant.'

      toast.current?.show({
        severity: 'error',
        summary: 'Upload failed',
        detail,
        life: 4000,
      })
    }
  }

  if (environmentMapQuery.isLoading) {
    return (
      <div className="environment-map-viewer">Loading environment map...</div>
    )
  }

  if (environmentMapQuery.error instanceof Error) {
    return (
      <div className="environment-map-viewer">
        Error loading environment map: {environmentMapQuery.error.message}
      </div>
    )
  }

  if (!environmentMap) {
    return (
      <div className="environment-map-viewer">Environment map not found.</div>
    )
  }

  return (
    <div className="environment-map-viewer">
      <Toast ref={toast} />

      <div className="environment-map-viewer-header">
        <div>
          <h2>{environmentMap.name}</h2>
          <p>Select a generated preview size to inspect the full panorama.</p>
        </div>

        <div className="environment-map-viewer-actions">
          <input
            ref={variantFileInputRef}
            type="file"
            accept="image/*,.hdr,.exr"
            hidden
            onChange={event => {
              const file = event.target.files?.[0] ?? null
              void handleVariantUpload(file)
              event.target.value = ''
            }}
          />

          <Dropdown
            value={selectedPreviewKey}
            options={previewOptions.map(option => ({
              label: option.label,
              value: option.key,
            }))}
            onChange={event => setSelectedPreviewKey(event.value)}
            placeholder="Preview size"
          />

          {selectedPreview?.url ? (
            <Button
              label="Open Image"
              icon="pi pi-external-link"
              onClick={() => window.open(selectedPreview.url ?? '', '_blank')}
            />
          ) : null}
        </div>
      </div>

      <div className="environment-map-viewer-stage">
        <section className="environment-map-preview-panel">
          <div className="environment-map-preview-surface">
            {selectedPreview?.url ? (
              <img
                src={selectedPreview.url}
                alt={`${environmentMap.name} preview`}
              />
            ) : (
              <div className="environment-map-preview-placeholder">
                <i className="pi pi-globe" />
                <span>No preview available</span>
              </div>
            )}
          </div>
        </section>

        <aside className="environment-map-info-panel">
          <dl className="environment-map-detail-list">
            <div>
              <dt>Preview size</dt>
              <dd>{selectedPreview?.label ?? 'Original'}</dd>
            </div>
            <div>
              <dt>Variants</dt>
              <dd>{environmentMap.variantCount}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(environmentMap.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>

          <div>
            <h3>Available previews</h3>
            <div className="environment-map-variant-list">
              {previewOptions.map(option => (
                <Button
                  key={option.key}
                  label={option.label}
                  outlined={option.key !== selectedPreview?.key}
                  onClick={() => setSelectedPreviewKey(option.key)}
                />
              ))}
            </div>
          </div>

          <div className="environment-map-variant-upload">
            <h3>Add variant</h3>
            <p className="environment-map-variant-upload-help">
              Upload another size like 1K, 2K, or 4K.
            </p>
            <div className="environment-map-variant-upload-controls">
              <input
                className="environment-map-variant-size-input"
                type="text"
                value={variantSizeLabel}
                onChange={event => setVariantSizeLabel(event.target.value)}
                placeholder="2K"
              />
              <Button
                label="Upload variant"
                icon="pi pi-upload"
                loading={addVariantMutation.isPending}
                onClick={() => {
                  if (!variantSizeLabel.trim()) {
                    toast.current?.show({
                      severity: 'warn',
                      summary: 'Size label required',
                      detail:
                        'Enter a size label like 1K, 2K, or 4K before uploading.',
                      life: 3000,
                    })
                    return
                  }

                  variantFileInputRef.current?.click()
                }}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
