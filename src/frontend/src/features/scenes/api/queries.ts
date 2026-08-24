import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { ApiClientError } from '@/lib/apiBase'
import { type QueryConfig } from '@/lib/react-query'
import { useSceneLinkHoldStore } from '@/stores'

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
      invalidateSceneWrite(queryClient, input.sceneId)
    },
  })
}

/**
 * When the scene's cached detail was last successfully fetched, or 0.
 *
 * Recorded when a write settles so the hold can insist on data fetched AFTER it:
 * a cache entry from before the write looks every bit as authoritative and is
 * about a scene that no longer exists.
 */
function sceneFetchedAt(
  queryClient: ReturnType<typeof useQueryClient>,
  sceneId: number
): number {
  return (
    queryClient.getQueryState(['scenes', 'detail', sceneId])?.dataUpdatedAt ?? 0
  )
}

/**
 * What every direct scene write invalidates. Extracted so the project-link
 * mutation - which needs its own callbacks and cannot use the helper above -
 * cannot drift from the writes it is serialised against.
 */
function invalidateSceneWrite(
  queryClient: ReturnType<typeof useQueryClient>,
  sceneId: number
) {
  void queryClient.invalidateQueries({
    queryKey: ['scenes', 'slots', sceneId],
  })
  void queryClient.invalidateQueries({
    queryKey: ['scenes', 'detail', sceneId],
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

/**
 * True when a failed link write is KNOWN to have changed nothing on the server.
 *
 * Only a request the server itself answered and refused qualifies: a validation
 * error, a missing scene, a conflict, a rejected token. Everything else - a
 * network error, a timeout, a 5xx, an error object this client does not
 * recognise - reached an unknown point in the write and may have committed. That
 * distinction is the whole of what makes releasing the hold safe, so the default
 * is the careful one: unknown means unknown.
 *
 * 408 is deliberately not in the refusal set: a request timeout says the server
 * gave up waiting, not that it declined to act.
 */
export function isDefiniteLinkRefusal(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) {
    return false
  }

  if (error.isNetworkError || error.isTimeout || error.isOffline) {
    return false
  }

  return (
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408
  )
}

/**
 * Links a scene to a project, or clears the link.
 *
 * <p>
 * Unlike the other slot writes this one drives the scene's <b>serialization
 * hold</b> (see `sceneLinkHoldStore`), and it does so from the mutation rather
 * than from the control that renders the dropdown. Reporting the mutation's
 * status up to a component was the previous design and it lost the hold in three
 * ways: the component could unmount mid-write, a transport error looked exactly
 * like a refusal, and the revision the server had just reported was thrown away
 * instead of being the thing the editor waited for.
 * </p>
 *
 * <p>
 * Here the hold is opened before the request goes out and settled by the
 * request's own outcome, so it exists for exactly as long as the write is
 * unresolved - no matter what is mounted.
 * </p>
 */
export function useSetSceneProjectMutation() {
  const queryClient = useQueryClient()

  // Read imperatively rather than subscribed: these callbacks only ever WRITE the
  // hold, and subscribing would re-render the control that owns this mutation
  // every time any scene's hold moved.
  const hold = () => useSceneLinkHoldStore.getState()

  return useMutation({
    mutationFn: (input: { sceneId: number; projectId: number | null }) =>
      setSceneProject(input.sceneId, input.projectId),

    // Before the request, not after: a hold opened on the response would leave
    // the whole in-flight window unguarded.
    onMutate: input => {
      hold().begin(input.sceneId)
    },

    onSuccess: (result, input) => {
      // The revision the server produced, taken from its own answer, together
      // with how fresh the scene data was at this moment. Waiting for "some
      // refetch to land" instead was how a hold could release on a stale read
      // that happened to arrive at the right time.
      hold().applied(
        input.sceneId,
        result.revision,
        sceneFetchedAt(queryClient, input.sceneId)
      )
      invalidateSceneWrite(queryClient, input.sceneId)
    },

    onError: (error, input) => {
      if (isDefiniteLinkRefusal(error)) {
        // The server answered and said no. Nothing moved, nothing is coming, and
        // holding the editor for a refetch that will never be queued is how it
        // used to go read-only for the rest of the session.
        hold().release(input.sceneId)
        return
      }

      // Unknown. The write may be durable, so the hold stays and turns into a
      // reconciliation: the scene is refetched and editing resumes only once the
      // draft sits on whatever the server actually has.
      hold().ambiguous(
        input.sceneId,
        sceneFetchedAt(queryClient, input.sceneId)
      )
      invalidateSceneWrite(queryClient, input.sceneId)
    },
  })
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
