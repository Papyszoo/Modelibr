import { Button } from 'primereact/button'
import { type DragEvent } from 'react'

import { type SoundCategoryDto, type SoundDto } from '@/types'

const UNASSIGNED_CATEGORY_ID = -1

interface SoundCategoryTabsProps {
  categories: SoundCategoryDto[]
  sounds: SoundDto[]
  activeCategoryId: number | null
  dragOverCategoryId: number | null
  onCategoryChange: (categoryId: number) => void
  onCategoryDragOver: (
    e: DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => void
  onCategoryDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onCategoryDrop: (
    e: DragEvent<HTMLDivElement>,
    categoryId: number | null
  ) => void
  onEditCategory: (category: SoundCategoryDto) => void
  onDeleteCategory: (category: SoundCategoryDto) => void
}

export function SoundCategoryTabs({
  categories,
  sounds,
  activeCategoryId,
  dragOverCategoryId,
  onCategoryChange,
  onCategoryDragOver,
  onCategoryDragLeave,
  onCategoryDrop,
  onEditCategory,
  onDeleteCategory,
}: SoundCategoryTabsProps) {
  return (
    <div className="sound-category-tabs">
      <div
        className={`category-tab ${activeCategoryId === UNASSIGNED_CATEGORY_ID ? 'active' : ''} ${dragOverCategoryId === UNASSIGNED_CATEGORY_ID ? 'drag-over' : ''}`}
        onClick={() => onCategoryChange(UNASSIGNED_CATEGORY_ID)}
        onDragOver={e => onCategoryDragOver(e, UNASSIGNED_CATEGORY_ID)}
        onDragLeave={onCategoryDragLeave}
        onDrop={e => onCategoryDrop(e, UNASSIGNED_CATEGORY_ID)}
      >
        <span>Unassigned</span>
        <span className="category-count">
          ({sounds.filter(s => s.categoryId === null).length})
        </span>
      </div>
      {categories.map(category => (
        <div
          key={category.id}
          className={`category-tab ${activeCategoryId === category.id ? 'active' : ''} ${dragOverCategoryId === category.id ? 'drag-over' : ''}`}
          onClick={() => onCategoryChange(category.id)}
          onDragOver={e => onCategoryDragOver(e, category.id)}
          onDragLeave={onCategoryDragLeave}
          onDrop={e => onCategoryDrop(e, category.id)}
        >
          <span>{category.name}</span>
          <span className="category-count">
            ({sounds.filter(s => s.categoryId === category.id).length})
          </span>
          {activeCategoryId === category.id && (
            <div className="category-tab-actions">
              <Button
                icon="pi pi-pencil"
                className="p-button-text p-button-sm"
                onClick={e => {
                  e.stopPropagation()
                  onEditCategory(category)
                }}
                tooltip="Rename category"
              />
              <Button
                icon="pi pi-trash"
                className="p-button-text p-button-sm p-button-danger"
                onClick={e => {
                  e.stopPropagation()
                  onDeleteCategory(category)
                }}
                tooltip="Delete category"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
