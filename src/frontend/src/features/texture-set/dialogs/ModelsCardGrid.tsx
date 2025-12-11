import { useRef, useMemo } from 'react'
import { Button } from 'primereact/button'
import { Badge } from 'primereact/badge'
import { ContextMenu } from 'primereact/contextmenu'
import { MenuItem } from 'primereact/menuitem'
import { ModelSummaryDto } from '../../../types'
import ThumbnailDisplay from '../../thumbnail/components/ThumbnailDisplay'
import { openTabInPanel } from '../../../utils/tabNavigation'
import './ModelsCardGrid.css'

interface ModelsCardGridProps {
  models: ModelSummaryDto[]
  onDisassociateModel: (model: ModelSummaryDto) => void
  onManageAssociations: () => void
}

interface GroupedModel {
  id: number
  name: string
  versions: Array<{
    versionNumber: number
    modelVersionId: number
  }>
}

export default function ModelsCardGrid({
  models,
  onDisassociateModel,
  onManageAssociations,
}: ModelsCardGridProps) {
  const contextMenuRef = useRef<ContextMenu>(null)
  const selectedModelRef = useRef<GroupedModel | null>(null)

  // Group models by ID
  const groupedModels = useMemo(() => {
    const groups = new Map<number, GroupedModel>()

    models.forEach(model => {
      if (!groups.has(model.id)) {
        groups.set(model.id, {
          id: model.id,
          name: model.name,
          versions: [],
        })
      }

      const group = groups.get(model.id)!
      if (model.versionNumber !== undefined) {
        group.versions.push({
          versionNumber: model.versionNumber,
          modelVersionId: model.modelVersionId,
        })
      }
    })

    // Sort versions within each group
    groups.forEach(group => {
      group.versions.sort((a, b) => a.versionNumber - b.versionNumber)
    })

    return Array.from(groups.values())
  }, [models])

  const handleContextMenu = (e: React.MouseEvent, model: GroupedModel) => {
    e.preventDefault()
    e.stopPropagation()
    selectedModelRef.current = model

    // Create context menu items dynamically for this model
    const menuItems: MenuItem[] = model.versions.map(version => ({
      label: `Unlink Version ${version.versionNumber}`,
      icon: 'pi pi-times',
      command: () => {
        const modelDto: ModelSummaryDto = {
          id: model.id,
          name: model.name,
          versionNumber: version.versionNumber,
          modelVersionId: version.modelVersionId,
        }
        onDisassociateModel(modelDto)
      },
    }))

    // Update the context menu model
    if (contextMenuRef.current) {
      // @ts-expect-error - PrimeReact ContextMenu has a setModel method but it's not in the types
      contextMenuRef.current.setModel(menuItems)
      contextMenuRef.current.show(e)
    }
  }

  const handleCardClick = (e: React.MouseEvent, modelId: number) => {
    // Don't open tab on right-click
    if (e.button === 2) return
    openTabInPanel('modelViewer', 'left', modelId.toString())
  }

  const uniqueModelCount = groupedModels.length

  return (
    <>
      <div className="tab-header">
        <h4>Associated Models ({uniqueModelCount})</h4>
        <Button
          label="Link Model"
          icon="pi pi-link"
          onClick={onManageAssociations}
          size="small"
        />
      </div>

      {groupedModels.length === 0 ? (
        <div className="models-empty-state">
          <i className="pi pi-box" />
          <p>No models linked to this texture set</p>
          <Button
            label="Link Your First Model"
            icon="pi pi-link"
            onClick={onManageAssociations}
            size="small"
          />
        </div>
      ) : (
        <div className="models-card-grid">
          {groupedModels.map(model => (
            <div
              key={model.id}
              className="model-card"
              onClick={e => handleCardClick(e, model.id)}
              onContextMenu={e => handleContextMenu(e, model)}
            >
              <div className="model-card-thumbnail">
                <ThumbnailDisplay modelId={model.id.toString()} />
                <div className="model-card-overlay">
                  <span className="model-card-name">{model.name}</span>
                  <div className="model-card-versions">
                    {model.versions.map(version => (
                      <Badge
                        key={version.versionNumber}
                        value={`V${version.versionNumber}`}
                        severity="info"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ContextMenu model={[]} ref={contextMenuRef} autoZIndex />
    </>
  )
}
