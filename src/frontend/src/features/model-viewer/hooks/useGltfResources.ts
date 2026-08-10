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
 * 404 — and the shared safe loading manager then substitutes a transparent pixel for
 * every one of them, which for `scene.bin` means no geometry at all. Feeding the loader
 * this map is what makes an imported multi-file glTF actually open in the browser.
 *
 * Returns an empty map for packed `.glb`/self-contained files: the query is only run
 * when there is a version to ask about, and a version with no auxiliaries answers with
 * an empty list.
 */
export function useGltfResources(
  modelId: number | string | undefined | null,
  versionId: number | string | undefined | null,
  enabled = true
): { resources: GltfResourceMap; isLoading: boolean } {
  const shouldFetch = Boolean(enabled && modelId && versionId)

  const { data, isLoading } = useQuery({
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

  return { resources, isLoading: shouldFetch && isLoading }
}
