import type { ProjectCommentDto } from '../../api/projectStudioApi'
import { commentTargetLabel } from '../commentTargetLabels'

/**
 * Regression: there was no sounds map, so a comment about a sound read
 * "Sound: #id" even when the project's asset names were passed in. The names
 * are read defensively - the API DTO only carries a sound COUNT - so this pins
 * both the resolved and the fallback label.
 */
describe('commentTargetLabel', () => {
  const soundComment = { soundId: 7 } as ProjectCommentDto

  it('names a sound when the project data carries the list', () => {
    expect(
      commentTargetLabel(soundComment, [], [], [], {
        sounds: [{ id: 7, name: 'Footstep' }],
      })
    ).toBe('Sound: Footstep')
  })

  it('falls back to the id when no sound names are available', () => {
    expect(commentTargetLabel(soundComment, [], [], [], {})).toBe('Sound: #7')
  })
})
