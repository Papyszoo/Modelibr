import { type TreeNode } from 'primereact/treenode'

import { type HierarchicalCategory } from '@/shared/types/categories'

function groupByParent<TCategory extends HierarchicalCategory>(
  categories: TCategory[]
): Map<number | null, TCategory[]> {
  const grouped = new Map<number | null, TCategory[]>()

  for (const category of categories) {
    const key = category.parentId ?? null
    const siblings = grouped.get(key) ?? []
    siblings.push(category)
    grouped.set(key, siblings)
  }

  for (const siblings of grouped.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name))
  }

  return grouped
}

function buildNodes<TCategory extends HierarchicalCategory>(
  grouped: Map<number | null, TCategory[]>,
  parentId: number | null
): TreeNode[] {
  return (grouped.get(parentId) ?? []).map(category => ({
    key: String(category.id),
    label: category.name,
    data: category,
    selectable: true,
    children: buildNodes(grouped, category.id),
  }))
}

export function buildCategoryTree<TCategory extends HierarchicalCategory>(
  categories: TCategory[],
  excludedIds?: Set<number>
): TreeNode[] {
  const filteredCategories = excludedIds
    ? categories.filter(category => !excludedIds.has(category.id))
    : categories

  return buildNodes(groupByParent(filteredCategories), null)
}

export function filterCategoryTree(
  nodes: TreeNode[],
  query: string
): TreeNode[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return nodes
  }

  const filterNode = (node: TreeNode): TreeNode | null => {
    const filteredChildren = (node.children ?? [])
      .map(filterNode)
      .filter((child): child is TreeNode => child !== null)
    const label = String(node.label ?? '').toLowerCase()

    if (label.includes(normalizedQuery) || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      }
    }

    return null
  }

  return nodes.map(filterNode).filter((node): node is TreeNode => node !== null)
}

export function findCategoryById<TCategory extends HierarchicalCategory>(
  categories: TCategory[],
  categoryId?: number | null
): TCategory | null {
  if (!categoryId) {
    return null
  }

  return categories.find(category => category.id === categoryId) ?? null
}

export function buildExpandedKeys(nodes: TreeNode[]): Record<string, boolean> {
  const expandedKeys: Record<string, boolean> = {}

  const visit = (treeNodes: TreeNode[]) => {
    for (const node of treeNodes) {
      if (node.key && node.children && node.children.length > 0) {
        expandedKeys[String(node.key)] = true
        visit(node.children)
      }
    }
  }

  visit(nodes)
  return expandedKeys
}

export function collectCategoryBranchIds<
  TCategory extends HierarchicalCategory,
>(categories: TCategory[], rootId: number): Set<number> {
  const grouped = groupByParent(categories)
  const branchIds = new Set<number>()

  const visit = (categoryId: number) => {
    if (branchIds.has(categoryId)) {
      return
    }

    branchIds.add(categoryId)

    for (const child of grouped.get(categoryId) ?? []) {
      visit(child.id)
    }
  }

  visit(rootId)
  return branchIds
}

export function getSelectedTreeId(
  value: string | Record<string, boolean> | null | undefined
): number | null {
  if (!value) {
    return null
  }

  const rawKey =
    typeof value === 'string' ? value : (Object.keys(value)[0] ?? null)

  return rawKey ? Number(rawKey) : null
}

export function buildCategoryBranchCounts<
  TCategory extends HierarchicalCategory,
>(
  categories: TCategory[],
  itemCategoryIds: Array<number | null | undefined>
): Map<number, number> {
  const directCounts = new Map<number, number>()

  for (const categoryId of itemCategoryIds) {
    if (categoryId == null) {
      continue
    }

    directCounts.set(categoryId, (directCounts.get(categoryId) ?? 0) + 1)
  }

  const grouped = groupByParent(categories)
  const branchCounts = new Map<number, number>()

  const visit = (categoryId: number): number => {
    const currentCount = directCounts.get(categoryId) ?? 0
    const childrenCount = (grouped.get(categoryId) ?? []).reduce(
      (sum, child) => sum + visit(child.id),
      0
    )
    const total = currentCount + childrenCount
    branchCounts.set(categoryId, total)
    return total
  }

  for (const category of grouped.get(null) ?? []) {
    visit(category.id)
  }

  return branchCounts
}
