import type { ProjectLevelStatus } from './api/projectStudioApi'

/**
 * A Level's production status, and the only five values it can hold.
 *
 * A closed vocabulary on purpose: a custom-status feature is an explicit
 * non-goal, and a status the app cannot describe is a status the UI has to
 * render as a bare string.
 *
 * Shared rather than declared per component because the studio, the level
 * workspace and the create form all read it, and three copies of a label list is
 * three places for them to disagree.
 */
export const LEVEL_STATUSES: Array<{
  value: ProjectLevelStatus
  label: string
}> = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'Review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

/**
 * The label for a status, falling back to the raw value.
 *
 * The fallback is for a value this build does not know: a status a newer server
 * can store must still render as something readable rather than as a blank.
 */
export function levelStatusLabel(status: string): string {
  return LEVEL_STATUSES.find(entry => entry.value === status)?.label ?? status
}
