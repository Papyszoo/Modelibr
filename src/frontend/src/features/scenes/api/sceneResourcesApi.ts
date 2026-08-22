import { client } from '@/lib/apiBase'

import {
  measureSceneAsync,
  scenePerformanceMeasures,
} from '../lib/scenePerformance'
import { sceneResourceKey } from '../lib/sceneResourceKey'
import type {
  SceneAssetRef,
  SceneResource,
  SceneResourceManifest,
} from '../types'

export async function resolveSceneResources(
  assets: SceneAssetRef[]
): Promise<SceneResourceManifest> {
  const response = await client.post<SceneResourceManifest>(
    '/scenes/resources/resolve',
    { assets }
  )
  return response.data
}

type ManifestSender = (
  assets: SceneAssetRef[]
) => Promise<SceneResourceManifest>

interface PendingResource {
  asset: SceneAssetRef
  resolve: Array<(resource: SceneResource) => void>
  reject: Array<(reason: unknown) => void>
}

/**
 * Coalesces same-tick per-reference React Query misses into one manifest request.
 *
 * Each resource still owns an independent query key. Opening a scene therefore makes one
 * request, while replacing one draft candidate later requests only that new reference and
 * leaves every unchanged cache entry intact.
 */
export class SceneResourceRequestBatcher {
  private pending = new Map<string, PendingResource>()
  private scheduled = false

  constructor(private readonly send: ManifestSender = resolveSceneResources) {}

  load(asset: SceneAssetRef): Promise<SceneResource> {
    return new Promise((resolve, reject) => {
      const key = sceneResourceKey(asset)
      const existing = this.pending.get(key)
      if (existing) {
        existing.resolve.push(resolve)
        existing.reject.push(reject)
      } else {
        this.pending.set(key, { asset, resolve: [resolve], reject: [reject] })
      }

      if (!this.scheduled) {
        this.scheduled = true
        queueMicrotask(() => void this.flush())
      }
    })
  }

  private async flush(): Promise<void> {
    const batch = this.pending
    this.pending = new Map()
    this.scheduled = false

    try {
      const manifest = await measureSceneAsync(
        scenePerformanceMeasures.resourceManifest,
        () => this.send([...batch.values()].map(pending => pending.asset))
      )
      const resources = new Map(
        manifest.resources.map(resource => [
          sceneResourceKey(resource.asset),
          resource,
        ])
      )

      for (const [key, pending] of batch) {
        const resource = resources.get(key)
        if (!resource) {
          const error = new Error(`The scene resource manifest omitted ${key}.`)
          pending.reject.forEach(reject => reject(error))
          continue
        }
        pending.resolve.forEach(resolve => resolve(resource))
      }
    } catch (error) {
      for (const pending of batch.values()) {
        pending.reject.forEach(reject => reject(error))
      }
    }
  }
}

const sceneResourceBatcher = new SceneResourceRequestBatcher()

export function getSceneResource(asset: SceneAssetRef): Promise<SceneResource> {
  return sceneResourceBatcher.load(asset)
}
