import type {
  ProjectCharacterDto,
  ProjectCommentDto,
  ProjectCommentTargetKind,
  ProjectLevelDto,
  ProjectReferenceDto,
} from '../api/projectStudioApi'
import { commentTarget } from '../commentTargets'

/** Names of the project's own assets, for saying what a comment is about. */
export type ProjectAssetNames = Partial<
  Record<
    'models' | 'textureSets' | 'sprites' | 'sounds' | 'environmentMaps' | 'vfx',
    Array<{ id: number; name: string }>
  >
>

const TARGET_LABELS: Record<ProjectCommentTargetKind, string> = {
  levelId: 'Level',
  referenceImageId: 'Reference',
  characterId: 'Character',
  modelId: 'Model',
  textureSetId: 'Texture set',
  spriteId: 'Sprite',
  soundId: 'Sound',
  environmentMapId: 'Environment map',
  vfxId: 'VFX',
}

/**
 * What a comment is about, in words rather than ids.
 *
 * Resolving the names needs the levels, characters, references and assets the
 * studio already has, so a comment that pointed at "Level #4" said nothing a
 * user could act on - and the target is the whole point of a comment.
 *
 * Kept out of the section component so it can be unit-tested without mounting
 * the studio (and so the component module only exports components).
 */
export function commentTargetLabel(
  comment: ProjectCommentDto,
  levels: ProjectLevelDto[],
  characters: ProjectCharacterDto[],
  references: ProjectReferenceDto[],
  assets: ProjectAssetNames
): string {
  const target = commentTarget(comment)
  if (!target) return 'Project'

  const named = (items?: Array<{ id: number; name: string }>) =>
    items?.find(item => item.id === target.id)?.name
  const name: Partial<Record<ProjectCommentTargetKind, string | undefined>> = {
    levelId: named(levels),
    characterId: named(characters),
    referenceImageId: (() => {
      const reference = references.find(item => item.id === target.id)
      return reference ? reference.title || reference.fileName : undefined
    })(),
    modelId: named(assets.models),
    textureSetId: named(assets.textureSets),
    spriteId: named(assets.sprites),
    soundId: named(assets.sounds),
    environmentMapId: named(assets.environmentMaps),
    vfxId: named(assets.vfx),
  }
  return `${TARGET_LABELS[target.kind]}: ${name[target.kind] ?? `#${target.id}`}`
}
