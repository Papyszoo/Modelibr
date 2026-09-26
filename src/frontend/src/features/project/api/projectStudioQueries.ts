import { useQuery } from '@tanstack/react-query'

import {
  getProductionNotes,
  getProjectCharacters,
  getProjectLevels,
  getProjectReferences,
} from './projectStudioApi'

export function useProjectLevelsQuery(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'levels'],
    queryFn: () => getProjectLevels(projectId),
  })
}

export function useProjectCharactersQuery(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'characters'],
    queryFn: () => getProjectCharacters(projectId),
  })
}

export function useProductionNotesQuery(
  projectId: number,
  options: {
    levelId?: number
    referenceImageId?: number
    characterId?: number
    isPinned?: boolean
  } = {}
) {
  return useQuery({
    queryKey: ['projects', projectId, 'production-notes', options],
    queryFn: () => getProductionNotes(projectId, options),
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
