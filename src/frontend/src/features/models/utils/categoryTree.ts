import { type TreeNode } from 'primereact/treenode'

import { type ModelCategoryDto } from '@/types'

function groupByParent(
  categories: ModelCategoryDto[]
): Map<number | null, ModelCategoryDto[]> {
  const grouped = new Map<number | null, ModelCategoryDto[]>()

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

function buildNodes(
  grouped: Map<number | null, ModelCategoryDto[]>,
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

export function buildModelCategoryTree(
  categories: ModelCategoryDto[],
  excludedIds?: Set<number>
): TreeNode[] {
  const filteredCategories = excludedIds
    ? categories.filter(category => !excludedIds.has(category.id))
    : categories

  return buildNodes(groupByParent(filteredCategories), null)
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

export function collectCategoryBranchIds(
  categories: ModelCategoryDto[],
  rootId: number
): Set<number> {
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
