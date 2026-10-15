import { levelWithCharacterVariants } from '../projectLevelVariants'
import type { DemoProject } from '../shared'

/**
 * Regression: the demo level handlers returned raw stored level rows, which
 * carry neither `characterVariantNames` nor `characterVariantCount`, so the
 * level card's variant count rendered empty and its cast block was dropped in
 * demo mode only.
 */
describe('levelWithCharacterVariants', () => {
  const level = {
    id: 5,
    projectId: 1,
    name: 'Forest Crossing',
    description: null,
    productionStatus: 'planned' as const,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }

  function projectWith(
    variants: Array<{ name: string; projectLevelId: number | null; id: number }>
  ): DemoProject {
    return {
      characters: [
        {
          id: 1,
          variants: variants.map((variant, index) => ({
            id: variant.id,
            name: variant.name,
            description: null,
            projectLevelId: variant.projectLevelId,
            projectLevelName: null,
            sortOrder: index,
          })),
        },
      ],
    } as unknown as DemoProject
  }

  it('derives the variant names and count scoped to the level', () => {
    const result = levelWithCharacterVariants(
      projectWith([
        { name: 'Frozen', projectLevelId: 5, id: 1 },
        { name: 'Ashen', projectLevelId: 5, id: 2 },
        { name: 'Elsewhere', projectLevelId: 9, id: 3 },
      ]),
      level
    )

    expect(result.characterVariantNames).toEqual(['Frozen', 'Ashen'])
    expect(result.characterVariantCount).toBe(2)
  })

  it('reports zero variants when none are scoped to the level', () => {
    const result = levelWithCharacterVariants(
      projectWith([{ name: 'Elsewhere', projectLevelId: 9, id: 1 }]),
      level
    )

    expect(result.characterVariantNames).toEqual([])
    expect(result.characterVariantCount).toBe(0)
  })
})
