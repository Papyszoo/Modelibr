import { useQuery } from '@tanstack/react-query'

import {
  getProductionNotes,
  getProjectLevels,
  getProjectReferences,
} from './projectStudioApi'

export function useProjectLevelsQuery(projectId: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'levels'],
    queryFn: () => getProjectLevels(projectId),
  })
}

export function useProductionNotesQuery(
  projectId: number,
  options: { levelId?: number; isPinned?: boolean } = {}
) {
  return useQuery({
    queryKey: ['projects', projectId, 'production-notes', options],
    queryFn: () => getProductionNotes(projectId, options),
  })
}

export function useProjectReferencesQuery(projectId: number, levelId?: number) {
  return useQuery({
    queryKey: ['projects', projectId, 'references', levelId ?? null],
    queryFn: () => getProjectReferences(projectId, levelId),
  })
}
