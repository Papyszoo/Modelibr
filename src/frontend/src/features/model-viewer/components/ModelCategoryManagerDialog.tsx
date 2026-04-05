import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { useEffect, useMemo, useState } from 'react'

import {
  createModelCategory,
  deleteModelCategory,
  updateModelCategory,
} from '@/features/models/api/modelApi'
import { type ModelCategoryDto } from '@/types'

interface ModelCategoryManagerDialogProps {
  visible: boolean
  categories: ModelCategoryDto[]
  onHide: () => void
}

export function ModelCategoryManagerDialog({
  visible,
  categories,
  onHide,
}: ModelCategoryManagerDialogProps) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)

  const selectedCategory = useMemo(
    () => categories.find(category => category.id === selectedId) ?? null,
    [categories, selectedId]
  )

  useEffect(() => {
    if (!selectedCategory) {
      setName('')
      setDescription('')
      setParentId(null)
      return
    }

    setName(selectedCategory.name)
    setDescription(selectedCategory.description ?? '')
    setParentId(selectedCategory.parentId ?? null)
  }, [selectedCategory])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['model-categories'] }),
      queryClient.invalidateQueries({ queryKey: ['models'] }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createModelCategory({
        name,
        description: description || undefined,
        parentId,
      }),
    onSuccess: async created => {
      setSelectedId(created.id)
      await invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      updateModelCategory(selectedId!, {
        name,
        description: description || undefined,
        parentId,
      }),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteModelCategory(selectedId!),
    onSuccess: async () => {
      setSelectedId(null)
      await invalidate()
    },
  })

  const parentOptions = categories
    .filter(category => category.id !== selectedId)
    .map(category => ({ label: category.path, value: category.id }))

  const canSubmit = name.trim().length > 0

  return (
    <Dialog
      header="Manage Model Categories"
      visible={visible}
      style={{ width: '880px', maxWidth: '96vw' }}
      onHide={onHide}
    >
      <div className="model-category-manager">
        <div className="model-category-list">
          <div className="model-category-list-header">
            <h4>Existing Categories</h4>
            <Button
              label="New"
              icon="pi pi-plus"
              text
              onClick={() => setSelectedId(null)}
            />
          </div>
          <div className="model-category-items">
            {categories.map(category => (
              <button
                key={category.id}
                type="button"
                className={`model-category-item${selectedId === category.id ? ' active' : ''}`}
                onClick={() => setSelectedId(category.id)}
              >
                <span>{category.path}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="model-category-editor">
          <h4>{selectedCategory ? 'Edit Category' : 'Create Category'}</h4>
          <div className="model-category-field">
            <label htmlFor="category-name">Name</label>
            <InputText
              id="category-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Environment / Props / Characters"
            />
          </div>
          <div className="model-category-field">
            <label htmlFor="category-parent">Parent</label>
            <Dropdown
              id="category-parent"
              value={parentId}
              options={parentOptions}
              onChange={e => setParentId(e.value ?? null)}
              placeholder="Root category"
              showClear
              filter
            />
          </div>
          <div className="model-category-field">
            <label htmlFor="category-description">Description</label>
            <InputTextarea
              id="category-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder="Optional note about when to use this category"
            />
          </div>

          <div className="model-category-actions">
            <Button
              label={selectedCategory ? 'Save Changes' : 'Create Category'}
              icon="pi pi-save"
              onClick={() => {
                if (!canSubmit) return
                if (selectedCategory) {
                  updateMutation.mutate()
                } else {
                  createMutation.mutate()
                }
              }}
              disabled={
                !canSubmit ||
                createMutation.isPending ||
                updateMutation.isPending
              }
            />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              text
              onClick={() => deleteMutation.mutate()}
              disabled={!selectedCategory || deleteMutation.isPending}
            />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
