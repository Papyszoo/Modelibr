import { Button } from 'primereact/button'
import { Dialog } from 'primereact/dialog'
import { Tree } from 'primereact/tree'
import { useEffect, useMemo, useState } from 'react'

import {
  buildCategoryTree,
  buildExpandedKeys,
  getSelectedTreeId,
} from '@/shared/utils/categoryTree'
import { type TextureSetCategoryDto } from '@/types'

interface ChangeTextureSetCategoryDialogProps {
  visible: boolean
  categories: TextureSetCategoryDto[]
  selectedCount: number
  unitLabel: string
  initialCategoryId?: number | null
  onHide: () => void
  onConfirm: (categoryId: number) => Promise<void>
}

export function ChangeTextureSetCategoryDialog({
  visible,
  categories,
  selectedCount,
  unitLabel,
  initialCategoryId = null,
  onHide,
  onConfirm,
}: ChangeTextureSetCategoryDialogProps) {
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
  const selectedCountLabel = `${selectedCount} ${unitLabel}${selectedCount === 1 ? '' : 's'}`

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
      <div className="texture-set-change-category-dialog">
        <p className="texture-set-change-category-description">
          Select the destination category for {selectedCountLabel}.
        </p>

        {categoryTreeNodes.length > 0 ? (
          <Tree
            value={categoryTreeNodes}
            selectionMode="single"
            selectionKeys={selectedTreeKeys}
            expandedKeys={expandedKeys}
            onSelectionChange={event => {
              setSelectedId(
                getSelectedTreeId(
                  event.value as string | Record<string, boolean> | null
                )
              )
            }}
            className="texture-set-category-tree"
          />
        ) : (
          <div className="texture-set-category-empty-state">
            <span>No categories available yet.</span>
          </div>
        )}

        <div className="texture-set-change-category-actions">
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
