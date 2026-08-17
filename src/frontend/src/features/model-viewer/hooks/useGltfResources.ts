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
 *
 * `version` is what the auxiliary query is keyed on, and the gate needs it separately
 * from the query's own state: the versions list is a *second* round trip that starts
 * after the model resolves, so there is a long window in which the model is on screen,
 * its files already name a `.gltf`, and no version is selected yet. The auxiliary query
 * cannot even be enabled during that window, so its state says nothing. Left to the
 * query alone the gate opens for the whole round trip - far more than the one tick
 * above - and the loader starts against an empty map.
 */
export function useGltfResources(
  modelId: number | string | undefined | null,
  versionId: number | string | undefined | null,
  enabled: boolean | undefined,
  version: GltfVersionState
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
    isAwaitingResources: isAwaitingGltfResources(
      Boolean(enabled),
      { isSuccess, isError },
      version
    ),
  }
}

/** Whether the version whose resource map we would fetch is settled yet. */
export interface GltfVersionState {
  /** A version is selected, so the auxiliary query is keyed on something real. */
  isKnown: boolean
  /** No version yet, but one may still arrive - the list is still resolving. */
  isPending: boolean
}

/**
 * The gate itself, as a pure function so it can be asserted directly.
 *
 * The failing state is a single render tick inside React Query's scheduling, so
 * a test that reproduced that tick would be testing React Query rather than
 * this rule. Mirrors `isAwaitingResources` in `features/scenes` - the same rule
 * on the scene side, where it was fixed first.
 *
 * Note what the first argument is and is not. It asks whether this model *may*
 * have external resources - nothing else. Handing it a flag that also folds in
 * "and we know which version to ask about" is what left the gate open for the
 * entire versions round trip: no version means no auxiliary query, which the
 * gate then read as nothing to wait for. Version state is the third argument
 * precisely so it cannot be conflated with looseness again.
 *
 * The scene side never had this half of the bug because it derives its sources
 * from the version's own file list - with no version there is no source to load
 * yet, so its loader cannot start early.
 */
export function isAwaitingGltfResources(
  mayHaveResources: boolean,
  query: { isSuccess?: boolean; isError?: boolean } | undefined,
  version: GltfVersionState
): boolean {
  if (!mayHaveResources) {
    return false
  }

  // No version, so no auxiliary query to consult. Hold only while one may still
  // arrive: a model that settles with no versions has nothing more coming, and
  // holding forever would leave an empty viewport.
  if (!version.isKnown) {
    return version.isPending
  }

  return !query?.isSuccess && !query?.isError
}
