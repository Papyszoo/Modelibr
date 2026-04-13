import './CategoryTreeControls.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Tree } from 'primereact/tree'
import { TreeSelect } from 'primereact/treeselect'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { type z } from 'zod'

import { type HierarchicalCategory } from '@/shared/types/categories'
import {
  buildCategoryTree,
  buildExpandedKeys,
  collectCategoryBranchIds,
  findCategoryById,
  getSelectedTreeId,
} from '@/shared/utils/categoryTree'
import { hierarchicalCategoryFormSchema } from '@/shared/validation/formSchemas'

type CategoryFormInput = z.input<typeof hierarchicalCategoryFormSchema>
type CategoryFormOutput = z.output<typeof hierarchicalCategoryFormSchema>

interface CategoryManagerDialogProps<TCategory extends HierarchicalCategory> {
  title: string
  visible: boolean
  categories: TCategory[]
  onHide: () => void
  createCategory: (request: CategoryFormOutput) => Promise<unknown>
  updateCategory: (id: number, request: CategoryFormOutput) => Promise<unknown>
  deleteCategory: (id: number) => Promise<unknown>
  initialSelectedCategoryId?: number | null
  createLabel?: string
}

export function CategoryManagerDialog<TCategory extends HierarchicalCategory>({
  title,
  visible,
  categories,
  onHide,
  createCategory,
  updateCategory,
  deleteCategory,
  initialSelectedCategoryId = null,
  createLabel = 'Create Category',
}: CategoryManagerDialogProps<TCategory>) {
  const [selectedId, setSelectedId] = useState<number | null>(
    initialSelectedCategoryId
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<CategoryFormInput, unknown, CategoryFormOutput>({
    resolver: zodResolver(hierarchicalCategoryFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
      parentId: null,
    },
  })

  const allCategoryTreeNodes = useMemo(
    () => buildCategoryTree(categories),
    [categories]
  )
  const blockedParentIds = useMemo(() => {
    if (selectedId === null) {
      return undefined
    }

    return collectCategoryBranchIds(categories, selectedId)
  }, [categories, selectedId])
  const parentTreeNodes = useMemo(
    () => buildCategoryTree(categories, blockedParentIds),
    [blockedParentIds, categories]
  )
  const expandedKeys = useMemo(
    () => buildExpandedKeys(allCategoryTreeNodes),
    [allCategoryTreeNodes]
  )
  const selectedCategory = useMemo(
    () => findCategoryById(categories, selectedId),
    [categories, selectedId]
  )
  const selectedTreeKeys = selectedId ? { [String(selectedId)]: true } : {}

  useEffect(() => {
    if (!visible) {
      return
    }

    setSelectedId(initialSelectedCategoryId)
  }, [initialSelectedCategoryId, visible])

  useEffect(() => {
    if (!selectedCategory) {
      reset({
        name: '',
        description: '',
        parentId: null,
      })
      return
    }

    reset({
      name: selectedCategory.name,
      description: selectedCategory.description ?? '',
      parentId: selectedCategory.parentId ?? null,
    })
  }, [reset, selectedCategory])

  const onSubmit = handleSubmit(async values => {
    setIsSaving(true)

    try {
      if (selectedCategory) {
        await updateCategory(selectedCategory.id, values)
      } else {
        await createCategory(values)
      }
    } finally {
      setIsSaving(false)
    }
  })

  const handleDelete = async () => {
    if (!selectedCategory) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteCategory(selectedCategory.id)
      setSelectedId(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog
      header={title}
      visible={visible}
      style={{ width: '880px', maxWidth: '96vw' }}
      onHide={onHide}
    >
      <div className="category-manager">
        <div className="category-manager-list">
          <div className="category-manager-list-header">
            <h4>Existing Categories</h4>
            <Button
              label="New"
              icon="pi pi-plus"
              text
              onClick={() => setSelectedId(null)}
            />
          </div>

          <div className="category-manager-list-tree">
            {allCategoryTreeNodes.length > 0 ? (
              <Tree
                value={allCategoryTreeNodes}
                selectionMode="single"
                selectionKeys={selectedTreeKeys}
                expandedKeys={expandedKeys}
                onSelectionChange={event => {
                  setSelectedId(getSelectedTreeId(event.value))
                }}
                className="category-tree"
              />
            ) : (
              <div className="category-tree-empty-state">
                No categories yet.
              </div>
            )}
          </div>
        </div>

        <form
          className="category-manager-editor"
          onSubmit={event => void onSubmit(event)}
        >
          <h4>{selectedCategory ? 'Edit Category' : createLabel}</h4>

          <div className="category-manager-field">
            <label htmlFor="category-name">Name</label>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <InputText
                  id="category-name"
                  {...field}
                  placeholder="Environment / Props / Characters"
                />
              )}
            />
          </div>

          <div className="category-manager-field">
            <label htmlFor="category-parent">Parent</label>
            <Controller
              name="parentId"
              control={control}
              render={({ field }) => (
                <TreeSelect
                  id="category-parent"
                  value={field.value !== null ? String(field.value) : null}
                  options={parentTreeNodes}
                  onChange={event => {
                    const value =
                      typeof event.value === 'string' || event.value === null
                        ? event.value
                        : String(event.value)
                    field.onChange(value ? Number(value) : null)
                  }}
                  placeholder="Root category"
                  showClear
                  filter
                  selectionMode="single"
                  className="category-manager-parent-select"
                  disabled={parentTreeNodes.length === 0}
                />
              )}
            />
          </div>

          <div className="category-manager-field">
            <label htmlFor="category-description">Description</label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <InputTextarea
                  id="category-description"
                  {...field}
                  rows={5}
                  placeholder="Optional note about when to use this category"
                  className="category-manager-textarea"
                />
              )}
            />
          </div>

          <div className="category-manager-actions">
            <Button
              type="submit"
              label={selectedCategory ? 'Save Changes' : createLabel}
              icon="pi pi-save"
              disabled={!isValid || isSaving}
              loading={isSaving}
            />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              text
              onClick={() => void handleDelete()}
              disabled={!selectedCategory || isDeleting}
              loading={isDeleting}
            />
          </div>
        </form>
      </div>
    </Dialog>
  )
}
