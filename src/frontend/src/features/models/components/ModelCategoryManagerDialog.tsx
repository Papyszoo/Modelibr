import './ModelCategoryManagerDialog.css'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Tree } from 'primereact/tree'
import { TreeSelect } from 'primereact/treeselect'
import { useEffect, useMemo, useState } from 'react'

import {
  createModelCategory,
  deleteModelCategory,
  updateModelCategory,
} from '@/features/models/api/modelApi'
import {
  buildExpandedKeys,
  buildModelCategoryTree,
  collectCategoryBranchIds,
} from '@/features/models/utils/categoryTree'
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

  const allCategoryTreeNodes = useMemo(
    () => buildModelCategoryTree(categories),
    [categories]
  )

  const blockedParentIds = useMemo(() => {
    if (selectedId === null) {
      return undefined
    }

    return collectCategoryBranchIds(categories, selectedId)
  }, [categories, selectedId])

  const parentTreeNodes = useMemo(
    () => buildModelCategoryTree(categories, blockedParentIds),
    [blockedParentIds, categories]
  )

  const expandedKeys = useMemo(
    () => buildExpandedKeys(allCategoryTreeNodes),
    [allCategoryTreeNodes]
  )

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

  const canSubmit = name.trim().length > 0

  const selectedTreeKeys = selectedId ? { [String(selectedId)]: true } : {}
  const selectedParentKey = parentId !== null ? String(parentId) : null

  const getSelectedTreeId = (
    value: string | Record<string, boolean> | null | undefined
  ): number | null => {
    if (!value) {
      return null
    }

    const rawKey =
      typeof value === 'string' ? value : (Object.keys(value)[0] ?? null)

    return rawKey ? Number(rawKey) : null
  }

  return (
    <Dialog
      header="Manage Model Categories"
      visible={visible}
      style={{ width: '880px', maxWidth: '96vw' }}
      className="model-category-dialog"
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
          <div className="model-category-list-tree">
            {allCategoryTreeNodes.length > 0 ? (
              <Tree
                value={allCategoryTreeNodes}
                selectionMode="single"
                selectionKeys={selectedTreeKeys}
                expandedKeys={expandedKeys}
                onSelectionChange={event => {
                  setSelectedId(getSelectedTreeId(event.value))
                }}
                className="model-category-tree"
              />
            ) : (
              <div className="model-category-empty-state">
                No categories yet.
              </div>
            )}
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
            <TreeSelect
              id="category-parent"
              value={selectedParentKey}
              options={parentTreeNodes}
              onChange={e => {
                const value =
                  typeof e.value === 'string' || e.value === null
                    ? e.value
                    : String(e.value)
                setParentId(value ? Number(value) : null)
              }}
              placeholder="Root category"
              showClear
              filter
              selectionMode="single"
              className="model-category-parent-select"
              disabled={parentTreeNodes.length === 0}
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
