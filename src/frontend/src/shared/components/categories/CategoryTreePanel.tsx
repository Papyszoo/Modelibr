import './CategoryTreeControls.css'

import { confirmDialog } from 'primereact/confirmdialog'
import { ContextMenu } from 'primereact/contextmenu'
import { InputText } from 'primereact/inputtext'
import { type MenuItem } from 'primereact/menuitem'
import { Tree } from 'primereact/tree'
import { type TreeNode } from 'primereact/treenode'
import { useEffect, useMemo, useRef, useState } from 'react'

import { type HierarchicalCategory } from '@/shared/types/categories'
import {
  buildCategoryTree,
  buildExpandedKeys,
  collectCategoryBranchIds,
  getSelectedTreeId,
} from '@/shared/utils/categoryTree'

/** Tree key of the transient "type a name" row while creating a category. */
const NEW_CATEGORY_NODE_KEY = '__new-category__'

type EditState =
  | { mode: 'create'; parentId: number | null }
  | { mode: 'rename'; categoryId: number }

interface CategoryTreePanelProps<TCategory extends HierarchicalCategory> {
  categories: TCategory[]
  activeCategoryId: number | null
  dragOverCategoryId: number | null
  categoryCounts: Map<number, number>
  unassignedCount: number
  /** Count shown on the "All" bucket (every asset in every category). */
  allCount: number
  onCategoryChange: (categoryId: number) => void
  onCategoryDragOver: (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => void
  onCategoryDragLeave: (event: React.DragEvent<HTMLDivElement>) => void
  onCategoryDrop: (
    event: React.DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => void
  unassignedCategoryId: number
  unassignedLabel?: string
  /** Sentinel id reported via onCategoryChange when "All" is clicked. */
  allCategoryId: number
  allLabel?: string
  compact?: boolean
  /**
   * Singular noun used in the delete-confirmation warning
   * ("3 sounds will become uncategorized."). Pluralized with a plain "s".
   */
  itemNoun?: string
  /**
   * Category management via the right-click context menu. All three must be
   * provided to enable it: right-clicking a category offers
   * add-subcategory / rename / delete (with a branch warning), right-clicking
   * anywhere else offers add-category. Names are typed inline in the tree.
   */
  onCreateCategory?: (
    name: string,
    parentId: number | null
  ) => void | Promise<unknown>
  onRenameCategory?: (
    category: TCategory,
    name: string
  ) => void | Promise<unknown>
  onDeleteCategory?: (category: TCategory) => void | Promise<unknown>
}

/**
 * Inline name editor rendered in place of a tree row while creating or
 * renaming. Enter/blur commit, Escape cancels; an empty (or, for rename,
 * unchanged) name cancels silently.
 */
function InlineNameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  // Guards the blur that follows an Enter/Escape from double-committing.
  const settledRef = useRef(false)

  const settle = (action: () => void) => {
    if (settledRef.current) return
    settledRef.current = true
    action()
  }

  const commit = (rawValue: string) => {
    const name = rawValue.trim()
    if (!name || name === initialValue.trim()) {
      onCancel()
      return
    }
    onCommit(name)
  }

  return (
    <InputText
      autoFocus
      defaultValue={initialValue}
      className="category-tree-inline-input"
      data-testid="category-tree-inline-input"
      aria-label="Category name"
      placeholder="Category name"
      onFocus={event => event.target.select()}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          settle(() => commit((event.target as HTMLInputElement).value))
        } else if (event.key === 'Escape') {
          settle(onCancel)
        }
      }}
      onBlur={event => settle(() => commit(event.target.value))}
    />
  )
}

