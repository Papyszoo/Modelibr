import './ModelInfo.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Chip } from 'primereact/chip'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useRef } from 'react'
import { useEffect, useState } from 'react'

import {
  addModelConceptImage,
  getFilePreviewUrl,
  removeModelConceptImage,
  updateModelTags,
  uploadFile,
} from '@/features/models/api/modelApi'
import { useModelCategoriesQuery } from '@/features/models/api/queries'
import { resolveApiAssetUrl } from '@/lib/apiBase'
import { getModelFileFormat } from '@/utils/fileUtils'

import { ModelCategoryManagerDialog } from '@/features/models/components/ModelCategoryManagerDialog'
import { ModelCategorySinglePicker } from '@/features/models/components/ModelCategorySinglePicker'

export function ModelInfo({ model, onModelUpdated }) {
  const [tags, setTags] = useState(model.tags ?? [])
  const [description, setDescription] = useState(model.description || '')
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    model.category?.id ?? model.categoryId ?? null
  )
  const [newTag, setNewTag] = useState('')
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const conceptFileInputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()
  const categoriesQuery = useModelCategoriesQuery()
  const categories = categoriesQuery.data ?? []

  // Sync local state when the model prop updates (e.g. after React Query refetch)
  useEffect(() => {
    setTags(model.tags ?? [])
    setDescription(model.description || '')
    setSelectedCategoryId(model.category?.id ?? model.categoryId ?? null)
  }, [
    model.id,
    model.tags,
    model.description,
    model.category?.id,
    model.categoryId,
  ])

  const invalidateModelQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['models'] })
    queryClient.invalidateQueries({
      queryKey: ['models', 'detail', String(model.id)],
    })
  }

  const saveModelInfoMutation = useMutation({
    mutationFn: async ({
      tags,
      desc,
      categoryId,
    }: {
      tags: string[]
      desc: string
      categoryId?: number | null
    }) => updateModelTags(model.id, tags, desc, categoryId),
    onSuccess: () => {
      invalidateModelQueries()
      if (onModelUpdated) {
        onModelUpdated()
      }
    },
    onError: error => {
      console.error('Failed to save tags:', error)
    },
  })

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const handleRemoveTag = tagToRemove => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyPress = e => {
    if (e.key === 'Enter') {
      handleAddTag()
    }
  }

  const handleSave = () => {
    saveModelInfoMutation.mutate({
      tags,
      desc: description,
      categoryId: selectedCategoryId,
    })
  }

  const uploadConceptImageMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        const upload = await uploadFile(file, { uploadType: 'file' })
        await addModelConceptImage(model.id, upload.fileId)
      }
    },
    onSuccess: invalidateModelQueries,
  })

  const removeConceptImageMutation = useMutation({
    mutationFn: (fileId: number) => removeModelConceptImage(model.id, fileId),
    onSuccess: invalidateModelQueries,
  })

  const technicalMetadata = model.technicalMetadata ?? {
    latestVersionId: model.latestVersionId,
    latestVersionNumber: model.latestVersionNumber,
    triangleCount: model.triangleCount,
    vertexCount: model.vertexCount,
    meshCount: model.meshCount,
    materialCount: model.materialCount,
  }

  return (
    <div className="model-info">
      <ModelCategoryManagerDialog
        visible={showCategoryManager}
        categories={categories}
        onHide={() => setShowCategoryManager(false)}
      />

      <div className="model-info-section">
        <div className="model-info-grid">
          <div className="model-info-item">
            <label>ID:</label>
            <span>{model.id}</span>
          </div>
          <div className="model-info-item">
            <label>Created:</label>
            <span>{new Date(model.createdAt).toLocaleString()}</span>
          </div>
          <div className="model-info-item">
            <label>Modified:</label>
            <span>{new Date(model.updatedAt).toLocaleString()}</span>
          </div>
          <div className="model-info-item">
            <label>Format:</label>
            <span>{getModelFileFormat(model)}</span>
          </div>
          <div className="model-info-item model-info-item-wide">
            <label>Category:</label>
            <div className="model-info-category-row">
              <ModelCategorySinglePicker
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                onChange={setSelectedCategoryId}
              />
              <Button
                icon="pi pi-cog"
                text
                rounded
                aria-label="Manage model categories"
                tooltip="Manage model categories"
                tooltipOptions={{ position: 'left' }}
                onClick={() => setShowCategoryManager(true)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="model-info-section">
        <h3 className="model-info-title">Technical Data</h3>
        <div className="model-info-grid">
          <div className="model-info-item">
            <label>Triangles</label>
            <span>{technicalMetadata.triangleCount ?? 'Unknown'}</span>
          </div>
          <div className="model-info-item">
            <label>Vertices</label>
            <span>{technicalMetadata.vertexCount ?? 'Unknown'}</span>
          </div>
          <div className="model-info-item">
            <label>Meshes</label>
            <span>{technicalMetadata.meshCount ?? 'Unknown'}</span>
          </div>
          <div className="model-info-item">
            <label>Materials</label>
            <span>{technicalMetadata.materialCount ?? 'Unknown'}</span>
          </div>
          <div className="model-info-item model-info-item-wide">
            <label>Based On</label>
            <span>
              {technicalMetadata.latestVersionNumber
                ? `Version ${technicalMetadata.latestVersionNumber}`
                : 'No analyzed version'}
            </span>
          </div>
        </div>
      </div>

      <div className="model-info-section">
        <div className="model-info-header-row">
          <h3 className="model-info-title">Concept Images</h3>
          <Button
            label="Add Images"
            icon="pi pi-images"
            className="p-button-outlined p-button-sm"
            onClick={() => conceptFileInputRef.current?.click()}
          />
        </div>

        <input
          ref={conceptFileInputRef}
          type="file"
          accept="image/*"
          hidden
          multiple
          onChange={event => {
            const files = Array.from(event.target.files ?? [])
            if (files.length > 0) {
              uploadConceptImageMutation.mutate(files)
            }
            event.target.value = ''
          }}
        />

        {model.conceptImages && model.conceptImages.length > 0 ? (
          <div className="model-info-concept-grid">
            {model.conceptImages.map(image => (
              <div key={image.fileId} className="model-info-concept-card">
                <img
                  src={
                    resolveApiAssetUrl(image.previewUrl) ||
                    getFilePreviewUrl(String(image.fileId))
                  }
                  alt={image.fileName}
                />
                <div className="model-info-concept-footer">
                  <span title={image.fileName}>{image.fileName}</span>
                  <Button
                    icon="pi pi-times"
                    text
                    rounded
                    severity="danger"
                    onClick={() =>
                      removeConceptImageMutation.mutate(image.fileId)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="model-info-empty">No concept images attached.</div>
        )}
      </div>

      <div className="model-info-section">
        <div className="tags-section">
          <label className="field-label">Tags:</label>
          <div className="tags-container">
            {tags.length > 0 ? (
              tags.map((tag, index) => (
                <Chip
                  key={index}
                  label={tag}
                  removable
                  onRemove={() => handleRemoveTag(tag)}
                  style={{ background: '#3b82f6', color: 'white' }}
                />
              ))
            ) : (
              <span className="empty-state-text">No tags yet</span>
            )}
          </div>
          <div className="tag-input-group">
            <InputText
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add new tag..."
              className="tag-input"
            />
            <Button
              icon="pi pi-plus"
              aria-label="Add tag"
              tooltip="Add tag"
              tooltipOptions={{ position: 'top' }}
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              size="small"
              className="tag-add-button"
            />
          </div>
        </div>

        <div className="description-section">
          <label className="field-label">Description:</label>
          <InputTextarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Enter description..."
            rows={3}
            className="description-textarea"
          />
        </div>

        <Button
          label={saveModelInfoMutation.isPending ? 'Saving...' : 'Save Changes'}
          icon="pi pi-save"
          onClick={handleSave}
          disabled={saveModelInfoMutation.isPending}
          className="save-button"
        />
      </div>
    </div>
  )
}
