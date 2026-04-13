import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Tree } from 'primereact/tree'
import { useEffect, useMemo, useState } from 'react'

import {
  buildCategoryTree,
  buildExpandedKeys,
} from '@/shared/utils/categoryTree'
import { type EnvironmentMapCategoryDto } from '@/types'

interface ChangeEnvironmentMapCategoryDialogProps {
  visible: boolean
  categories: EnvironmentMapCategoryDto[]
  selectedCount: number
  initialCategoryId?: number | null
  onHide: () => void
  onManageCategories?: () => void
  onConfirm: (categoryId: number) => Promise<void>
}

export function ChangeEnvironmentMapCategoryDialog({
  visible,
  categories,
  selectedCount,
  initialCategoryId = null,
  onHide,
  onManageCategories,
  onConfirm,
}: ChangeEnvironmentMapCategoryDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(initialCategoryId)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!visible) {
      return
    }

    setSelectedId(initialCategoryId)
  }, [initialCategoryId, visible])

  const categoryTreeNodes = useMemo(
    () => buildCategoryTree(categories),
    [categories]
  )
  const expandedKeys = useMemo(
    () => buildExpandedKeys(categoryTreeNodes),
    [categoryTreeNodes]
  )
  const selectedTreeKeys = selectedId ? { [String(selectedId)]: true } : {}
  const selectedCountLabel = `${selectedCount} environment map${selectedCount === 1 ? '' : 's'}`

  const getSelectedTreeId = (
    value: string | Record<string, boolean> | null | undefined
  ): number | null => {
    if (!value) {
      return null
    }

    const rawKey =
      typeof value === 'string' ? value : (Object.keys(value)[0] ?? null)

    if (!rawKey) {
      return null
    }

    const parsed = Number(rawKey)

    return Number.isFinite(parsed) ? parsed : null
  }

  const handleConfirm = async () => {
    if (selectedId === null) {
      return
    }

    setIsSaving(true)
    try {
      await onConfirm(selectedId)
      onHide()
    } catch {
      // Toast feedback is handled by the caller.
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      header="Change Category"
      visible={visible}
      style={{ width: '620px', maxWidth: '96vw' }}
      onHide={onHide}
    >
      <div className="environment-map-change-category-dialog">
        <p className="environment-map-change-category-description">
          Select the destination category for {selectedCountLabel}.
        </p>

        {categoryTreeNodes.length > 0 ? (
          <Tree
            value={categoryTreeNodes}
            selectionMode="single"
            selectionKeys={selectedTreeKeys}
            expandedKeys={expandedKeys}
            onSelectionChange={event => {
              setSelectedId(getSelectedTreeId(event.value))
            }}
            className="environment-map-category-tree"
          />
        ) : (
          <div className="environment-map-category-empty-state">
            <span>No categories available yet.</span>
            {onManageCategories ? (
              <Button
                label="Manage Categories"
                icon="pi pi-sitemap"
                text
                onClick={() => {
                  onHide()
                  onManageCategories()
                }}
              />
            ) : null}
          </div>
        )}

        <div className="environment-map-change-category-actions">
          <Button label="Cancel" text onClick={onHide} disabled={isSaving} />
          <Button
            label="Move"
            icon="pi pi-check"
            onClick={handleConfirm}
            disabled={
              selectedId === null || isSaving || categories.length === 0
            }
            loading={isSaving}
          />
        </div>
      </div>
    </Dialog>
  )
}
