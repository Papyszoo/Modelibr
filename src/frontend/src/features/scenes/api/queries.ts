import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { type QueryConfig } from '@/lib/react-query'

import type { SceneDocument, SceneRecommendationChoice } from '../types'
import {
  createScene,
  deleteScene,
  getSceneById,
  getScenes,
  getSceneSlots,
  acceptSceneRecommendations,
  rejectSceneCandidates,
  renameScene,
  resolveSceneSlot,
  setSceneProject,
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

/**
 * A scene is written from outside this browser, so it is never served stale.
 *
 * The global default holds a query fresh for five minutes, which is right for a
 * library the user is the only author of. A scene is not that: an agent composes
 * it over MCP while the user has it open, and the whole review loop is the user
 * looking at what the agent just wrote. Reopening the editor and being shown the
 * document from before the agent touched it is the failure that matters here,
 * and no invalidation can cover it - the write never went through this client.
 */
export function getSceneByIdQueryOptions(sceneId: number) {
  return queryOptions({
    queryKey: ['scenes', 'detail', sceneId] as const,
    queryFn: () => getSceneById(sceneId),
    staleTime: 0,
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

/**
 * Slots are the agent's half of the conversation, so they are never served stale
 * either - and for them the five-minute default was worse than stale data. The
 * panel renders nothing at all for a scene with no slots (most scenes have
 * none), so a cache entry captured before the first proposal did not show old
 * candidates, it showed no choices panel, and the decisions the agent had just
 * offered were invisible until the entry aged out.
 */
export function getSceneSlotsQueryOptions(sceneId: number) {
  return queryOptions({
    queryKey: ['scenes', 'slots', sceneId] as const,
    queryFn: () => getSceneSlots(sceneId),
    staleTime: 0,
  })
}

type UseSceneSlotsQueryOptions = {
  sceneId: number
  queryConfig?: QueryConfig<typeof getSceneSlotsQueryOptions>
}

export function useSceneSlotsQuery({
  sceneId,
  queryConfig = {},
}: UseSceneSlotsQueryOptions) {
  return useQuery({
    ...getSceneSlotsQueryOptions(sceneId),
    ...queryConfig,
  })
}

/**
 * Both slot writes invalidate the scene as well as the slots.
 *
 * Choosing a candidate rewrites the slot's node, so the scene the canvas is
 * drawing is genuinely out of date afterwards - and its revision has moved,
 * which the editor's next save compares against. Refetching only the slots
 * would leave the user looking at the asset they just replaced.
 */
function useSlotWriteMutation<TInput extends { sceneId: number }>(
  mutationFn: (input: TInput) => Promise<unknown>
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({
        queryKey: ['scenes', 'slots', input.sceneId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['scenes', 'detail', input.sceneId],
      })
    },
  })
}

export function useResolveSceneSlotMutation() {
  return useSlotWriteMutation(
    (input: {
      sceneId: number
      slotId: string
      candidateId?: string
      clear?: boolean
      expectedRevision?: number
    }) =>
      resolveSceneSlot(input.sceneId, input.slotId, {
        candidateId: input.candidateId,
        clear: input.clear,
        expectedRevision: input.expectedRevision,
      })
  )
}

/**
 * The "Accept N recommendations" action. One call, one revision - the whole reason
 * this is not a loop over `useResolveSceneSlotMutation`.
 */
export function useAcceptSceneRecommendationsMutation() {
  return useSlotWriteMutation(
    (input: {
      sceneId: number
      choices: SceneRecommendationChoice[]
      expectedRevision?: number
    }) =>
      acceptSceneRecommendations(input.sceneId, {
        choices: input.choices,
        expectedRevision: input.expectedRevision,
      })
  )
}

/** Links a scene to a project, or clears the link. */
export function useSetSceneProjectMutation() {
  return useSlotWriteMutation(
    (input: { sceneId: number; projectId: number | null }) =>
      setSceneProject(input.sceneId, input.projectId)
  )
}

export function useRejectSceneCandidatesMutation() {
  return useSlotWriteMutation(
    (input: {
      sceneId: number
      slotId: string
      reason: string
      candidateIds?: string[]
      all?: boolean
      expectedRevision?: number
    }) =>
      rejectSceneCandidates(input.sceneId, input.slotId, {
        reason: input.reason,
        candidateIds: input.candidateIds,
        all: input.all,
        expectedRevision: input.expectedRevision,
      })
  )
}
