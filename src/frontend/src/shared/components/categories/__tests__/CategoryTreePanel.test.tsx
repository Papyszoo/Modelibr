import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { HierarchicalCategory } from '@/shared/types/categories'

import { CategoryTreePanel } from '../CategoryTreePanel'

const categories: HierarchicalCategory[] = [
  { id: 1, name: 'Environment', path: '1' },
  { id: 2, name: 'Props', path: '2' },
  { id: 3, name: 'Rocks', parentId: 2, path: '2/3' },
]

const UNASSIGNED_ID = -1

function renderPanel(
  activeCategoryId: number | null,
  onCategoryChange = jest.fn()
) {
  render(
    <CategoryTreePanel
      categories={categories}
      activeCategoryId={activeCategoryId}
      dragOverCategoryId={null}
      categoryCounts={new Map([[2, 8]])}
      unassignedCount={4}
      unassignedCategoryId={UNASSIGNED_ID}
      unassignedLabel="Uncategorized"
      onCategoryChange={onCategoryChange}
      onCategoryDragOver={jest.fn()}
      onCategoryDragLeave={jest.fn()}
      onCategoryDrop={jest.fn()}
    />
  )
  return onCategoryChange
}

describe('CategoryTreePanel selection', () => {
  // Regression: selectionKeys was passed as a `{ key: true }` map, which
  // PrimeReact Tree only understands in multiple/checkbox modes — in
  // selectionMode="single" it expects the key string, so the active
  // category silently never got its p-highlight tint (shipped bug).
  it('highlights the active category node', () => {
    renderPanel(2)

    const highlighted = document.querySelector(
      '.category-tree .p-highlight .p-treenode-content, .category-tree .p-treenode-content.p-highlight'
    )
    expect(highlighted).not.toBeNull()
    expect(highlighted!.textContent).toContain('Props')
  })

  it('does not highlight any tree node when the unassigned bucket is active', () => {
    renderPanel(UNASSIGNED_ID)

    expect(document.querySelector('.category-tree .p-highlight')).toBeNull()
    expect(
      document.querySelector('.category-tree-unassigned')!.className
    ).toContain('is-active')
  })

  // Contract with getSelectedTreeId: node keys are String(id) and clicking a
  // node must surface the numeric id — catches key-format drift between
  // buildCategoryTree and the selection plumbing.
  it('reports the clicked category id', async () => {
    const user = userEvent.setup()
    const onCategoryChange = renderPanel(null)

    await user.click(screen.getByText('Environment'))

    expect(onCategoryChange).toHaveBeenCalledWith(1)
  })
})
