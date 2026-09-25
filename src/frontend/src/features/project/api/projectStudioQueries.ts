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

export function useProjectReferencesQuery(
  projectId: number,
  options: { levelId?: number; characterId?: number } = {}
) {
  return useQuery({
    queryKey: ['projects', projectId, 'references', options],
    queryFn: () => getProjectReferences(projectId, options),
  })
}