export function CategoryTreePanel<TCategory extends HierarchicalCategory>({
  categories,
  activeCategoryId,
  dragOverCategoryId,
  categoryCounts,
  unassignedCount,
  allCount,
  onCategoryChange,
  onCategoryDragOver,
  onCategoryDragLeave,
  onCategoryDrop,
  unassignedCategoryId,
  unassignedLabel = 'Unassigned',
  allCategoryId,
  allLabel = 'All',
  compact = false,
  itemNoun = 'asset',
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
}: CategoryTreePanelProps<TCategory>) {
  const [editState, setEditState] = useState<EditState | null>(null)
  // Category under the pointer when the context menu opened; null = the
  // panel background (or a bucket row), which only offers "Add category".
  const [contextTarget, setContextTarget] = useState<TCategory | null>(null)
  const contextMenuRef = useRef<ContextMenu>(null)

  const canManage = Boolean(
    onCreateCategory && onRenameCategory && onDeleteCategory
  )

  const categoryNodes = useMemo(
    () => buildCategoryTree(categories),
    [categories]
  )

  // While creating, a transient input row is spliced into the tree at the
  // chosen parent so the name is typed exactly where the category will live.
  const displayNodes = useMemo(() => {
    if (editState?.mode !== 'create') {
      return categoryNodes
    }
    const placeholder: TreeNode = {
      key: NEW_CATEGORY_NODE_KEY,
      label: '',
      selectable: false,
      leaf: true,
    }
    if (editState.parentId === null) {
      return [...categoryNodes, placeholder]
    }
    const parentKey = String(editState.parentId)
    const insert = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(node => {
        if (node.key === parentKey) {
          return { ...node, children: [...(node.children ?? []), placeholder] }
        }
        return node.children?.length
          ? { ...node, children: insert(node.children) }
          : node
      })
    return insert(categoryNodes)
  }, [categoryNodes, editState])

  // Expansion is fully controlled (expandedKeys + onToggle). TRAP: without
  // onToggle, PrimeReact Tree seeds internal state from the prop ONCE and
  // ignores later updates - so a childless node that gains its first child
  // (the create-subcategory placeholder) would stay collapsed and hide the
  // inline editor. Parents start expanded when they first appear; user
  // toggles persist otherwise.
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({})
  const seenParentKeysRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const defaults = buildExpandedKeys(categoryNodes)
    const newKeys = Object.keys(defaults).filter(
      key => !seenParentKeysRef.current.has(key)
    )
    if (newKeys.length === 0) {
      return
    }
    for (const key of newKeys) {
      seenParentKeysRef.current.add(key)
    }
    setExpandedKeys(prev => {
      const next = { ...prev }
      for (const key of newKeys) {
        next[key] = true
      }
      return next
    })
  }, [categoryNodes])

  const startCreate = (parentId: number | null) => {
    setEditState({ mode: 'create', parentId })
    if (parentId !== null) {
      // The placeholder lives under this parent - it must be expanded for
      // the inline editor to render.
      setExpandedKeys(prev => ({ ...prev, [String(parentId)]: true }))
    }
  }

  // PrimeReact Tree in `selectionMode="single"` expects selectionKeys to be
  // the selected key as a string - the `{ key: true }` map form is only for
  // multiple/checkbox modes and silently never highlights in single mode.
  const selectedTreeKeys =
    activeCategoryId !== null &&
    activeCategoryId !== unassignedCategoryId &&
    activeCategoryId !== allCategoryId
      ? String(activeCategoryId)
      : null

  const openContextMenu = (
    event: React.MouseEvent,
    category: TCategory | null
  ) => {
    if (!canManage) return
    event.preventDefault()
    event.stopPropagation()
    setContextTarget(category)
    contextMenuRef.current?.show(event)
  }

  const requestDelete = (category: TCategory) => {
    const branchIds = collectCategoryBranchIds(categories, category.id)
    const subcategoryCount = branchIds.size - 1
    let affectedItems = 0
    for (const branchId of branchIds) {
      affectedItems += categoryCounts.get(branchId) ?? 0
    }

    const question =
      subcategoryCount > 0
        ? `Delete "${category.name}" and its ${subcategoryCount} subcategor${subcategoryCount === 1 ? 'y' : 'ies'}?`
        : `Delete "${category.name}"?`
    const consequence =
      affectedItems > 0
        ? ` ${affectedItems} ${itemNoun}${affectedItems === 1 ? '' : 's'} will become uncategorized.`
        : ''

    confirmDialog({
      header: 'Delete category',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      acceptLabel: 'Delete',
      message: `${question}${consequence}`,
      accept: () => void onDeleteCategory?.(category),
    })
  }

  const contextMenuItems: MenuItem[] = contextTarget
    ? [
        {
          label: 'Add subcategory',
          icon: 'pi pi-plus',
          command: () => startCreate(contextTarget.id),
        },
        {
          label: 'Rename',
          icon: 'pi pi-pencil',
          command: () =>
            setEditState({ mode: 'rename', categoryId: contextTarget.id }),
        },
        { separator: true },
        {
          label: 'Delete',
          icon: 'pi pi-trash',
          command: () => requestDelete(contextTarget),
        },
      ]
    : [
        {
          label: 'Add category',
          icon: 'pi pi-plus',
          command: () => startCreate(null),
        },
      ]

  return (
    <div
      className={`category-tree-panel${compact ? ' is-compact' : ''}`}
      onContextMenu={event => openContextMenu(event, null)}
    >
      {canManage && (
        <ContextMenu ref={contextMenuRef} model={contextMenuItems} />
      )}

      <div
        className={`category-tree-bucket category-tree-all${activeCategoryId === allCategoryId ? ' is-active' : ''}`}
        data-testid="category-tree-all"
        onClick={() => onCategoryChange(allCategoryId)}
      >
        <span className="category-tree-bucket-label">{allLabel}</span>
        <span className="category-tree-count">({allCount})</span>
      </div>

      <div
        className={`category-tree-bucket category-tree-unassigned${activeCategoryId === unassignedCategoryId ? ' is-active' : ''}${dragOverCategoryId === unassignedCategoryId ? ' is-drag-over' : ''}`}
        data-testid="category-tree-unassigned"
        onClick={() => onCategoryChange(unassignedCategoryId)}
        onDragOver={event => onCategoryDragOver(event, unassignedCategoryId)}
        onDragLeave={onCategoryDragLeave}
        onDrop={event => onCategoryDrop(event, unassignedCategoryId)}
      >
        <span className="category-tree-bucket-label">{unassignedLabel}</span>
        <span className="category-tree-count">({unassignedCount})</span>
      </div>

      {displayNodes.length > 0 && (
        <Tree
          value={displayNodes}
          selectionMode="single"
          selectionKeys={selectedTreeKeys}
          expandedKeys={expandedKeys}
          onToggle={event =>
            setExpandedKeys(event.value as Record<string, boolean>)
          }
          onSelectionChange={event => {
            const categoryId = getSelectedTreeId(event.value)
            if (categoryId !== null && !Number.isNaN(categoryId)) {
              onCategoryChange(categoryId)
            }
          }}
          nodeTemplate={node => {
            if (node.key === NEW_CATEGORY_NODE_KEY) {
              const parentId =
                editState?.mode === 'create' ? editState.parentId : null
              return (
                <InlineNameInput
                  initialValue=""
                  onCommit={name => {
                    setEditState(null)
                    void onCreateCategory?.(name, parentId)
                  }}
                  onCancel={() => setEditState(null)}
                />
              )
            }

            const category = node.data as TCategory
            if (
              editState?.mode === 'rename' &&
              editState.categoryId === category.id
            ) {
              return (
                <InlineNameInput
                  initialValue={category.name}
                  onCommit={name => {
                    setEditState(null)
                    void onRenameCategory?.(category, name)
                  }}
                  onCancel={() => setEditState(null)}
                />
              )
            }

            const isDragOver = dragOverCategoryId === category.id

            return (
              <div
                className={`category-tree-node-content${isDragOver ? ' is-drag-over' : ''}`}
                onDragOver={event => onCategoryDragOver(event, category.id)}
                onDragLeave={onCategoryDragLeave}
                onDrop={event => onCategoryDrop(event, category.id)}
                onContextMenu={event => openContextMenu(event, category)}
                title={category.path}
              >
                <span className="category-tree-node-label">
                  {category.name}
                </span>
                <span className="category-tree-count">
                  ({categoryCounts.get(category.id) ?? 0})
                </span>
              </div>
            )
          }}
          className="category-tree"
        />
      )}
    </div>
  )
}
