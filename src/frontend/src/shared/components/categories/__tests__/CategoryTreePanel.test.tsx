import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from 'primereact/confirmdialog'

import {
  ALL_CATEGORIES_ID,
  type HierarchicalCategory,
  UNASSIGNED_CATEGORY_ID,
} from '@/shared/types/categories'

import { CategoryTreePanel } from '../CategoryTreePanel'

const categories: HierarchicalCategory[] = [
  { id: 1, name: 'Environment', path: '1' },
  { id: 2, name: 'Props', path: '2' },
  { id: 3, name: 'Rocks', parentId: 2, path: '2/3' },
]

function renderPanel({
  activeCategoryId = null as number | null,
  onCategoryChange = jest.fn(),
  onCreateCategory = jest.fn(),
  onRenameCategory = jest.fn(),
  onDeleteCategory = jest.fn(),
  panelCategories = categories,
} = {}) {
  render(
    <>
      {/* confirmDialog() needs a mounted ConfirmDialog outlet (App.tsx
          provides it in the real tree). */}
      <ConfirmDialog />
      <CategoryTreePanel
        categories={panelCategories}
        activeCategoryId={activeCategoryId}
        dragOverCategoryId={null}
        categoryCounts={new Map([[2, 8]])}
        unassignedCount={4}
        allCount={12}
        allCategoryId={ALL_CATEGORIES_ID}
        unassignedCategoryId={UNASSIGNED_CATEGORY_ID}
        unassignedLabel="Uncategorized"
        itemNoun="sound"
        onCategoryChange={onCategoryChange}
        onCategoryDragOver={jest.fn()}
        onCategoryDragLeave={jest.fn()}
        onCategoryDrop={jest.fn()}
        onCreateCategory={onCreateCategory}
        onRenameCategory={onRenameCategory}
        onDeleteCategory={onDeleteCategory}
      />
    </>
  )
  return {
    onCategoryChange,
    onCreateCategory,
    onRenameCategory,
    onDeleteCategory,
  }
}

function getNodeContent(name: string) {
  const label = screen.getByText(name)
  const content = label.closest('.category-tree-node-content')
  expect(content).not.toBeNull()
  return content as HTMLElement
}

async function clickMenuItem(label: string) {
  // PrimeReact ContextMenu portals to document.body.
  const item = await waitFor(() => {
    const found = Array.from(
      document.querySelectorAll('.p-contextmenu .p-menuitem-text')
    ).find(el => el.textContent === label)
    expect(found).toBeTruthy()
    return found as HTMLElement
  })
  fireEvent.click(item)
}

describe('CategoryTreePanel selection', () => {
  // Regression: selectionKeys was passed as a `{ key: true }` map, which
  // PrimeReact Tree only understands in multiple/checkbox modes - in
  // selectionMode="single" it expects the key string, so the active
  // category silently never got its p-highlight tint (shipped bug).
  it('highlights the active category node', () => {
    renderPanel({ activeCategoryId: 2 })

    const highlighted = document.querySelector(
      '.category-tree .p-highlight .p-treenode-content, .category-tree .p-treenode-content.p-highlight'
    )
    expect(highlighted).not.toBeNull()
    expect(highlighted!.textContent).toContain('Props')
  })

  it('does not highlight any tree node when the unassigned bucket is active', () => {
    renderPanel({ activeCategoryId: UNASSIGNED_CATEGORY_ID })

    expect(document.querySelector('.category-tree .p-highlight')).toBeNull()
    expect(
      document.querySelector('.category-tree-unassigned')!.className
    ).toContain('is-active')
  })

  // Contract with getSelectedTreeId: node keys are String(id) and clicking a
  // node must surface the numeric id - catches key-format drift between
  // buildCategoryTree and the selection plumbing.
  it('reports the clicked category id', async () => {
    const user = userEvent.setup()
    const { onCategoryChange } = renderPanel()

    await user.click(screen.getByText('Environment'))

    expect(onCategoryChange).toHaveBeenCalledWith(1)
  })

  // The "All" bucket must report its sentinel id (not a real category id) so
  // list pages can widen the filter to every asset.
  it('reports the all-categories sentinel when the All row is clicked and highlights it when active', async () => {
    const user = userEvent.setup()
    const { onCategoryChange } = renderPanel({
      activeCategoryId: ALL_CATEGORIES_ID,
    })

    const allRow = document.querySelector('.category-tree-all') as HTMLElement
    expect(allRow.className).toContain('is-active')
    expect(document.querySelector('.category-tree .p-highlight')).toBeNull()

    await user.click(allRow)
    expect(onCategoryChange).toHaveBeenCalledWith(ALL_CATEGORIES_ID)
  })

  // The old "No categories yet." message was redundant next to the
  // ever-present All/Unassigned buckets and was removed on purpose.
  it('renders no empty-state text when there are no categories', () => {
    renderPanel({ panelCategories: [] })

    expect(screen.queryByText(/no categories/i)).toBeNull()
    expect(document.querySelector('.category-tree-all')).not.toBeNull()
    expect(document.querySelector('.category-tree-unassigned')).not.toBeNull()
  })
})

