import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { sceneResourceKey } from '../lib/sceneResourceKey'
import type { SceneAssetRef, SceneDocument } from '../types'

export interface SceneResourceQueue {
  keys: string[]
  nodeIdsByKey: Map<string, string[]>
  keyByNodeId: Map<string, string>
  signature: string
}

interface AdmissionState {
  signature: string
  completedKeys: Set<string>
  failedKeys: Set<string>
  activeKey: string | null
}

export interface SceneResourceAdmission {
  isAdmitted: (asset: SceneAssetRef | null | undefined) => boolean
  onNodeSettled: (nodeId: string, loaded: boolean) => void
  activeResourceKey: string | null
  admittedResourceCount: number
  completedResourceCount: number
  failedResourceCount: number
  resourceCount: number
  resourceSignature: string
}

/**
 * Builds the stable unique-resource queue behind progressive scene loading.
 *
 * The queue is membership, not order: it records which unique resources exist and which
 * nodes place each one. What loads next is decided by selection first and then by the
 * camera-aware ranking in `lib/sceneResourcePriority`, with document order surviving only
 * as the deterministic fallback. Repeated placements share one queue entry but all of
 * their nodes must commit before the next resource is promoted, because cloning and
 * material application also consume frame time.
 */
export function buildSceneResourceQueue(
  document: SceneDocument
): SceneResourceQueue {
  const keys: string[] = []
  const nodeIdsByKey = new Map<string, string[]>()
  const keyByNodeId = new Map<string, string>()

  for (const node of document.nodes) {
    if (!node.asset) {
      continue
    }

    const key = sceneResourceKey(node.asset)
    const nodeIds = nodeIdsByKey.get(key)
    if (nodeIds) {
      nodeIds.push(node.id)
    } else {
      keys.push(key)
      nodeIdsByKey.set(key, [node.id])
    }
    keyByNodeId.set(node.id, key)
  }

  return {
    keys,
    nodeIdsByKey,
    keyByNodeId,
    signature: keys
      .map(key => `${key}=${nodeIdsByKey.get(key)?.join(',') ?? ''}`)
      .join('|'),
  }
}

/**
 * The next not-yet-completed resource, or null when the queue is settled.
 *
 * Selection wins outright: the user looking at a node is a stronger signal than anything
 * the camera can infer. After that the camera-aware ranking decides, and document order
 * is the fallback for a resource the ranking has not seen yet - a node placed while the
 * camera was still moving, for example, which must not silently drop out of the queue.
 */
export function nextSceneResourceKey(
  queue: SceneResourceQueue,
  completedKeys: ReadonlySet<string>,
  preferredKey?: string | null,
  rankedKeys?: readonly string[] | null
): string | null {
  if (preferredKey && !completedKeys.has(preferredKey)) {
    return preferredKey
  }

  if (rankedKeys?.length) {
    const queueKeys = new Set(queue.keys)
    const ranked = rankedKeys.find(
      key => queueKeys.has(key) && !completedKeys.has(key)
    )
    if (ranked) {
      return ranked
    }
  }

  return queue.keys.find(key => !completedKeys.has(key)) ?? null
}

function initialState(
  queue: SceneResourceQueue,
  preferredKey?: string | null,
  rankedKeys?: readonly string[] | null
): AdmissionState {
  return {
    signature: queue.signature,
    completedKeys: new Set<string>(),
    failedKeys: new Set<string>(),
    activeKey: nextSceneResourceKey(queue, new Set(), preferredKey, rankedKeys),
  }
}

/**
 * Carries settled and in-flight work across an edit that changes the resource queue.
 *
 * Placing a node selects it, so rebuilding from scratch here would admit the new selected
 * resource while the previous request is still in flight. Keep that active resource until
 * it settles; selection only chooses among work that has not started yet.
 */
export function reconcileSceneResourceAdmission(
  state: AdmissionState,
  queue: SceneResourceQueue,
  preferredKey?: string | null,
  rankedKeys?: readonly string[] | null
): AdmissionState {
  const queueKeys = new Set(queue.keys)
  const completedKeys = new Set(
    [...state.completedKeys].filter(key => queueKeys.has(key))
  )
  const failedKeys = new Set(
    [...state.failedKeys].filter(key => queueKeys.has(key))
  )
  const retainedActiveKey =
    state.activeKey &&
    queueKeys.has(state.activeKey) &&
    !completedKeys.has(state.activeKey)
      ? state.activeKey
      : null

  return {
    signature: queue.signature,
    completedKeys,
    failedKeys,
    activeKey:
      retainedActiveKey ??
      nextSceneResourceKey(queue, completedKeys, preferredKey, rankedKeys),
  }
}

/**
 * Admits one unique scene resource to the expensive Three.js loader path at a time.
 *
 * Bounds do not pass through this gate; only the source prop does. When all placements of
 * the active resource have loaded or failed, the hook keeps that resource mounted and
 * waits one animation frame before admitting the next. Replacing the draft cancels a
 * queued promotion and starts a fresh queue, which is required for candidate previews.
 */
