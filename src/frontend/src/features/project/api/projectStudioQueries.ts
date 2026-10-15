import { useQuery } from '@tanstack/react-query'

import { getModelsByProject } from './projectApi'
import {
  getProjectCharacters,
  getProjectComments,
  getProjectLevels,
  getProjectReferences,
} from './projectStudioApi'

export function useProjectLevelsQuery(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'levels'],
    queryFn: () => getProjectLevels(projectId),
  })
}

/**
 * The project's explicit model members - the `/models?projectIds=` read behind
 * "add to project", as opposed to anything a Scene happens to place.
 *
 * Two sections want it (the character model's picker, and the level asset view's
 * member group), so it lives here under one key: `['projects', id,
 * 'character-models']`, the name the character section already used. One cache
 * entry, one request per project page. Nothing invalidates it - membership is
 * written from the project asset sections, and this view is a read.
 */
export function useProjectMemberModelsQuery(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'character-models'],
    queryFn: () => getModelsByProject(projectId),
  })
}

export function useProjectCharactersQuery(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'characters'],
    queryFn: () => getProjectCharacters(projectId),
  })
}

/**
 * Every comment in the project, under one key. Each comments badge and thread
 * filters this list by its own target rather than asking for its own slice -
 * a project page shows dozens of badges, and one request answers all of them.
 */
export function useProjectCommentsQuery(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'comments'],
    queryFn: () => getProjectComments(projectId),
  })
}

/**
 * `enabled` exists for the board's "n of m" count: the unfiltered total is
 * only worth a second request while a target filter is active.
 */
export function useProjectReferencesQuery(
  projectId: number,
  options: { levelId?: number; characterId?: number } = {},
  enabled = true
) {
  return useQuery({
    queryKey: ['projects', projectId, 'references', options],
    queryFn: () => getProjectReferences(projectId, options),
    enabled,
  })
}
