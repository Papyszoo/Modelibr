import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Tree } from 'primereact/tree'
import { useEffect, useMemo, useState } from 'react'

import {
  buildExpandedKeys,
  buildModelCategoryTree,
} from '@/features/models/utils/categoryTree'
import { type ModelCategoryDto } from '@/types'

interface ChangeModelCategoryDialogProps {
  visible: boolean
  categories: ModelCategoryDto[]
  selectedCount: number
  initialCategoryId?: number | null
  onHide: () => void
  onConfirm: (categoryId: number) => Promise<void>
}

export function ChangeModelCategoryDialog({
  visible,
  categories,
  selectedCount,
  initialCategoryId = null,
  onHide,
  onConfirm,
}: ChangeModelCategoryDialogProps) {
  const [selectedId, setSelectedId] = useState<number | null>(initialCategoryId)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!visible) {
      return
    }

    setSelectedId(initialCategoryId)
  }, [initialCategoryId, visible])

  const categoryTreeNodes = useMemo(
    () => buildModelCategoryTree(categories),
    [categories]
  )

  const expandedKeys = useMemo(
    () => buildExpandedKeys(categoryTreeNodes),
    [categoryTreeNodes]
  )

  const selectedTreeKeys = selectedId ? { [String(selectedId)]: true } : {}
  const selectedCountLabel = `${selectedCount} model${selectedCount === 1 ? '' : 's'}`

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
      <div className="model-change-category-dialog">
        <p className="model-change-category-description">
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
            className="model-category-tree"
          />
        ) : (
          <div className="model-category-empty-state">
            No categories available yet.
          </div>
        )}

        <div className="model-change-category-actions">
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
