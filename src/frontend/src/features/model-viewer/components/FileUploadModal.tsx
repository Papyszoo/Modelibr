import { useState } from 'react'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { RadioButton } from 'primereact/radiobutton'
import { InputText } from 'primereact/inputtext'
import { Checkbox } from 'primereact/checkbox'
import { ModelVersionDto } from '../../../types'

interface FileUploadModalProps {
  visible: boolean
  onHide: () => void
  file: File | null
  modelId: number
  versions: ModelVersionDto[]
  selectedVersion: ModelVersionDto | null
  onUpload: (
    file: File,
    action: 'current' | 'new',
    description?: string,
    targetVersionNumber?: number,
    setAsActive?: boolean
  ) => Promise<void>
}

export function FileUploadModal({
  visible,
  onHide,
  file,
  modelId: _modelId,
  versions,
  selectedVersion,
  onUpload,
}: FileUploadModalProps) {
  const [uploadAction, setUploadAction] = useState<'current' | 'new'>('current')
  const [description, setDescription] = useState('')
  const [uploading, setUploading] = useState(false)
  const [setAsActive, setSetAsActive] = useState(true)
  const [targetVersionNumber, _setTargetVersionNumber] = useState<number>(
    versions.length > 0 ? versions[versions.length - 1].versionNumber : 1
  )

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    try {
      await onUpload(
        file,
        uploadAction,
        description || undefined,
        targetVersionNumber,
        uploadAction === 'new' ? setAsActive : undefined
      )
      onHide()
      setDescription('')
      setUploadAction('current')
      setSetAsActive(true)
    } catch (error) {
      console.error('Upload failed:', error)
      alert(
        'Upload failed: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      )
    } finally {
      setUploading(false)
    }
  }

  const footer = (
    <div>
      <Button
        label="Cancel"
        icon="pi pi-times"
        onClick={onHide}
        className="p-button-text"
        disabled={uploading}
      />
      <Button
        label="Upload"
        icon="pi pi-upload"
        onClick={handleUpload}
        disabled={uploading}
      />
    </div>
  )

  // Sort versions by version number descending
  const sortedVersions = [...versions].sort(
    (a, b) => b.versionNumber - a.versionNumber
  )

  return (
    <Dialog
      header="Upload File to Model"
      visible={visible}
      style={{ width: '500px' }}
      onHide={onHide}
      footer={footer}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {file && (
          <div>
            <strong>File:</strong> {file.name}
            <div
              style={{
                fontSize: '0.875rem',
                color: '#64748b',
                marginTop: '0.25rem',
              }}
            >
              {(file.size / 1024).toFixed(2)} KB
            </div>
          </div>
        )}

        <div>
          <h4 style={{ marginBottom: '1rem' }}>Upload Action:</h4>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <RadioButton
              inputId="addToCurrent"
              name="uploadAction"
              value="current"
              onChange={e => setUploadAction(e.value)}
              checked={uploadAction === 'current'}
            />
            <label htmlFor="addToCurrent" style={{ marginLeft: '0.5rem' }}>
              Add to{' '}
              {selectedVersion
                ? `Version ${selectedVersion.versionNumber}`
                : 'current version (latest)'}
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <RadioButton
              inputId="createNew"
              name="uploadAction"
              value="new"
              onChange={e => setUploadAction(e.value)}
              checked={uploadAction === 'new'}
            />
            <label htmlFor="createNew" style={{ marginLeft: '0.5rem' }}>
              Create new version
            </label>
          </div>
        </div>

        {uploadAction === 'new' && (
          <>
            <div>
              <label
                htmlFor="description"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: 500,
                }}
              >
                Version Description (optional):
              </label>
              <InputText
                id="description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g., Improved topology, UV fixes..."
                style={{ width: '100%' }}
              />
            </div>

            {versions.length > 0 && (
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                  }}
                >
                  Version Order:
                </label>
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    color: '#64748b',
                  }}
                >
                  <div style={{ marginBottom: '0.5rem' }}>
                    The new version will be created as{' '}
                    <strong>Version {versions.length + 1}</strong>
                  </div>
                  <div>
                    Existing versions:{' '}
                    {sortedVersions.map(v => `v${v.versionNumber}`).join(', ')}
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginTop: '0.5rem',
              }}
            >
              <Checkbox
                inputId="setAsActive"
                checked={setAsActive}
                onChange={e => setSetAsActive(e.checked ?? false)}
              />
              <label htmlFor="setAsActive" style={{ marginLeft: '0.5rem' }}>
                Set new version as active
              </label>
            </div>
          </>
        )}

        {uploadAction === 'current' && versions.length > 0 && (
          <div
            style={{
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '4px',
              padding: '0.75rem',
              fontSize: '0.875rem',
              color: '#92400e',
            }}
          >
            <strong>Note:</strong> File will be added to Version{' '}
            {selectedVersion?.versionNumber ||
              versions[versions.length - 1].versionNumber}
            {selectedVersion ? ` (currently selected)` : ` (latest)`}
          </div>
        )}

        {versions.length === 0 && (
          <div
            style={{
              background: '#dbeafe',
              border: '1px solid #3b82f6',
              borderRadius: '4px',
              padding: '0.75rem',
              fontSize: '0.875rem',
              color: '#1e40af',
            }}
          >
            <strong>Note:</strong> This will create Version 1 (first version)
          </div>
        )}
      </div>
    </Dialog>
  )
}
