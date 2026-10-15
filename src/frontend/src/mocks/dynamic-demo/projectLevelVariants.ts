import type { DemoProject } from './shared'

/**
 * A level row with the character variants scoped to it, as the real endpoints
 * denormalize. The stored level carries neither field, so without this the
 * level card's variant count rendered empty and its cast block was dropped in
 * demo mode only.
 *
 * Kept out of `containerHandlers.ts` so it can be unit-tested without pulling in
 * MSW (which needs a fetch `Response` the jest node environment does not have).
 */
export function levelWithCharacterVariants(
  project: DemoProject,
  level: NonNullable<DemoProject['levels']>[number]
) {
  const variants = (project.characters ?? [])
    .flatMap(character =>
      character.variants.filter(variant => variant.projectLevelId === level.id)
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

  return {
    ...level,
    characterVariantNames: variants.map(variant => variant.name),
    characterVariantCount: variants.length,
  }
}