describe('CategoryTreePanel context-menu management', () => {
  // Right-clicking the panel background offers "Add category"; committing the
  // inline input must call onCreateCategory with a null parent (root).
  it('creates a root category from the background context menu', async () => {
    const user = userEvent.setup()
    const { onCreateCategory } = renderPanel()

    fireEvent.contextMenu(
      document.querySelector('.category-tree-panel') as HTMLElement
    )
    await clickMenuItem('Add category')

    const input = await screen.findByRole('textbox', {
      name: 'Category name',
    })
    await user.type(input, 'Ambient{Enter}')

    expect(onCreateCategory).toHaveBeenCalledWith('Ambient', null)
  })

  // Right-clicking a category offers "Add subcategory"; the new name must be
  // created under that category, not at the root.
  it('creates a subcategory under the right-clicked category', async () => {
    const user = userEvent.setup()
    const { onCreateCategory } = renderPanel()

    fireEvent.contextMenu(getNodeContent('Props'))
    await clickMenuItem('Add subcategory')

    const input = await screen.findByRole('textbox', {
      name: 'Category name',
    })
    await user.type(input, 'Crates{Enter}')

    expect(onCreateCategory).toHaveBeenCalledWith('Crates', 2)
  })

  // Regression: PrimeReact Tree ignores expandedKeys updates when no
  // onToggle is set (uncontrolled after the first render), so a childless
  // category gaining its first child - the create placeholder - stayed
  // collapsed and the inline editor never appeared (caught by e2e).
  it('shows the inline editor when adding a subcategory to a childless category', async () => {
    const user = userEvent.setup()
    const { onCreateCategory } = renderPanel()

    // "Environment" (id 1) has no children.
    fireEvent.contextMenu(getNodeContent('Environment'))
    await clickMenuItem('Add subcategory')

    const input = await screen.findByRole('textbox', {
      name: 'Category name',
    })
    await user.type(input, 'Forests{Enter}')

    expect(onCreateCategory).toHaveBeenCalledWith('Forests', 1)
  })

  it('renames a category via the context menu inline editor', async () => {
    const user = userEvent.setup()
    const { onRenameCategory } = renderPanel()

    fireEvent.contextMenu(getNodeContent('Environment'))
    await clickMenuItem('Rename')

    const input = await screen.findByRole('textbox', {
      name: 'Category name',
    })
    // The current name is prefilled and selected; typing replaces it.
    expect((input as HTMLInputElement).value).toBe('Environment')
    await user.clear(input)
    await user.type(input, 'Nature{Enter}')

    expect(onRenameCategory).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      'Nature'
    )
  })

  // Escape must abandon the edit without firing the callback - otherwise a
  // stray keypress could create/rename categories.
  it('cancels the inline editor on Escape without calling back', async () => {
    const user = userEvent.setup()
    const { onCreateCategory } = renderPanel()

    fireEvent.contextMenu(getNodeContent('Props'))
    await clickMenuItem('Add subcategory')

    const input = await screen.findByRole('textbox', {
      name: 'Category name',
    })
    await user.type(input, 'Half-typed{Escape}')

    expect(onCreateCategory).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Category name' })).toBeNull()
  })

  // Deleting a branch is destructive: the confirmation must spell out the
  // subcategory count and how many assets become uncategorized, and the
  // callback fires only after the user accepts.
  it('warns about the branch before deleting and calls back on accept', async () => {
    const { onDeleteCategory } = renderPanel()

    fireEvent.contextMenu(getNodeContent('Props'))
    await clickMenuItem('Delete')

    const dialog = await waitFor(() => {
      const el = document.querySelector('.p-confirm-dialog')
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    // Props has one subcategory (Rocks) and 8 direct sounds in the counts map.
    expect(dialog.textContent).toContain(
      'Delete "Props" and its 1 subcategory?'
    )
    expect(dialog.textContent).toContain('8 sounds will become uncategorized.')
    expect(onDeleteCategory).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDeleteCategory).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 })
    )
  })
})