export function useSceneResourceAdmission(
  document: SceneDocument,
  enabled = true,
  paused = false,
  preferredNodeId?: string | null,
  rankedKeys?: readonly string[] | null
): SceneResourceAdmission {
  const queue = useMemo(() => buildSceneResourceQueue(document), [document])
  const preferredKey = preferredNodeId
    ? (queue.keyByNodeId.get(preferredNodeId) ?? null)
    : null
  // A scene's first promotion is in document order in practice: no camera exists until
  // the Canvas has mounted, so the ranking is still empty here. Waiting a frame for one
  // would delay every scene's first resource to buy ordering for exactly one of them.
  const [state, setState] = useState<AdmissionState>(() =>
    initialState(queue, preferredKey, rankedKeys)
  )
  const settledNodes = useRef(new Map<string, Map<string, boolean>>())
  const frameRequest = useRef<number | null>(null)
  const pausedRef = useRef(paused)
  const preferredKeyRef = useRef(preferredKey)
  const rankedKeysRef = useRef(rankedKeys)
  pausedRef.current = paused
  preferredKeyRef.current = preferredKey
  rankedKeysRef.current = rankedKeys

  const currentState =
    state.signature === queue.signature
      ? state
      : reconcileSceneResourceAdmission(state, queue, preferredKey, rankedKeys)

  useEffect(() => {
    const retainedSettlements = new Map<string, Map<string, boolean>>()
    for (const [key, nodeSettlements] of settledNodes.current) {
      const expectedNodeIds = new Set(queue.nodeIdsByKey.get(key) ?? [])
      if (expectedNodeIds.size === 0) {
        continue
      }

      retainedSettlements.set(
        key,
        new Map(
          [...nodeSettlements].filter(([nodeId]) => expectedNodeIds.has(nodeId))
        )
      )
    }
    settledNodes.current = retainedSettlements
    setState(previous =>
      reconcileSceneResourceAdmission(
        previous,
        queue,
        preferredKeyRef.current,
        rankedKeysRef.current
      )
    )

    return () => {
      if (frameRequest.current !== null) {
        cancelAnimationFrame(frameRequest.current)
        frameRequest.current = null
      }
    }
    // A transform edit creates a new document and queue object, but it must not restart
    // resource admission. Only the identity and placement set encoded by the signature
    // changes what this scheduler owns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.signature])

  const onNodeSettled = useCallback(
    (nodeId: string, loaded: boolean) => {
      const key = queue.keyByNodeId.get(nodeId)
      if (!key || currentState.activeKey !== key) {
        return
      }

      const settledForKey =
        settledNodes.current.get(key) ?? new Map<string, boolean>()
      settledForKey.set(nodeId, loaded)
      settledNodes.current.set(key, settledForKey)

      const expectedNodeIds = queue.nodeIdsByKey.get(key) ?? []
      if (!expectedNodeIds.every(expectedId => settledForKey.has(expectedId))) {
        return
      }

      const completedKeys = new Set(currentState.completedKeys)
      completedKeys.add(key)
      const failedKeys = new Set(currentState.failedKeys)
      if (expectedNodeIds.some(expectedId => !settledForKey.get(expectedId))) {
        failedKeys.add(key)
      }
      setState({
        signature: queue.signature,
        completedKeys,
        failedKeys,
        activeKey: null,
      })

      frameRequest.current = requestAnimationFrame(() => {
        frameRequest.current = null
        setState(previous => {
          if (previous.signature !== queue.signature) {
            return previous
          }

          return {
            ...previous,
            activeKey: pausedRef.current
              ? null
              : nextSceneResourceKey(
                  queue,
                  previous.completedKeys,
                  preferredKeyRef.current,
                  rankedKeysRef.current
                ),
          }
        })
      })
    },
    [
      currentState.activeKey,
      currentState.completedKeys,
      currentState.failedKeys,
      queue,
    ]
  )

  useEffect(() => {
    if (
      !enabled ||
      paused ||
      currentState.activeKey !== null ||
      currentState.completedKeys.size >= queue.keys.length ||
      frameRequest.current !== null
    ) {
      return
    }

    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = null
      setState(previous =>
        previous.signature === queue.signature
          ? {
              ...previous,
              activeKey: nextSceneResourceKey(
                queue,
                previous.completedKeys,
                preferredKeyRef.current,
                rankedKeysRef.current
              ),
            }
          : previous
      )
    })
  }, [
    currentState.activeKey,
    currentState.completedKeys,
    enabled,
    paused,
    queue,
  ])

  const isAdmitted = useCallback(
    (asset: SceneAssetRef | null | undefined) => {
      if (!enabled || !asset) {
        return false
      }

      const key = sceneResourceKey(asset)
      return (
        currentState.activeKey === key || currentState.completedKeys.has(key)
      )
    },
    [currentState.activeKey, currentState.completedKeys, enabled]
  )

  return {
    isAdmitted,
    onNodeSettled,
    activeResourceKey: enabled ? currentState.activeKey : null,
    admittedResourceCount:
      currentState.completedKeys.size +
      (enabled && currentState.activeKey !== null ? 1 : 0),
    completedResourceCount: currentState.completedKeys.size,
    failedResourceCount: currentState.failedKeys.size,
    resourceCount: queue.keys.length,
    resourceSignature: queue.signature,
  }
}
