import { useState, useEffect } from 'react'
import { ProgressBar } from 'primereact/progressbar'
import { Button } from 'primereact/button'
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
  projectId: number | null
  projectName: string | null
  modelId: number | null
  modelName: string | null
  textureSetId: number | null
  textureSetName: string | null
  spriteId: number | null
  spriteName: string | null
}

interface BatchGroup {
  batchId: string
  files: BatchUploadHistory[]
  timestamp: string
  collapsed: boolean
}

// Utility function to get file extension
const getFileExtension = (fileName: string): string => {
  const parts = fileName.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

// Map file extensions to PrimeIcons with extension name display
const getExtensionIcon = (
  extension: string
): { icon: string; name: string } => {
  const iconMap: Record<string, string> = {
    // Images
    jpg: 'pi-image',
    jpeg: 'pi-image',
    png: 'pi-image',
    gif: 'pi-image',
    webp: 'pi-image',
    svg: 'pi-image',
    tga: 'pi-image',
    bmp: 'pi-image',
    // 3D Models
    obj: 'pi-box',
    fbx: 'pi-box',
    gltf: 'pi-box',
    glb: 'pi-box',
    stl: 'pi-box',
    dae: 'pi-box',
    '3ds': 'pi-box',
  }
  return {
    icon: iconMap[extension] || 'pi-file',
    name: extension.toUpperCase(),
  }
}

// Map file type to icon
const getFileTypeIcon = (fileType: string): string => {
  const typeIconMap: Record<string, string> = {
    model: 'pi-box',
    texture: 'pi-image',
    textureSet: 'pi-image',
    pack: 'pi-inbox',
    project: 'pi-briefcase',
    file: 'pi-file',
    sprite: 'pi-image',
  }
  return typeIconMap[fileType] || 'pi-file'
}

export default function History() {
  const [history, setHistory] = useState<BatchUploadHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [batchGroups, setBatchGroups] = useState<BatchGroup[]>([])
  const {
    openModelDetailsTab,
    openTextureSetDetailsTab,
    openPackDetailsTab,
    openProjectDetailsTab,
  } = useTabContext()

  useEffect(() => {
    loadHistory()
  }, [])

  useEffect(() => {
    // Group uploads by batchId
    const grouped = new Map<string, BatchUploadHistory[]>()

    history.forEach(upload => {
      if (!grouped.has(upload.batchId)) {
        grouped.set(upload.batchId, [])
      }
      grouped.get(upload.batchId)!.push(upload)
    })

    // Create batch groups
    const groups: BatchGroup[] = Array.from(grouped.entries()).map(
      ([batchId, files]) => ({
        batchId,
        files: files.sort((a, b) => a.fileName.localeCompare(b.fileName)),
        timestamp: files[0].uploadedAt,
        collapsed: false,
      })
    )

    // Sort groups by timestamp descending
    groups.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    setBatchGroups(groups)
  }, [history])

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

  const toggleBatchCollapse = (batchId: string) => {
    setBatchGroups(prev =>
      prev.map(group =>
        group.batchId === batchId
          ? { ...group, collapsed: !group.collapsed }
          : group
      )
    )
  }

  const getUploadedToText = (upload: BatchUploadHistory): string => {
    // Priority: Pack > Project > Model > TextureSet > Sprite > Default
    if (upload.packId && upload.packName) {
      return `${upload.packName} Pack`
    }
    if (upload.projectId && upload.projectName) {
      return `${upload.projectName} Project`
    }
    if (upload.modelId) {
      return 'Models List'
    }
    if (upload.textureSetId) {
      return 'Texture Sets List'
    }
    if (upload.spriteId) {
      return 'Sprites Page'
    }
    // Fallback based on upload type
    if (upload.uploadType === 'model') {
      return 'Models List'
    }
    if (upload.uploadType === 'texture' || upload.uploadType === 'textureSet') {
      return 'Texture Sets List'
    }
    if (upload.uploadType === 'sprite') {
      return 'Sprites Page'
    }
    return 'Unknown'
  }

  const renderHistoryItem = (upload: BatchUploadHistory) => {
    const extension = getFileExtension(upload.fileName)
    const extensionInfo = getExtensionIcon(extension)
    const typeIcon = getFileTypeIcon(upload.uploadType)
    const uploadedTo = getUploadedToText(upload)
    const uploadDate = new Date(upload.uploadedAt)

    return (
      <div key={upload.id} className="history-item">
        <div className="history-item-icons">
          <div className="history-item-ext-icon-container">
            <i className={`pi ${extensionInfo.icon} history-item-ext-icon`} />
            <span className="history-item-ext-name">{extensionInfo.name}</span>
          </div>
          <i className={`pi ${typeIcon} history-item-type-icon`} />
        </div>

        <div className="history-item-details">
          <div className="history-item-header">
            <span className="history-item-name" title={upload.fileName}>
              {upload.fileName}
            </span>
            <span className="history-item-uploaded-to">{uploadedTo}</span>
          </div>
          <div className="history-item-timestamp">
            {uploadDate.toLocaleString()}
          </div>
        </div>

        <div className="history-item-actions">
          {upload.modelId && (
            <Button
              icon="pi pi-box"
              size="small"
              text
              rounded
              title="Open Model"
              onClick={async () => {
                try {
                  const model = await ApiClient.getModelById(
                    upload.modelId!.toString()
                  )
                  openModelDetailsTab(model)
                } catch (error) {
                  console.error('Failed to open model:', error)
                }
              }}
            />
          )}
          {upload.textureSetId && (
            <Button
              icon="pi pi-image"
              size="small"
              text
              rounded
              title="Open Texture Set"
              onClick={async () => {
                try {
                  const textureSet = await ApiClient.getTextureSetById(
                    upload.textureSetId!
                  )
                  openTextureSetDetailsTab(textureSet)
                } catch (error) {
                  console.error('Failed to open texture set:', error)
                }
              }}
            />
          )}
          {upload.packId && (
            <Button
              icon="pi pi-inbox"
              size="small"
              text
              rounded
              title="Open Pack"
              onClick={() => openPackDetailsTab(upload.packId!.toString())}
            />
          )}
          {upload.projectId && (
            <Button
              icon="pi pi-briefcase"
              size="small"
              text
              rounded
              title="Open Project"
              onClick={() =>
                openProjectDetailsTab(upload.projectId!.toString())
              }
            />
          )}
        </div>
      </div>
    )
  }

  const renderBatch = (batch: BatchGroup) => {
    const uploadDate = new Date(batch.timestamp)

    return (
      <div key={batch.batchId} className="history-batch">
        <div
          className="history-batch-header"
          onClick={() => toggleBatchCollapse(batch.batchId)}
        >
          <div className="history-batch-info">
            <i
              className={`pi ${batch.collapsed ? 'pi-chevron-right' : 'pi-chevron-down'} history-batch-toggle`}
            />
            <span className="history-batch-title">
              Batch Upload - {batch.files.length} file
              {batch.files.length > 1 ? 's' : ''}
            </span>
            <span className="history-batch-timestamp">
              {uploadDate.toLocaleString()}
            </span>
          </div>
        </div>
        {!batch.collapsed && (
          <div className="history-batch-items">
            {batch.files.map(upload => renderHistoryItem(upload))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="history-container">
        <div className="history-toolbar">
          <h2>Upload History</h2>
        </div>
        <div className="history-loading">
          <ProgressBar mode="indeterminate" />
          <p>Loading history...</p>
        </div>
      </div>
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

      {batchGroups.length === 0 ? (
        <div className="history-empty">
          <i className="pi pi-history" />
          <p>No upload history found</p>
        </div>
      ) : (
        <div className="history-list">
          {batchGroups.map(batch => renderBatch(batch))}
        </div>
      )}
    </div>
  )
}
