import {
  type ProjectCommentTarget,
  type ProjectCommentTargetIds,
  type ProjectCommentTargetKind,
} from './api/projectStudioApi'

/**
 * Pure helpers over a comment's target, kept out of the api module so a test
 * that mocks the HTTP calls still gets the real logic.
 */
export const PROJECT_COMMENT_TARGET_KINDS: ProjectCommentTargetKind[] = [
  'levelId',
  'referenceImageId',
  'characterId',
  'modelId',
  'textureSetId',
  'spriteId',
  'soundId',
  'environmentMapId',
  'vfxId',
]

/** What a comment is about, or null for a project-wide comment. */
export function commentTarget(
  comment: Partial<ProjectCommentTargetIds>
): ProjectCommentTarget | null {
  for (const kind of PROJECT_COMMENT_TARGET_KINDS) {
    const id = comment[kind]
    if (id !== null && id !== undefined) return { kind, id }
  }
  return null
}

/** The request fields that address `target`; empty for a project comment. */
export function commentTargetFields(
  target: ProjectCommentTarget | null
): Partial<ProjectCommentTargetIds> {
  return target ? { [target.kind]: target.id } : {}
}

/** True when `comment` is about exactly `target` (null: the project itself). */
export function isCommentOn(
  comment: Partial<ProjectCommentTargetIds>,
  target: ProjectCommentTarget | null
): boolean {
  const own = commentTarget(comment)
  if (own === null || target === null) return own === target
  return own.kind === target.kind && own.id === target.id
}
