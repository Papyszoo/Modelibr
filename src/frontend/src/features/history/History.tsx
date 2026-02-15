import { useState, useMemo } from 'react'
import { ProgressBar } from 'primereact/progressbar'
import { Button } from 'primereact/button'
import { useQueryClient } from '@tanstack/react-query'
import { getModelById } from '@/features/models/api/modelApi'
import { getTextureSetById } from '@/features/texture-set/api/textureSetApi'
import { useUploadHistoryQuery } from './api/queries'
import { openTabInPanel } from '@/utils/tabNavigation'
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

export function History() {
  const queryClient = useQueryClient()
  const historyQuery = useUploadHistoryQuery()
  const history = useMemo(
    () => historyQuery.data?.uploads ?? [],
    [historyQuery.data?.uploads]
  )
  const loading = historyQuery.isLoading
  const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(
    new Set()
  )

  // Derive batch groups from query data
  const batchGroups = useMemo(() => {
    const grouped = new Map<string, BatchUploadHistory[]>()

    history.forEach(upload => {
      if (!grouped.has(upload.batchId)) {
        grouped.set(upload.batchId, [])
      }
      grouped.get(upload.batchId)!.push(upload)
    })

    const groups: BatchGroup[] = Array.from(grouped.entries()).map(
      ([batchId, files]) => ({
        batchId,
        files: files.sort((a, b) => a.fileName.localeCompare(b.fileName)),
        timestamp: files[0].uploadedAt,
        collapsed: collapsedBatches.has(batchId),
      })
    )

    groups.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    return groups
  }, [history, collapsedBatches])

  const refreshHistory = () => {
    queryClient.invalidateQueries({ queryKey: ['uploadHistory'] })
  }

  const toggleBatchCollapse = (batchId: string) => {
    setCollapsedBatches(prev => {
      const next = new Set(prev)
      if (next.has(batchId)) {
        next.delete(batchId)
      } else {
        next.add(batchId)
      }
      return next
    })
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
                  const model = await getModelById(upload.modelId!.toString())
                  openTabInPanel(
                    'modelViewer',
                    'left',
                    model.id.toString(),
                    model.name
                  )
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
                  const textureSet = await getTextureSetById(
                    upload.textureSetId!
                  )
                  openTabInPanel(
                    'textureSetViewer',
                    'left',
                    textureSet.id.toString(),
                    textureSet.name
                  )
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
              onClick={() =>
                openTabInPanel('packViewer', 'left', upload.packId!.toString())
              }
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
                openTabInPanel(
                  'projectViewer',
                  'left',
                  upload.projectId!.toString()
                )
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
          onClick={refreshHistory}
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
