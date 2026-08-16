import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import type { SceneDocument } from '../types'
import {
  createScene,
  deleteScene,
  getSceneById,
  getScenes,
  renameScene,
  updateSceneDocument,
} from './scenesApi'

export function getScenesQueryOptions() {
  return queryOptions({
    queryKey: ['scenes'] as const,
    queryFn: () => getScenes(),
  })
}

type UseScenesQueryOptions = {
  queryConfig?: QueryConfig<typeof getScenesQueryOptions>
}

export function useScenesQuery({
  queryConfig = {},
}: UseScenesQueryOptions = {}) {
  return useQuery({
    ...getScenesQueryOptions(),
    ...queryConfig,
  })
}

export function getSceneByIdQueryOptions(sceneId: number) {
  return queryOptions({
    queryKey: ['scenes', 'detail', sceneId] as const,
    queryFn: () => getSceneById(sceneId),
  })
}

type UseSceneByIdQueryOptions = {
  sceneId: number
  queryConfig?: QueryConfig<typeof getSceneByIdQueryOptions>
}

export function useSceneByIdQuery({
  sceneId,
  queryConfig = {},
}: UseSceneByIdQueryOptions) {
  return useQuery({
    ...getSceneByIdQueryOptions(sceneId),
    ...queryConfig,
  })
}

export function useCreateSceneMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createScene,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scenes'] })
    },
  })
}

export function useRenameSceneMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      sceneId: number
      name: string
      description?: string
    }) => renameScene(input.sceneId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scenes'] })
    },
  })
}

export function useDeleteSceneMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteScene,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scenes'] })
    },
  })
}

export function useSaveSceneDocumentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      sceneId: number
      document: SceneDocument
      expectedRevision?: number
    }) =>
      updateSceneDocument(
        input.sceneId,
        input.document,
        input.expectedRevision
      ),
    onSuccess: saved => {
      // The response is the server's own view of the saved scene - overlaps,
      // footprints and the new revision included - so it is seeded rather than
      // refetched. The list needs invalidating for the updated node count.
      queryClient.setQueryData(['scenes', 'detail', saved.scene.id], saved)
      void queryClient.invalidateQueries({ queryKey: ['scenes'] })
    },
  })
}
