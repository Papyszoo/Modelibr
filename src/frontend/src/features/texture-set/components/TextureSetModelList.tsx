import { useState, useEffect, useCallback, useRef } from 'react'
import { Toast } from 'primereact/toast'
import { Button } from 'primereact/button'
import { InputText } from 'primereact/inputtext'
import { Dialog } from 'primereact/dialog'
import { Checkbox } from 'primereact/checkbox'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ThumbnailDisplay } from '@/features/thumbnail'
import { Model } from '@/utils/fileUtils'
import { useModelsQuery } from '@/features/models/api/queries'
import { associateTextureSetWithAllModelVersions } from '@/features/texture-set/api/textureSetApi'
import CardWidthSlider from '@/shared/components/CardWidthSlider'
import { useCardWidthStore } from '@/stores/cardWidthStore'
import { useTabContext } from '@/hooks/useTabContext'
import '@/features/models/components/ModelGrid/ModelGrid.css'

interface TextureSetModelListProps {
  textureSetId: number
}

export default function TextureSetModelList({
  textureSetId,
}: TextureSetModelListProps) {
  const toast = useRef<Toast>(null)
  const { openModelDetailsTab } = useTabContext()
  const { settings, setCardWidth } = useCardWidthStore()
  const cardWidth = settings.textureSets
  const queryClient = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const modelsQuery = useModelsQuery({
    params: { page: 1, pageSize: 200, textureSetId },
  })
  const models: Model[] = modelsQuery.data?.items ?? []
  const loading = modelsQuery.isLoading

  useEffect(() => {
    if (!modelsQuery.error) return
    console.error('Failed to fetch texture set models:', modelsQuery.error)
  }, [modelsQuery.error])

  const fetchModels = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['models'] })
  }, [queryClient])

  const getModelName = (model: Model) => {
    if (model.name) return model.name
    if (model.files && model.files.length > 0)
      return model.files[0].originalFileName
    return `Model ${model.id}`
  }

  const filteredModels = searchQuery
    ? models.filter(m =>
        getModelName(m).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : models

  const handleModelSelect = (model: Model) => {
    openModelDetailsTab(String(model.id), getModelName(model))
  }

  if (loading) {
    return (
      <div className="model-grid-container">
        <div className="model-grid-loading">
          <i className="pi pi-spin pi-spinner" style={{ fontSize: '2rem' }} />
          <p>Loading models...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="model-grid-container">
      <Toast ref={toast} />

      <div
        className="models-filters"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.5rem 0',
        }}
      >
        <span className="p-input-icon-left" style={{ flex: 1 }}>
          <i className="pi pi-search" />
          <InputText
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%' }}
          />
        </span>
        <CardWidthSlider
          value={cardWidth}
          min={120}
          max={400}
          onChange={width => setCardWidth('textureSets', width)}
        />
      </div>

      <div className="model-grid-actions">
        <Button
          icon="pi pi-refresh"
          className="p-button-text p-button-sm"
          onClick={fetchModels}
          tooltip="Refresh"
          tooltipOptions={{ position: 'bottom' }}
          aria-label="Refresh models"
        />
      </div>

      {filteredModels.length === 0 && searchQuery ? (
        <div className="no-results">
          <i className="pi pi-search" />
          <p>{`No models found matching "${searchQuery}"`}</p>
        </div>
      ) : (
        <div
          className="model-grid"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
          }}
        >
          {filteredModels.map(model => (
            <div
              key={model.id}
              className="model-card"
              onClick={() => handleModelSelect(model)}
            >
              <div className="model-card-thumbnail">
                <ThumbnailDisplay modelId={model.id} modelName={model.name} />
                <div className="model-card-overlay">
                  <span className="model-card-name">{getModelName(model)}</span>
                </div>
              </div>
            </div>
          ))}
          <div
            className="model-card model-card-add"
            onClick={() => setShowAddDialog(true)}
          >
            <div className="model-card-add-content">
              <i className="pi pi-link" />
              <span>Link Model</span>
            </div>
          </div>
        </div>
      )}

      <LinkModelDialog
        visible={showAddDialog}
        onHide={() => setShowAddDialog(false)}
        textureSetId={textureSetId}
        existingModelIds={models.map(m => String(m.id))}
        onModelsLinked={fetchModels}
      />
    </div>
  )
}

// ---- Link Model Dialog (texture-set specific) ----

interface LinkModelDialogProps {
  visible: boolean
  onHide: () => void
  textureSetId: number
  existingModelIds: string[]
  onModelsLinked: () => void
}

function LinkModelDialog({
  visible,
  onHide,
  textureSetId,
  existingModelIds,
  onModelsLinked,
}: LinkModelDialogProps) {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const allModelsQuery = useModelsQuery({
    params: { page: 1, pageSize: 200 },
    queryConfig: { enabled: visible },
  })

  const linkModelsMutation = useMutation({
    mutationFn: async (modelIds: number[]) => {
      for (const modelId of modelIds) {
        await associateTextureSetWithAllModelVersions(textureSetId, modelId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
      queryClient.invalidateQueries({ queryKey: ['models', 'detail'] })
      onModelsLinked()
      onHide()
    },
    onError: error => {
      console.error('Failed to link models to texture set:', error)
    },
  })

  const getModelName = (model: Model) => {
    if (model.name) return model.name
    if (model.files && model.files.length > 0)
      return model.files[0].originalFileName
    return `Model ${model.id}`
  }

  useEffect(() => {
    if (visible) {
      setSelectedIds([])
      setSearchQuery('')
    }
  }, [visible])

  useEffect(() => {
    if (!allModelsQuery.error) return
    console.error('Failed to load models')
  }, [allModelsQuery.error])

  const allModels =
    allModelsQuery.data?.items.filter(
      m => !existingModelIds.includes(String(m.id))
    ) ?? []
  const loading = allModelsQuery.isLoading

  const filtered = allModels.filter(m =>
    searchQuery
      ? getModelName(m).toLowerCase().includes(searchQuery.toLowerCase())
      : true
  )

  const toggle = (id: number) =>
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )

  const handleLink = () => {
    linkModelsMutation.mutate(selectedIds)
  }

  return (
    <Dialog
      header="Link Models to Texture Set"
      visible={visible}
      style={{ width: '80vw', maxWidth: '1200px', maxHeight: '80vh' }}
      onHide={() => {
        onHide()
        setSelectedIds([])
      }}
      footer={
        <div>
          <Button
            label="Cancel"
            icon="pi pi-times"
            onClick={() => {
              onHide()
              setSelectedIds([])
            }}
            className="p-button-text"
          />
          <Button
            label={`Link Selected (${selectedIds.length})`}
            icon="pi pi-link"
            onClick={handleLink}
            loading={linkModelsMutation.isPending}
            disabled={selectedIds.length === 0 || linkModelsMutation.isPending}
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
            {filtered.map(model => {
              const isSelected = selectedIds.includes(Number(model.id))
              return (
                <div
                  key={model.id}
                  className={`container-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggle(Number(model.id))}
                >
                  <div className="container-card-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggle(Number(model.id))}
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
            {filtered.length === 0 && !loading && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem',
                  gridColumn: '1 / -1',
                }}
              >
                <p>No models available to link.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
