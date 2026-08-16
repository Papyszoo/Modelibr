import { useQuery } from '@tanstack/react-query'

import {
  getFileUrl,
  getVersionAuxiliaryFiles,
} from '@/features/models/api/modelApi'

/** Map of the relative path a glTF references -> a URL that serves those bytes. */
export type GltfResourceMap = Record<string, string>

/**
 * Resolves a loose `.gltf`'s external resources (its `.bin` buffers and textures) to
 * `/files/<id>` URLs the browser can fetch.
 *
 * A multi-file glTF stores its buffers and images as relative URIs. The viewer serves
 * the primary file from `/files/<id>`, so those URIs resolve against the API route and
 * 404 - and the shared safe loading manager then substitutes a transparent pixel for
 * every one of them, which for `scene.bin` means no geometry at all. Feeding the loader
 * this map is what makes an imported multi-file glTF actually open in the browser.
 *
 * Returns an empty map for packed `.glb`/self-contained files: the query is only run
 * when there is a version to ask about, and a version with no auxiliaries answers with
 * an empty list.
 *
 * `isAwaitingResources` is the caller's gate, and it is deliberately **positive** - it
 * reports that the map has not arrived yet, rather than that a query is in flight. The
 * caller must not start the loader until it is false. `useLoader` caches by URL and
 * caches failures too, so a loose glTF whose loader starts against an empty map
 * permanently caches a load that failed on the missing `.bin`: the model opens as a
 * mesh with zero vertices and never recovers for the life of the page.
 *
 * A negative flag is not good enough here, and this is the exact trap the scene-side
 * gate fell into (see `isAwaitingResources` in `features/scenes`): `enabled` is computed
 * from the model query's data in the same render, so on the tick that data first lands
 * this query has not started - and a query that has not started reports
 * `isLoading: false`. That one tick is all the loader needs.
 *
 * An errored query opens the gate on purpose: the map is never coming, and a visible
 * failure beats a viewport that waits forever.
 */
export function useGltfResources(
  modelId: number | string | undefined | null,
  versionId: number | string | undefined | null,
  enabled = true
): { resources: GltfResourceMap; isAwaitingResources: boolean } {
  const shouldFetch = Boolean(enabled && modelId && versionId)

  const { data, isSuccess, isError } = useQuery({
    queryKey: [
      'model',
      String(modelId),
      'version',
      String(versionId),
      'auxiliary-files',
    ],
    queryFn: () => getVersionAuxiliaryFiles(modelId!, versionId!),
    enabled: shouldFetch,
    // Auxiliary links only change on re-import, so this is effectively static per version.
    staleTime: 5 * 60 * 1000,
  })

  const resources: GltfResourceMap = {}
  for (const auxiliary of data?.auxiliaries ?? []) {
    resources[auxiliary.relativePath] = getFileUrl(String(auxiliary.fileId))
  }

  return {
    resources,
    isAwaitingResources: isAwaitingGltfResources(shouldFetch, {
      isSuccess,
      isError,
    }),
  }
}

/**
 * The gate itself, as a pure function so it can be asserted directly.
 *
 * The failing state is a single render tick inside React Query's scheduling, so
 * a test that reproduced that tick would be testing React Query rather than
 * this rule. Mirrors `isAwaitingResources` in `features/scenes` - the same rule
 * on the scene side, where it was fixed first.
 */
export function isAwaitingGltfResources(
  shouldFetch: boolean,
  query?: { isSuccess?: boolean; isError?: boolean }
): boolean {
  return shouldFetch && !query?.isSuccess && !query?.isError
}
