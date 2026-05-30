import './CategoryTreeControls.css'

import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from 'primereact/button'
import { confirmDialog } from 'primereact/confirmdialog'
import { Dialog } from 'primereact/dialog'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Toast } from 'primereact/toast'
import { Tree } from 'primereact/tree'
import { type TreeNode } from 'primereact/treenode'
import { TreeSelect } from 'primereact/treeselect'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { type z } from 'zod'

import { type HierarchicalCategory } from '@/shared/types/categories'
import {
  buildCategoryTree,
  buildExpandedKeys,
  collectCategoryBranchIds,
  findCategoryById,
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
  createLabel?: string
}

// `null` -> showing the list; a number -> editing that category; 'new' ->
// adding. Keeping list and form as distinct views (instead of a permanent
// two-pane editor) makes the add-vs-edit mode unmistakable.
type FormTarget = number | 'new' | null

export function CategoryManagerDialog<TCategory extends HierarchicalCategory>({
  title,
  visible,
  categories,
  onHide,
  createCategory,
  updateCategory,
  deleteCategory,
  createLabel = 'Create Category',
}: CategoryManagerDialogProps<TCategory>) {
  const [formTarget, setFormTarget] = useState<FormTarget>(null)
  const [isSaving, setIsSaving] = useState(false)
  const toastRef = useRef<Toast>(null)

  const isFormOpen = formTarget !== null
  const editingId = typeof formTarget === 'number' ? formTarget : null

  const {
    control,
    handleSubmit,
    reset,
    formState: { isValid },
  } = useForm<CategoryFormInput, unknown, CategoryFormOutput>({
    resolver: zodResolver(hierarchicalCategoryFormSchema),
    mode: 'onChange',
    defaultValues: { name: '', description: '', parentId: null },
  })

  const treeNodes = useMemo(() => buildCategoryTree(categories), [categories])
  const expandedKeys = useMemo(() => buildExpandedKeys(treeNodes), [treeNodes])
  const editingCategory = useMemo(
    () => (editingId !== null ? findCategoryById(categories, editingId) : null),
    [categories, editingId]
  )
  const blockedParentIds = useMemo(() => {
    if (editingId === null) {
      return undefined
    }
    return collectCategoryBranchIds(categories, editingId)
  }, [categories, editingId])
  const parentTreeNodes = useMemo(
    () => buildCategoryTree(categories, blockedParentIds),
    [blockedParentIds, categories]
  )

  // Always return to the list when the dialog (re)opens.
  useEffect(() => {
    if (visible) {
      setFormTarget(null)
    }
  }, [visible])

  // Seed the form synchronously when entering add/edit so a post-render
  // reset can't clobber freshly-typed input (and a background categories
  // refetch can't wipe an in-progress edit).
  const openAddForm = () => {
    reset({ name: '', description: '', parentId: null })
    setFormTarget('new')
  }

  const openEditForm = (category: TCategory) => {
    reset({
      name: category.name,
      description: category.description ?? '',
      parentId: category.parentId ?? null,
    })
    setFormTarget(category.id)
  }

  const onSubmit = handleSubmit(async values => {
    // Guard against the race where a background categories refetch has
    // dropped the category being edited (e.g. another client deleted it).
    // Without this, the `editingCategory` memo returns null and the submit
    // would silently create a *new* category from the form values instead
    // of failing.
    if (editingId !== null && !editingCategory) {
      toastRef.current?.show({
        severity: 'warn',
        summary: 'Category no longer exists',
        detail:
          'It was removed since you opened the form. Returning to the list.',
        life: 5000,
      })
      setFormTarget(null)
      return
    }

    setIsSaving(true)
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, values)
        toastRef.current?.show({
          severity: 'success',
          summary: 'Category updated',
          detail: values.name,
          life: 3000,
        })
      } else {
        await createCategory(values)
        toastRef.current?.show({
          severity: 'success',
          summary: 'Category created',
          detail: values.name,
          life: 3000,
        })
      }
      setFormTarget(null)
    } catch (error) {
      // Keep the form open so the user can correct their input. Surface the
      // server's message (e.g. "A category named 'X' already exists in this
      // branch.") via an error toast instead of dropping it silently.
      const detail =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message ??
        (error as Error | undefined)?.message ??
        'The category could not be saved.'
      toastRef.current?.show({
        severity: 'error',
        summary: editingCategory
          ? 'Could not update category'
          : 'Could not create category',
        detail,
        life: 5000,
      })
    } finally {
      setIsSaving(false)
    }
  })

  const requestDelete = (category: TCategory) => {
    const childCount = categories.filter(c => c.parentId === category.id).length
    const subcategoryNote =
      childCount > 0
        ? ` Its ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'} will be affected.`
        : ''

    confirmDialog({
      header: 'Delete category',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      acceptLabel: 'Delete',
      message: `Delete "${category.name}"? This cannot be undone.${subcategoryNote}`,
      accept: async () => {
        try {
          await deleteCategory(category.id)
          toastRef.current?.show({
            severity: 'success',
            summary: 'Category deleted',
            detail: category.name,
            life: 3000,
          })
          if (editingId === category.id) {
            setFormTarget(null)
          }
        } catch (error) {
          // PrimeReact confirmDialog does not catch async rejections, so an
          // uncaught throw here becomes an unhandled promise rejection and
          // the user sees no feedback at all.
          const detail =
            (error as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ??
            (error as Error | undefined)?.message ??
            'The category could not be deleted.'
          toastRef.current?.show({
            severity: 'error',
            summary: 'Could not delete category',
            detail,
            life: 5000,
          })
        }
      },
    })
  }

  // Memoised so the Tree doesn't re-render every node on each keystroke in
  // the sibling name input.
  const nodeTemplate = useCallback(
    (node: TreeNode) => {
      const category = node.data as TCategory
      return (
        <div className="category-row">
          <span className="category-row-name">{category.name}</span>
          <span className="category-row-actions">
            <Button
              type="button"
              icon="pi pi-pencil"
              text
              rounded
              aria-label={`Edit ${category.name}`}
              onClick={event => {
                event.stopPropagation()
                openEditForm(category)
              }}
            />
            <Button
              type="button"
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              aria-label={`Delete ${category.name}`}
              onClick={event => {
                event.stopPropagation()
                requestDelete(category)
              }}
            />
          </span>
        </div>
      )
    },
    // openEditForm / requestDelete close over `reset` and `categories`; including
    // categories keeps the count-aware delete confirmation message fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories]
  )

  return (
    <Dialog
      header={title}
      visible={visible}
      style={{ width: '520px', maxWidth: '94vw' }}
      onHide={onHide}
    >
      <Toast ref={toastRef} />

      {isFormOpen ? (
        <form
          className="category-form"
          onSubmit={event => void onSubmit(event)}
        >
          <div className="category-form-header">
            <Button
              type="button"
              icon="pi pi-arrow-left"
              text
              rounded
              aria-label="Back to categories"
              onClick={() => setFormTarget(null)}
            />
            <h4>{editingCategory ? 'Edit category' : 'Add category'}</h4>
          </div>

          <div className="category-form-field">
            <label htmlFor="category-name">Name</label>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <InputText
                  id="category-name"
                  {...field}
                  autoFocus
                  placeholder="e.g. Environment, Props, Characters"
                />
              )}
            />
          </div>

          <div className="category-form-field">
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
                  placeholder="None (top level)"
                  showClear
                  filter
                  selectionMode="single"
                  className="category-form-control"
                  disabled={parentTreeNodes.length === 0}
                />
              )}
            />
          </div>

          <div className="category-form-field">
            <label htmlFor="category-description">Description</label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <InputTextarea
                  id="category-description"
                  {...field}
                  rows={3}
                  placeholder="Optional"
                  className="category-form-control"
                />
              )}
            />
          </div>

          <div className="category-form-actions">
            <Button
              type="button"
              label="Cancel"
              text
              onClick={() => setFormTarget(null)}
              disabled={isSaving}
            />
            <Button
              type="submit"
              label={editingCategory ? 'Save Changes' : createLabel}
              icon="pi pi-check"
              disabled={!isValid || isSaving}
              loading={isSaving}
            />
          </div>
        </form>
      ) : (
        <div className="category-list">
          <div className="category-list-header">
            <span className="category-list-count">
              {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
            </span>
            <Button
              label="Add category"
              icon="pi pi-plus"
              onClick={openAddForm}
            />
          </div>

          {treeNodes.length > 0 ? (
            <div className="category-manager-list">
              <Tree
                value={treeNodes}
                expandedKeys={expandedKeys}
                nodeTemplate={nodeTemplate}
                className="category-tree"
              />
            </div>
          ) : (
            <div className="category-tree-empty-state">
              No categories yet. Click “Add category” to create one.
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
