import { useState, useEffect } from 'react'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Checkbox } from 'primereact/checkbox'
import { ThumbnailDisplay } from '@/features/thumbnail'
import { Model } from '@/utils/fileUtils'
import { getModelsPaginated } from '@/features/models/api/modelApi'
import { addModelToPack } from '@/features/pack/api/packApi'
import { addModelToProject } from '@/features/project/api/projectApi'

interface AddModelDialogProps {
  visible: boolean
  onHide: () => void
  packId?: number
  projectId?: number
  existingModelIds: string[]
  onModelsAdded: () => void
  preloadedModels?: Model[]
}

export function AddModelDialog({
  visible,
  onHide,
  packId,
  projectId,
  existingModelIds,
  onModelsAdded,
  preloadedModels,
}: AddModelDialogProps) {
  const [availableModels, setAvailableModels] = useState<Model[]>([])
  const [selectedModelIds, setSelectedModelIds] = useState<number[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)

  const label = packId ? 'Pack' : 'Project'

  // Use pre-loaded models if available, otherwise fetch on dialog open
  useEffect(() => {
    if (visible) {
      if (preloadedModels) {
        const filtered = preloadedModels.filter(
          (m: Model) => !existingModelIds.includes(String(m.id))
        )
        setAvailableModels(filtered)
      } else {
        loadAvailableModels()
      }
      setSelectedModelIds([])
      setSearchQuery('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Dialog initialization should rerun only on visibility/preloaded models changes
  }, [visible, preloadedModels])

  const loadAvailableModels = async () => {
    setLoading(true)
    try {
      const response = await getModelsPaginated({
        page: 1,
        pageSize: 200,
      })
      const filtered = response.items.filter(
        (m: Model) => !existingModelIds.includes(String(m.id))
      )
      setAvailableModels(filtered)
    } catch (error) {
      console.error('Failed to load available models:', error)
    } finally {
      setLoading(false)
    }
  }

  const getModelName = (model: Model) => {
    if (model.name) return model.name
    if (model.files && model.files.length > 0)
      return model.files[0].originalFileName
    return `Model ${model.id}`
  }

  const filteredModels = availableModels.filter(model => {
    if (!searchQuery) return true
    const name = getModelName(model).toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  const toggleSelection = (modelId: number) => {
    setSelectedModelIds(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    )
  }

  const handleAdd = async () => {
    try {
      for (const modelId of selectedModelIds) {
        if (packId) {
          await addModelToPack(packId, modelId)
        } else if (projectId) {
          await addModelToProject(projectId, modelId)
        }
      }
      onModelsAdded()
      onHide()
    } catch (error) {
      console.error('Failed to add models:', error)
    }
  }

  return (
    <Dialog
      header={`Add Models to ${label}`}
      visible={visible}
      style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
      onHide={() => {
        onHide()
        setSelectedModelIds([])
      }}
      footer={
        <div>
          <Button
            label="Cancel"
            icon="pi pi-times"
            onClick={() => {
              onHide()
              setSelectedModelIds([])
            }}
            className="p-button-text"
          />
          <Button
            label={`Add Selected (${selectedModelIds.length})`}
            icon="pi pi-check"
            onClick={handleAdd}
            disabled={selectedModelIds.length === 0}
          />
        </div>
      }
    >
      <div className="add-dialog-content">
        <div className="search-bar">
          <i className="pi pi-search" />
          <InputText
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
            style={{ width: '100%' }}
          />
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
            <p>Loading models...</p>
          </div>
        ) : (
          <div className="container-grid scrollable-grid">
            {filteredModels.map(model => {
              const isSelected = selectedModelIds.includes(Number(model.id))
              return (
                <div
                  key={model.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelection(Number(model.id))}
                >
                  <div className="container-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleSelection(Number(model.id))}
                    />
                  </div>
                  <div className="container-card-thumbnail">
                    <ThumbnailDisplay
                      modelId={String(model.id)}
                      modelName={getModelName(model)}
                    />
                    <div className="container-card-overlay">
                      <span className="container-card-name">
                        {getModelName(model)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredModels.length === 0 && !loading && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem',
                  gridColumn: '1 / -1',
                }}
              >
                <p>No models available to add.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
